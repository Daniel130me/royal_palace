import type { WorkerServiceConfig } from "@royal-palace/config/environment";
import { Pool } from "pg";
import { v7 as uuidv7 } from "uuid";

import { MAX_SCAN_ATTEMPTS } from "./document-scan-policy.js";

export interface DocumentJob {
  id: string;
  storageObjectKey: string;
  quarantineVersionId: string | null;
  declaredContentType: string;
  declaredSha256: string;
  declaredSizeBytes: number;
  scanAttemptCount: number;
  scanLeaseToken: string;
  resourceKind: "APPLICATION" | "LABORATORY_RESULT_ATTACHMENT" | "SCANNED_PRESCRIPTION";
}

const EXPIRY_SWEEP_BATCH_SIZE = 100;
const SCAN_LEASE_MS = 10 * 60_000;

export class PostgresDocumentJobs {
  private readonly pool: Pool;
  private nextSourceIndex = 0;

  constructor(config: WorkerServiceConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: config.dependencyTimeoutMs,
      max: 2,
      options: "-c timezone=UTC",
    });
  }

  close(): Promise<void> {
    return this.pool.end();
  }

  async claim(): Promise<DocumentJob | null> {
    const sources = documentKinds();
    for (let offset = 0; offset < sources.length; offset += 1) {
      const index = (this.nextSourceIndex + offset) % sources.length;
      const claimed = await this.claimFrom(sources[index]!);
      if (claimed !== null) {
        this.nextSourceIndex = (index + 1) % sources.length;
        return claimed;
      }
    }
    this.nextSourceIndex = (this.nextSourceIndex + 1) % sources.length;
    return null;
  }

  private async claimFrom(resourceKind: DocumentJob["resourceKind"]): Promise<DocumentJob | null> {
    const leaseToken = uuidv7();
    const source = documentSource(resourceKind);
    const result = await this.pool.query<DocumentJob>(
      `UPDATE ${source.table} AS document
       SET status = 'SCANNING', scan_lease_token = $1::uuid,
           scan_lease_expires_at = clock_timestamp() + ($2::integer * interval '1 millisecond'),
           scan_attempt_count = scan_attempt_count + 1,
           status_reason_code = 'SCAN_STARTED',
           updated_at = clock_timestamp(), version = version + 1
       FROM (
         SELECT id FROM ${source.table}
         WHERE scan_attempt_count < $3
           AND ((status = 'QUARANTINED' AND scan_available_at <= clock_timestamp())
             OR (status = 'SCANNING' AND scan_lease_expires_at <= clock_timestamp()))
         ORDER BY scan_available_at, created_at, id
         LIMIT 1 FOR UPDATE SKIP LOCKED
       ) AS claim
       WHERE document.id = claim.id
       RETURNING document.id,
         document.storage_object_key AS "storageObjectKey",
         document.quarantine_version_id AS "quarantineVersionId",
         document.declared_content_type AS "declaredContentType",
         document.declared_sha256 AS "declaredSha256",
         document.declared_size_bytes AS "declaredSizeBytes",
         document.scan_attempt_count AS "scanAttemptCount",
         document.scan_lease_token AS "scanLeaseToken",
         $4::text AS "resourceKind"`,
      [leaseToken, SCAN_LEASE_MS, MAX_SCAN_ATTEMPTS, resourceKind],
    );
    return result.rows[0] ?? null;
  }

  async expirePendingUploads(): Promise<void> {
    await Promise.all(
      documentSources().map((source) =>
        this.pool.query(
          `UPDATE ${source.table} AS document
       SET status = 'REJECTED', status_reason_code = 'UPLOAD_EXPIRED',
           updated_at = clock_timestamp(), version = version + 1
       FROM (
         SELECT id FROM ${source.table}
         WHERE status = 'AWAITING_UPLOAD' AND upload_expires_at <= clock_timestamp()
         ORDER BY upload_expires_at, id
         LIMIT $1 FOR UPDATE SKIP LOCKED
       ) AS expired
       WHERE document.id = expired.id`,
          [EXPIRY_SWEEP_BATCH_SIZE],
        ),
      ),
    );
  }

  async deadLetterExhaustedLeases(): Promise<void> {
    await Promise.all(
      documentSources().map((source) =>
        this.pool.query(
          `UPDATE ${source.table} AS document
       SET status = '${source.failureStatus}', status_reason_code = 'SCAN_RETRY_EXHAUSTED',
           scan_lease_token = NULL, scan_lease_expires_at = NULL,
           scanned_at = clock_timestamp(), updated_at = clock_timestamp(),
           version = version + 1
       FROM (
         SELECT id FROM ${source.table}
         WHERE status = 'SCANNING' AND scan_lease_expires_at <= clock_timestamp()
           AND scan_attempt_count >= $1
         ORDER BY scan_lease_expires_at, id
         LIMIT $2 FOR UPDATE SKIP LOCKED
       ) AS exhausted
       WHERE document.id = exhausted.id`,
          [MAX_SCAN_ATTEMPTS, EXPIRY_SWEEP_BATCH_SIZE],
        ),
      ),
    );
  }

  async markClean(input: {
    job: DocumentJob;
    cleanObjectKey: string;
    cleanVersionId: string | null;
    contentType: string;
    sizeBytes: number;
    sha256Hex: string;
  }): Promise<boolean> {
    const source = documentSource(input.job.resourceKind);
    const result = await this.pool.query(
      `UPDATE ${source.table}
       SET status = 'CLEAN', clean_object_key = $3,
           clean_version_id = $4, detected_content_type = $5,
           verified_size_bytes = $6, verified_sha256 = $7,
           scanned_at = clock_timestamp(), status_reason_code = 'SCAN_CLEAN',
           scan_lease_token = NULL, scan_lease_expires_at = NULL,
           updated_at = clock_timestamp(), version = version + 1
       WHERE id = $1::uuid AND scan_lease_token = $2::uuid AND status = 'SCANNING'`,
      [
        input.job.id,
        input.job.scanLeaseToken,
        input.cleanObjectKey,
        input.cleanVersionId,
        input.contentType,
        input.sizeBytes,
        input.sha256Hex,
      ],
    );
    return result.rowCount === 1;
  }

  async finish(job: DocumentJob, status: "REJECTED" | "SCAN_FAILED", reasonCode: string) {
    const source = documentSource(job.resourceKind);
    const finalStatus = status === "SCAN_FAILED" ? source.failureStatus : "REJECTED";
    await this.pool.query(
      `UPDATE ${source.table}
       SET status = $3::${source.statusType}, status_reason_code = $4,
           scan_lease_token = NULL, scan_lease_expires_at = NULL,
           scanned_at = clock_timestamp(), updated_at = clock_timestamp(), version = version + 1
       WHERE id = $1::uuid AND scan_lease_token = $2::uuid AND status = 'SCANNING'`,
      [job.id, job.scanLeaseToken, finalStatus, reasonCode],
    );
  }

  async retry(job: DocumentJob, backoffMs: number): Promise<void> {
    const source = documentSource(job.resourceKind);
    await this.pool.query(
      `UPDATE ${source.table}
       SET status = 'QUARANTINED', scan_available_at = clock_timestamp() + ($3::integer * interval '1 millisecond'),
           scan_lease_token = NULL, scan_lease_expires_at = NULL,
           status_reason_code = 'SCAN_RETRY_PENDING', updated_at = clock_timestamp(), version = version + 1
       WHERE id = $1::uuid AND scan_lease_token = $2::uuid AND status = 'SCANNING'`,
      [job.id, job.scanLeaseToken, backoffMs],
    );
  }
}

interface DocumentSource {
  failureStatus: "REJECTED" | "SCAN_FAILED";
  statusType: string;
  table: string;
}

function documentSources(): readonly DocumentSource[] {
  return documentKinds().map(documentSource);
}

function documentKinds(): readonly DocumentJob["resourceKind"][] {
  return ["APPLICATION", "SCANNED_PRESCRIPTION", "LABORATORY_RESULT_ATTACHMENT"];
}

function documentSource(resourceKind: DocumentJob["resourceKind"]): DocumentSource {
  if (resourceKind === "APPLICATION") {
    return {
      failureStatus: "SCAN_FAILED",
      statusType: '"ApplicationDocumentStatus"',
      table: "application_documents",
    };
  }
  if (resourceKind === "SCANNED_PRESCRIPTION") {
    return {
      failureStatus: "SCAN_FAILED",
      statusType: '"ScannedPrescriptionStatus"',
      table: "scanned_prescriptions",
    };
  }
  return {
    failureStatus: "REJECTED",
    statusType: '"LaboratoryResultAttachmentStatus"',
    table: "laboratory_result_attachments",
  };
}
