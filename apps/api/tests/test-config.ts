import { loadServiceConfig } from "@royal-palace/config/environment";

export const testConfig = loadServiceConfig("api", {
  APP_ENV: "test",
  APP_VERSION: "test-version",
  BFF_INTERNAL_SECRET: Buffer.alloc(32, 1).toString("base64"),
  CLAMAV_HOST: "127.0.0.1",
  CLAMAV_PORT: "3310",
  CLINICAL_WORKFLOW_MODE: "synthetic",
  DATABASE_URL: "postgresql://test-user:test-password@127.0.0.1:5432/test-db",
  DEPENDENCY_TIMEOUT_MS: "1500",
  LOG_LEVEL: "silent",
  IDENTITY_ACTIVE_ENCRYPTION_KEY_ID: "test-key-1",
  IDENTITY_ENCRYPTION_KEYS: JSON.stringify({
    "test-key-1": Buffer.alloc(32, 2).toString("base64"),
  }),
  LOGIN_TRANSACTION_TTL_SECONDS: "300",
  OBJECT_STORAGE_ACCESS_KEY: "test-access-key",
  OBJECT_STORAGE_BUCKET_QUARANTINE: "test-quarantine",
  OBJECT_STORAGE_BUCKET_CLEAN: "test-clean",
  OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
  OBJECT_STORAGE_REGION: "test-region",
  OBJECT_STORAGE_SECRET_KEY: "test-secret-key",
  PAYMENT_CHECKOUT_BASE_URL: "http://127.0.0.1:3000/dev/payment-checkout",
  PAYMENT_GATEWAY_MODE: "synthetic",
  PAYMENT_WEBHOOK_ACTIVE_KEY_ID: "test-payment-key-1",
  PAYMENT_WEBHOOK_SIGNING_KEYS: JSON.stringify({
    "test-payment-key-1": Buffer.alloc(32, 4).toString("base64"),
  }),
  OIDC_CLIENT_ID: "test-client",
  OIDC_CLIENT_AUTH_METHOD: "none",
  OIDC_ASSURANCE_CONTEXT_MAP: JSON.stringify({
    "urn:test:mfa": "urn:royal-palace:aal2",
  }),
  OIDC_ISSUER_URL: "http://127.0.0.1:5556",
  OIDC_REDIRECT_URI: "http://127.0.0.1:3000/api/bff/auth/callback",
  OIDC_SCOPES: "openid profile email",
  PRIVILEGED_ASSURANCE_CONTEXT: "urn:royal-palace:aal2",
  PRIVILEGED_AUTH_MAX_AGE_SECONDS: "900",
  REFERRAL_ACTIVE_SIGNING_KEY_ID: "test-referral-key-1",
  REFERRAL_SIGNING_KEYS: JSON.stringify({
    "test-referral-key-1": Buffer.alloc(32, 3).toString("base64"),
  }),
  QUEUE_NAMESPACE: "royal-palace:test",
  REDIS_URL: "redis://127.0.0.1:6379/0",
  SESSION_ABSOLUTE_TTL_SECONDS: "28800",
  SESSION_IDLE_TTL_SECONDS: "1800",
});

export const healthyChecks = [
  { name: "postgresql", status: "up" },
  { name: "redis-queue", status: "up" },
  { name: "object-storage", status: "up" },
  { name: "clamav", status: "up" },
] as const;
