import { createHash, randomUUID } from "node:crypto";

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { S3DocumentStorage } from "../src/onboarding/infrastructure/s3-document-storage.js";
import { testConfig } from "./test-config.js";

const runIntegration = process.env.RUN_OBJECT_STORAGE_INTEGRATION === "true";

describe.skipIf(!runIntegration)("local S3 document contract", () => {
  it("enforces a checksum-bound single upload and a short-lived clean download", async () => {
    const accessKey = process.env.OBJECT_STORAGE_ACCESS_KEY;
    const secretKey = process.env.OBJECT_STORAGE_SECRET_KEY;
    if (!accessKey || !secretKey) throw new Error("Set local object-storage credentials");

    const config = {
      ...testConfig,
      objectStorage: {
        ...testConfig.objectStorage,
        credentials: { accessKey, secretKey },
      },
    };
    const client = new S3Client({
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      endpoint: config.objectStorage.endpoint,
      forcePathStyle: true,
      region: config.objectStorage.region,
    });
    const storage = new S3DocumentStorage(config);
    const bytes = Buffer.from("%PDF-1.4\nsynthetic integration evidence\n%%EOF");
    const checksumHex = createHash("sha256").update(bytes).digest("hex");
    const key = `application-documents/${randomUUID()}`;
    let quarantineVersion: string | undefined;
    let cleanVersion: string | undefined;

    try {
      for (const bucket of [
        config.objectStorage.quarantineBucket,
        config.objectStorage.cleanBucket,
      ]) {
        try {
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch (error) {
          if (!isMissingBucket(error)) throw error;
          await client.send(new CreateBucketCommand({ Bucket: bucket }));
        }
        await client.send(
          new PutBucketVersioningCommand({
            Bucket: bucket,
            VersioningConfiguration: { Status: "Enabled" },
          }),
        );
      }

      const signed = await storage.signUpload({
        contentType: "application/pdf",
        expiresInSeconds: 60,
        key,
        sha256Hex: checksumHex,
      });
      const altered = await fetch(signed.url, {
        body: Buffer.from("%PDF-1.4\naltered content\n%%EOF"),
        headers: signed.headers,
        method: "PUT",
      });
      expect(altered.status).toBe(400);
      const uploaded = await fetch(signed.url, {
        body: bytes,
        headers: signed.headers,
        method: "PUT",
      });
      expect(uploaded.status).toBe(200);
      quarantineVersion = uploaded.headers.get("x-amz-version-id") ?? undefined;
      expect(quarantineVersion).toBeTruthy();
      expect(await storage.inspectQuarantined(key)).toMatchObject({
        checksumSha256: Buffer.from(checksumHex, "hex").toString("base64"),
        contentType: "application/pdf",
        sizeBytes: bytes.length,
      });

      const replay = await fetch(signed.url, {
        body: bytes,
        headers: signed.headers,
        method: "PUT",
      });
      expect(replay.status).toBe(412);

      const clean = await client.send(
        new PutObjectCommand({
          Body: bytes,
          Bucket: config.objectStorage.cleanBucket,
          ChecksumSHA256: Buffer.from(checksumHex, "hex").toString("base64"),
          ContentType: "application/pdf",
          IfNoneMatch: "*",
          Key: key,
        }),
      );
      cleanVersion = clean.VersionId;
      expect(cleanVersion).toBeTruthy();
      const downloadUrl = await storage.signCleanDownload({
        expiresInSeconds: 60,
        key,
        versionId: clean.VersionId ?? null,
      });
      const download = await fetch(downloadUrl);
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
      expect(download.headers.get("content-disposition")).toContain("attachment");
    } finally {
      for (const [bucket, versionId] of [
        [config.objectStorage.quarantineBucket, quarantineVersion],
        [config.objectStorage.cleanBucket, cleanVersion],
      ] as const) {
        if (versionId)
          await client.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }),
          );
      }
      client.destroy();
    }
  });
});

function isMissingBucket(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "NotFound"
  );
}
