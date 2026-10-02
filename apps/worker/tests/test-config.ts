import { loadServiceConfig } from "@royal-palace/config/environment";

export const testConfig = loadServiceConfig("worker", {
  APP_ENV: "test",
  APP_VERSION: "test-version",
  CLAMAV_HOST: "127.0.0.1",
  CLAMAV_PORT: "3310",
  DATABASE_URL: "postgresql://test-user:test-password@127.0.0.1:5432/test-db",
  DEPENDENCY_TIMEOUT_MS: "1500",
  LOG_LEVEL: "silent",
  OBJECT_STORAGE_ACCESS_KEY: "test-access-key",
  OBJECT_STORAGE_BUCKET_QUARANTINE: "test-quarantine",
  OBJECT_STORAGE_BUCKET_CLEAN: "test-clean",
  OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
  OBJECT_STORAGE_REGION: "test-region",
  OBJECT_STORAGE_SECRET_KEY: "test-secret-key",
  PAYMENT_GATEWAY_MODE: "disabled",
  QUEUE_NAMESPACE: "royal-palace:test",
  REDIS_URL: "redis://127.0.0.1:6379/0",
});

export const healthyChecks = [
  { name: "postgresql", status: "up" },
  { name: "redis-queue", status: "up" },
  { name: "object-storage", status: "up" },
  { name: "clamav", status: "up" },
] as const;
