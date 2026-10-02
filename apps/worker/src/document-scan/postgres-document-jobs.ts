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
}

const EXPIRY_SWEEP_BATCH_SIZE = 100;
const SCAN_LEASE_MS = 10 * 60_000;

export class PostgresDocumentJobs {
  private readonly pool: Pool;

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
    const leaseToken = uuidv7();
    const result = await this.pool.query<DocumentJob>(
      `UPDATE application_documents AS document
       SET status = 'SCANNING', scan_lease_token = $1::uuid,
           scan_lease_expires_at = clock_timestamp() + ($2::integer * interval '1 millisecond'),
           scan_attempt_count = scan_attempt_count + 1,
           updated_at = clock_timestamp(), version = version + 1
       FROM (
         SELECT id FROM application_documents
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
         document.scan_lease_token AS "scanLeaseToken"`,
      [leaseToken, SCAN_LEASE_MS, MAX_SCAN_ATTEMPTS],
    );
    return result.rows[0] ?? null;
  }

  async expirePendingUploads(): Promise<void> {
    await this.pool.query(
      `UPDATE application_documents AS document
       SET status = 'REJECTED', status_reason_code = 'UPLOAD_EXPIRED',
           updated_at = clock_timestamp(), version = version + 1
       FROM (
         SELECT id FROM application_documents
         WHERE status = 'AWAITING_UPLOAD' AND upload_expires_at <= clock_timestamp()
         ORDER BY upload_expires_at, id
         LIMIT $1 FOR UPDATE SKIP LOCKED
       ) AS expired
       WHERE document.id = expired.id`,
      [EXPIRY_SWEEP_BATCH_SIZE],
    );
  }

  async deadLetterExhaustedLeases(): Promise<void> {
    await this.pool.query(
      `UPDATE application_documents AS document
       SET status = 'SCAN_FAILED', status_reason_code = 'SCAN_RETRY_EXHAUSTED',
           scan_lease_token = NULL, scan_lease_expires_at = NULL,
           scanned_at = clock_timestamp(), updated_at = clock_timestamp(),
           version = version + 1
       FROM (
         SELECT id FROM application_documents
         WHERE status = 'SCANNING' AND scan_lease_expires_at <= clock_timestamp()
           AND scan_attempt_count >= $1
         ORDER BY scan_lease_expires_at, id
         LIMIT $2 FOR UPDATE SKIP LOCKED
       ) AS exhausted
       WHERE document.id = exhausted.id`,
      [MAX_SCAN_ATTEMPTS, EXPIRY_SWEEP_BATCH_SIZE],
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
    const result = await this.pool.query(
      `UPDATE application_documents
       SET status = 'CLEAN', clean_object_key = $3,
           clean_version_id = $4, detected_content_type = $5,
           verified_size_bytes = $6, verified_sha256 = $7,
           scanned_at = clock_timestamp(), status_reason_code = NULL,
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
    await this.pool.query(
      `UPDATE application_documents
       SET status = $3::"ApplicationDocumentStatus", status_reason_code = $4,
           scan_lease_token = NULL, scan_lease_expires_at = NULL,
           scanned_at = clock_timestamp(), updated_at = clock_timestamp(), version = version + 1
       WHERE id = $1::uuid AND scan_lease_token = $2::uuid AND status = 'SCANNING'`,
      [job.id, job.scanLeaseToken, status, reasonCode],
    );
  }

  async retry(job: DocumentJob, backoffMs: number): Promise<void> {
    await this.pool.query(
      `UPDATE application_documents
       SET status = 'QUARANTINED', scan_available_at = clock_timestamp() + ($3::integer * interval '1 millisecond'),
           scan_lease_token = NULL, scan_lease_expires_at = NULL,
           status_reason_code = 'SCAN_RETRY_PENDING', updated_at = clock_timestamp(), version = version + 1
       WHERE id = $1::uuid AND scan_lease_token = $2::uuid AND status = 'SCANNING'`,
      [job.id, job.scanLeaseToken, backoffMs],
    );
  }
}
