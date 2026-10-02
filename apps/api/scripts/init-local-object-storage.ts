import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketVersioningCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadServiceConfig } from "@royal-palace/config/environment";

const RETRY_ATTEMPTS = 20;
const RETRY_DELAY_MS = 1_000;

const config = loadServiceConfig("api");
if (config.appEnvironment !== "development") {
  throw new Error("Local object-storage initialization requires APP_ENV=development");
}
if (config.objectStorage.credentials === undefined) {
  throw new Error("Local object-storage credentials are required");
}
const webOrigin = process.env.WEB_ORIGIN;
if (webOrigin === undefined || !URL.canParse(webOrigin)) {
  throw new Error("WEB_ORIGIN must be an explicit local browser origin");
}
const parsedOrigin = new URL(webOrigin);
if (
  !["localhost", "127.0.0.1"].includes(parsedOrigin.hostname) ||
  parsedOrigin.origin !== webOrigin
) {
  throw new Error("WEB_ORIGIN must be a loopback origin without a path");
}

const client = new S3Client({
  credentials: {
    accessKeyId: config.objectStorage.credentials.accessKey,
    secretAccessKey: config.objectStorage.credentials.secretKey,
  },
  endpoint: config.objectStorage.endpoint,
  forcePathStyle: true,
  region: config.objectStorage.region,
});

try {
  for (const bucket of [config.objectStorage.quarantineBucket, config.objectStorage.cleanBucket]) {
    await retry(async () => {
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
    });
  }
  await client.send(
    new PutBucketCorsCommand({
      Bucket: config.objectStorage.quarantineBucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["content-type", "if-none-match", "x-amz-checksum-sha256"],
            AllowedMethods: ["PUT"],
            AllowedOrigins: [webOrigin],
            MaxAgeSeconds: 300,
          },
        ],
      },
    }),
  );
  process.stdout.write("Local private object-storage buckets are ready with versioning.\n");
} finally {
  client.destroy();
}

async function retry(operation: () => Promise<void>): Promise<void> {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      if (attempt === RETRY_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

function isMissingBucket(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return "name" in error && (error.name === "NotFound" || error.name === "NoSuchBucket");
}
