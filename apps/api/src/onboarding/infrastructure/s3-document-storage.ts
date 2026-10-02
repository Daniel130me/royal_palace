import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";

import { SERVICE_CONFIG } from "../../tokens.js";
import type { DocumentStorage, StoredObjectEvidence } from "../domain/document-storage.port.js";

@Injectable()
export class S3DocumentStorage implements DocumentStorage, OnApplicationShutdown {
  private readonly client: S3Client;

  constructor(@Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig) {
    this.client = new S3Client({
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

  onApplicationShutdown(): void {
    this.client.destroy();
  }

  async signUpload(input: {
    contentType: string;
    expiresInSeconds: number;
    key: string;
    sha256Hex: string;
  }): Promise<{ headers: Readonly<Record<string, string>>; url: string }> {
    const checksum = Buffer.from(input.sha256Hex, "hex").toString("base64");
    const command = new PutObjectCommand({
      Bucket: this.config.objectStorage.quarantineBucket,
      ChecksumSHA256: checksum,
      ContentType: input.contentType,
      IfNoneMatch: "*",
      Key: input.key,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
      unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
    });
    return {
      headers: {
        "content-type": input.contentType,
        "if-none-match": "*",
        "x-amz-checksum-sha256": checksum,
      },
      url,
    };
  }

  async inspectQuarantined(key: string): Promise<StoredObjectEvidence | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.objectStorage.quarantineBucket,
          ChecksumMode: "ENABLED",
          Key: key,
        }),
      );
      return {
        checksumSha256: result.ChecksumSHA256 ?? null,
        contentType: result.ContentType ?? null,
        sizeBytes: result.ContentLength ?? null,
        versionId: result.VersionId ?? null,
      } satisfies StoredObjectEvidence;
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  signCleanDownload(input: {
    expiresInSeconds: number;
    key: string;
    versionId: string | null;
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.objectStorage.cleanBucket,
        Key: input.key,
        ...(input.versionId === null ? {} : { VersionId: input.versionId }),
        ResponseContentDisposition: 'attachment; filename="document"',
        ResponseContentType: "application/octet-stream",
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return "name" in error && (error.name === "NotFound" || error.name === "NoSuchKey");
}
