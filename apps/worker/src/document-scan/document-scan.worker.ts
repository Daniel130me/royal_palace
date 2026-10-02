import {
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { WorkerServiceConfig } from "@royal-palace/config/environment";

import { SERVICE_CONFIG } from "../tokens.js";
import { scanWithClamAv } from "./clamav-scanner.js";
import { MAX_DOCUMENT_BYTES, retryDelayMs, verifyDocumentBytes } from "./document-scan-policy.js";
import { PostgresDocumentJobs, type DocumentJob } from "./postgres-document-jobs.js";

const POLL_INTERVAL_MS = 5_000;
const SCAN_IO_TIMEOUT_MS = 120_000;
const EXPIRY_SWEEP_INTERVAL_MS = 60_000;

class RejectedDocumentError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
  }
}

class PermanentlyFailedScanError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
  }
}

class LeaseLostError extends Error {}

@Injectable()
export class DocumentScanWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentScanWorker.name);
  private readonly jobs: PostgresDocumentJobs;
  private readonly storage: S3Client;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private lastExpirySweepAt = 0;

  constructor(@Inject(SERVICE_CONFIG) private readonly config: WorkerServiceConfig) {
    this.jobs = new PostgresDocumentJobs(config);
    this.storage = new S3Client({
      ...(config.objectStorage.credentials === undefined
        ? {}
        : {
            credentials: {
              accessKeyId: config.objectStorage.credentials.accessKey,
              secretAccessKey: config.objectStorage.credentials.secretKey,
            },
          }),
      endpoint: config.objectStorage.endpoint,
      forcePathStyle: config.appEnvironment === "development" || config.appEnvironment === "test",
      region: config.objectStorage.region,
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }

  onModuleInit(): void {
    if (this.config.appEnvironment !== "test") void this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    await this.jobs.close();
    this.storage.destroy();
  }

  async runOnce(): Promise<boolean> {
    if (Date.now() - this.lastExpirySweepAt >= EXPIRY_SWEEP_INTERVAL_MS) {
      await this.jobs.expirePendingUploads();
      await this.jobs.deadLetterExhaustedLeases();
      this.lastExpirySweepAt = Date.now();
    }
    const job = await this.jobs.claim();
    if (job === null) return false;
    try {
      const result = await this.inspectAndScan(job);
      await this.release(job, result.bytes, result.contentType, result.sha256Hex);
    } catch (error) {
      if (error instanceof LeaseLostError) {
        this.logger.warn({ event: "document_scan_lease_lost" });
      } else if (error instanceof RejectedDocumentError) {
        await this.jobs.finish(job, "REJECTED", error.reasonCode);
      } else if (error instanceof PermanentlyFailedScanError) {
        await this.jobs.finish(job, "SCAN_FAILED", error.reasonCode);
        this.logger.error({ event: "document_scan_dead_letter", reasonCode: error.reasonCode });
      } else {
        await this.retryOrDeadLetter(job);
      }
    }
    return true;
  }

  private async tick(): Promise<void> {
    try {
      await this.runOnce();
    } catch {
      this.logger.error({ event: "document_scan_poll_failed" });
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => void this.tick(), POLL_INTERVAL_MS);
    }
  }

  private async inspectAndScan(
    job: DocumentJob,
  ): Promise<{ bytes: Buffer; contentType: string; sha256Hex: string }> {
    if (job.storageObjectKey !== `application-documents/${job.id}`) {
      throw new RejectedDocumentError("INVALID_OBJECT_KEY");
    }
    if (
      (this.config.appEnvironment === "staging" || this.config.appEnvironment === "production") &&
      job.quarantineVersionId === null
    ) {
      throw new PermanentlyFailedScanError("QUARANTINE_VERSION_MISSING");
    }
    if (this.config.appEnvironment === "production") {
      const tags = await this.storage.send(
        new GetObjectTaggingCommand({
          Bucket: this.config.objectStorage.quarantineBucket,
          Key: job.storageObjectKey,
          ...(job.quarantineVersionId === null ? {} : { VersionId: job.quarantineVersionId }),
        }),
        { abortSignal: AbortSignal.timeout(SCAN_IO_TIMEOUT_MS) },
      );
      const scanStatus = tags.TagSet?.find(
        (tag) => tag.Key === "GuardDutyMalwareScanStatus",
      )?.Value;
      if (scanStatus === "THREATS_FOUND") throw new RejectedDocumentError("MALWARE_DETECTED");
      if (
        scanStatus === "UNSUPPORTED" ||
        scanStatus === "ACCESS_DENIED" ||
        scanStatus === "FAILED"
      ) {
        throw new PermanentlyFailedScanError("PROVIDER_SCAN_UNAVAILABLE");
      }
      if (scanStatus !== "NO_THREATS_FOUND") throw new Error("Provider scan is pending");
    }
    const object = await this.storage.send(
      new GetObjectCommand({
        Bucket: this.config.objectStorage.quarantineBucket,
        ChecksumMode: "ENABLED",
        Key: job.storageObjectKey,
        ...(job.quarantineVersionId === null ? {} : { VersionId: job.quarantineVersionId }),
      }),
      { abortSignal: AbortSignal.timeout(SCAN_IO_TIMEOUT_MS) },
    );
    if (
      object.ContentLength !== job.declaredSizeBytes ||
      object.ContentLength > MAX_DOCUMENT_BYTES ||
      object.ContentType !== job.declaredContentType ||
      object.ChecksumSHA256 !== Buffer.from(job.declaredSha256, "hex").toString("base64") ||
      object.Body === undefined
    ) {
      throw new RejectedDocumentError("OBJECT_EVIDENCE_MISMATCH");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > job.declaredSizeBytes || size > MAX_DOCUMENT_BYTES) {
        throw new RejectedDocumentError("OBJECT_SIZE_MISMATCH");
      }
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks, size);
    if (
      !verifyDocumentBytes(bytes, {
        contentType: job.declaredContentType,
        sha256Hex: job.declaredSha256,
        sizeBytes: job.declaredSizeBytes,
      })
    ) {
      throw new RejectedDocumentError("CONTENT_VERIFICATION_FAILED");
    }
    if (this.config.appEnvironment !== "production") {
      if (this.config.clamav === null) throw new Error("Malware scanner is unavailable");
      const result = await scanWithClamAv(bytes, {
        host: this.config.clamav.host,
        port: this.config.clamav.port,
        timeoutMs: SCAN_IO_TIMEOUT_MS,
      });
      if (result === "INFECTED") throw new RejectedDocumentError("MALWARE_DETECTED");
    }
    return { bytes, contentType: job.declaredContentType, sha256Hex: job.declaredSha256 };
  }

  private async release(
    job: DocumentJob,
    bytes: Buffer,
    contentType: string,
    sha256Hex: string,
  ): Promise<void> {
    const key = `application-documents/${job.id}`;
    try {
      await this.storage.send(
        new PutObjectCommand({
          Body: bytes,
          Bucket: this.config.objectStorage.cleanBucket,
          ChecksumSHA256: Buffer.from(sha256Hex, "hex").toString("base64"),
          ContentType: contentType,
          IfNoneMatch: "*",
          Key: key,
        }),
        { abortSignal: AbortSignal.timeout(SCAN_IO_TIMEOUT_MS) },
      );
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error;
    }
    // A retry may find an earlier successful copy. Verify that copy before recording CLEAN.
    const released = await this.storage.send(
      new HeadObjectCommand({
        Bucket: this.config.objectStorage.cleanBucket,
        ChecksumMode: "ENABLED",
        Key: key,
      }),
      { abortSignal: AbortSignal.timeout(SCAN_IO_TIMEOUT_MS) },
    );
    if (
      released.ContentLength !== bytes.length ||
      released.ChecksumSHA256 !== Buffer.from(sha256Hex, "hex").toString("base64") ||
      ((this.config.appEnvironment === "staging" || this.config.appEnvironment === "production") &&
        released.VersionId === undefined)
    ) {
      throw new PermanentlyFailedScanError("RELEASE_OBJECT_MISMATCH");
    }
    const committed = await this.jobs.markClean({
      job,
      cleanObjectKey: key,
      cleanVersionId: released.VersionId ?? null,
      contentType,
      sizeBytes: bytes.length,
      sha256Hex,
    });
    if (!committed) throw new LeaseLostError();
  }

  private async retryOrDeadLetter(job: DocumentJob): Promise<void> {
    const backoff = retryDelayMs(job.scanAttemptCount);
    if (backoff === null) {
      await this.jobs.finish(job, "SCAN_FAILED", "SCAN_RETRY_EXHAUSTED");
      this.logger.error({ event: "document_scan_dead_letter", reasonCode: "SCAN_RETRY_EXHAUSTED" });
      return;
    }
    await this.jobs.retry(job, backoff);
  }
}

function isPreconditionFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata &&
    error.$metadata.httpStatusCode === 412
  );
}
