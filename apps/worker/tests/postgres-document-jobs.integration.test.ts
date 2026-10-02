import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DocumentScanWorker } from "../src/document-scan/document-scan.worker.js";
import { PostgresDocumentJobs } from "../src/document-scan/postgres-document-jobs.js";
import { testConfig } from "./test-config.js";

const baseUrl = process.env.DOCUMENT_JOBS_DATABASE_URL;
const enabled = baseUrl !== undefined;
const databaseName = `rp_doc_jobs_${randomBytes(6).toString("hex")}`;

describe.skipIf(!enabled)("PostgreSQL document job leasing", () => {
  let admin: Client;
  let fixture: Client;
  let jobs: PostgresDocumentJobs;

  beforeAll(async () => {
    if (baseUrl === undefined) throw new Error("A disposable PostgreSQL connection is required");
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "postgresql:" || !parsed.pathname.endsWith("royal_palace_verify")) {
      throw new Error("Document job integration requires the explicit disposable verifier URL");
    }
    const adminUrl = new URL(parsed);
    adminUrl.pathname = "/postgres";
    admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    parsed.pathname = `/${databaseName}`;
    fixture = new Client({ connectionString: parsed.toString() });
    await fixture.connect();
    await fixture.query(`
      CREATE TYPE "ApplicationDocumentStatus" AS ENUM
        ('AWAITING_UPLOAD', 'QUARANTINED', 'SCANNING', 'CLEAN', 'REJECTED', 'SCAN_FAILED');
      CREATE TABLE application_documents (
        id uuid PRIMARY KEY,
        status "ApplicationDocumentStatus" NOT NULL,
        storage_object_key text NOT NULL,
        quarantine_version_id text,
        clean_object_key text,
        clean_version_id text,
        declared_content_type text NOT NULL,
        declared_sha256 char(64) NOT NULL,
        declared_size_bytes integer NOT NULL,
        detected_content_type text,
        verified_size_bytes integer,
        verified_sha256 char(64),
        upload_expires_at timestamptz,
        scan_available_at timestamptz,
        scan_lease_token uuid,
        scan_lease_expires_at timestamptz,
        scan_attempt_count integer NOT NULL DEFAULT 0,
        status_reason_code text,
        scanned_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1
      )
    `);
    jobs = new PostgresDocumentJobs({ ...testConfig, databaseUrl: parsed.toString() });
  });

  afterAll(async () => {
    if (jobs) await jobs.close();
    if (fixture) await fixture.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await admin.end();
    }
  });

  it("claims once, rejects stale lease updates, retries, and records clean evidence", async () => {
    const id = "0199f323-6e1b-70af-8d8e-e4d2a65cf800";
    const expiredId = "0199f323-6e1b-70af-8d8e-e4d2a65cf801";
    const exhaustedId = "0199f323-6e1b-70af-8d8e-e4d2a65cf802";
    await fixture.query(
      `INSERT INTO application_documents
         (id, status, storage_object_key, declared_content_type, declared_sha256,
          declared_size_bytes, scan_available_at)
       VALUES ($1, 'QUARANTINED', $2, 'application/pdf', $3, 100,
               clock_timestamp() - interval '1 second')`,
      [id, `application-documents/${id}`, "a".repeat(64)],
    );
    await fixture.query(
      `INSERT INTO application_documents
         (id, status, storage_object_key, declared_content_type, declared_sha256,
          declared_size_bytes, upload_expires_at)
       VALUES ($1, 'AWAITING_UPLOAD', $2, 'application/pdf', $3, 100,
               clock_timestamp() - interval '1 second')`,
      [expiredId, `application-documents/${expiredId}`, "a".repeat(64)],
    );
    await fixture.query(
      `INSERT INTO application_documents
         (id, status, storage_object_key, declared_content_type, declared_sha256,
          declared_size_bytes, scan_available_at, scan_lease_token,
          scan_lease_expires_at, scan_attempt_count)
       VALUES ($1, 'SCANNING', $2, 'application/pdf', $3, 100,
               clock_timestamp() - interval '1 hour', $4,
               clock_timestamp() - interval '1 second', 10)`,
      [exhaustedId, `application-documents/${exhaustedId}`, "a".repeat(64), randomUUID()],
    );

    await jobs.expirePendingUploads();
    await jobs.deadLetterExhaustedLeases();
    const expired = await fixture.query<{ status: string; status_reason_code: string }>(
      "SELECT status, status_reason_code FROM application_documents WHERE id = $1",
      [expiredId],
    );
    expect(expired.rows[0]).toMatchObject({
      status: "REJECTED",
      status_reason_code: "UPLOAD_EXPIRED",
    });
    const exhausted = await fixture.query<{ status: string; status_reason_code: string }>(
      "SELECT status, status_reason_code FROM application_documents WHERE id = $1",
      [exhaustedId],
    );
    expect(exhausted.rows[0]).toMatchObject({
      status: "SCAN_FAILED",
      status_reason_code: "SCAN_RETRY_EXHAUSTED",
    });

    const [first, competing] = await Promise.all([jobs.claim(), jobs.claim()]);
    const claim = first ?? competing;
    expect(claim?.id).toBe(id);
    expect([first, competing].filter(Boolean)).toHaveLength(1);
    if (claim === null) throw new Error("Document was not claimed");

    await jobs.retry(claim, 0);
    const second = await jobs.claim();
    expect(second?.id).toBe(id);
    expect(second?.scanAttemptCount).toBe(2);
    if (second === null) throw new Error("Document was not reclaimed");

    expect(
      await jobs.markClean({
        job: claim,
        cleanObjectKey: `application-documents/${id}`,
        cleanVersionId: "stale",
        contentType: "application/pdf",
        sizeBytes: 100,
        sha256Hex: "a".repeat(64),
      }),
    ).toBe(false);
    const before = await fixture.query<{ status: string }>(
      "SELECT status FROM application_documents WHERE id = $1",
      [id],
    );
    expect(before.rows[0]?.status).toBe("SCANNING");

    expect(
      await jobs.markClean({
        job: second,
        cleanObjectKey: `application-documents/${id}`,
        cleanVersionId: "verified",
        contentType: "application/pdf",
        sizeBytes: 100,
        sha256Hex: "a".repeat(64),
      }),
    ).toBe(true);
    const final = await fixture.query<{
      status: string;
      clean_version_id: string;
      scan_attempt_count: number;
    }>(
      "SELECT status, clean_version_id, scan_attempt_count FROM application_documents WHERE id = $1",
      [id],
    );
    expect(final.rows[0]).toMatchObject({
      status: "CLEAN",
      clean_version_id: "verified",
      scan_attempt_count: 2,
    });
    expect(await jobs.claim()).toBeNull();
  });

  it.skipIf(process.env.RUN_DOCUMENT_PIPELINE_INTEGRATION !== "true")(
    "releases a real clean, versioned object only after the malware scan",
    async () => {
      const accessKey = process.env.OBJECT_STORAGE_ACCESS_KEY;
      const secretKey = process.env.OBJECT_STORAGE_SECRET_KEY;
      if (!accessKey || !secretKey || baseUrl === undefined) {
        throw new Error(
          "Local object-storage credentials and the disposable database are required",
        );
      }
      const parsed = new URL(baseUrl);
      parsed.pathname = `/${databaseName}`;
      const config = {
        ...testConfig,
        databaseUrl: parsed.toString(),
        objectStorage: {
          ...testConfig.objectStorage,
          credentials: { accessKey, secretKey },
        },
      };
      const storage = new S3Client({
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        endpoint: config.objectStorage.endpoint,
        forcePathStyle: true,
        region: config.objectStorage.region,
      });
      const worker = new DocumentScanWorker(config);
      const id = randomUUID();
      const key = `application-documents/${id}`;
      const bytes = Buffer.from("%PDF-1.4\nsynthetic scanned evidence\n%%EOF");
      const checksumHex = createHash("sha256").update(bytes).digest("hex");
      const checksumBase64 = Buffer.from(checksumHex, "hex").toString("base64");
      let quarantineVersion: string | undefined;
      let cleanVersion: string | undefined;
      try {
        for (const bucket of [
          config.objectStorage.quarantineBucket,
          config.objectStorage.cleanBucket,
        ]) {
          try {
            await storage.send(new HeadBucketCommand({ Bucket: bucket }));
          } catch (error) {
            if (
              typeof error !== "object" ||
              error === null ||
              !("name" in error) ||
              error.name !== "NotFound"
            )
              throw error;
            await storage.send(new CreateBucketCommand({ Bucket: bucket }));
          }
          await storage.send(
            new PutBucketVersioningCommand({
              Bucket: bucket,
              VersioningConfiguration: { Status: "Enabled" },
            }),
          );
        }
        const quarantine = await storage.send(
          new PutObjectCommand({
            Body: bytes,
            Bucket: config.objectStorage.quarantineBucket,
            ChecksumSHA256: checksumBase64,
            ContentType: "application/pdf",
            IfNoneMatch: "*",
            Key: key,
          }),
        );
        quarantineVersion = quarantine.VersionId;
        expect(quarantineVersion).toBeTruthy();
        await fixture.query(
          `INSERT INTO application_documents
             (id, status, storage_object_key, quarantine_version_id,
              declared_content_type, declared_sha256, declared_size_bytes, scan_available_at)
           VALUES ($1, 'QUARANTINED', $2, $3, 'application/pdf', $4, $5,
                   clock_timestamp() - interval '1 second')`,
          [id, key, quarantineVersion, checksumHex, bytes.length],
        );

        expect(await worker.runOnce()).toBe(true);
        const row = await fixture.query<{
          status: string;
          clean_version_id: string | null;
          status_reason_code: string | null;
        }>(
          "SELECT status, clean_version_id, status_reason_code FROM application_documents WHERE id = $1",
          [id],
        );
        expect(row.rows[0]).toMatchObject({ status: "CLEAN", status_reason_code: null });
        cleanVersion = row.rows[0]?.clean_version_id ?? undefined;
        expect(cleanVersion).toBeTruthy();
        const released = await storage.send(
          new GetObjectCommand({
            Bucket: config.objectStorage.cleanBucket,
            Key: key,
            VersionId: cleanVersion,
          }),
        );
        expect(Buffer.from(await released.Body!.transformToByteArray())).toEqual(bytes);
      } finally {
        await worker.onModuleDestroy();
        for (const [bucket, versionId] of [
          [config.objectStorage.quarantineBucket, quarantineVersion],
          [config.objectStorage.cleanBucket, cleanVersion],
        ] as const) {
          if (versionId)
            await storage.send(
              new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }),
            );
        }
        storage.destroy();
      }
    },
  );
});
