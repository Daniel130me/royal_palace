import { describe, expect, it } from "vitest";

import { ConfigurationError, loadServiceConfig, loadWebConfig } from "../src/environment.js";

const testKey = Buffer.alloc(32, 7).toString("base64");
const validEnvironment = {
  APP_ENV: "test",
  APP_VERSION: "test-version",
  BFF_INTERNAL_SECRET: testKey,
  CLAMAV_HOST: "127.0.0.1",
  CLAMAV_PORT: "3310",
  DATABASE_URL: "postgresql://test-user:test-password@127.0.0.1:5432/test-db",
  DEPENDENCY_TIMEOUT_MS: "1500",
  LOG_LEVEL: "info",
  IDENTITY_ACTIVE_ENCRYPTION_KEY_ID: "test-key-1",
  IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ "test-key-1": testKey }),
  LOGIN_TRANSACTION_TTL_SECONDS: "300",
  OBJECT_STORAGE_ACCESS_KEY: "test-access-key",
  OBJECT_STORAGE_BUCKET_QUARANTINE: "test-quarantine",
  OBJECT_STORAGE_BUCKET_CLEAN: "test-clean",
  OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
  OBJECT_STORAGE_REGION: "test-region",
  OBJECT_STORAGE_SECRET_KEY: "test-secret-key",
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
  REFERRAL_SIGNING_KEYS: JSON.stringify({ "test-referral-key-1": testKey }),
  QUEUE_NAMESPACE: "royal-palace:test",
  REDIS_URL: "redis://127.0.0.1:6379/0",
  SESSION_ABSOLUTE_TTL_SECONDS: "28800",
  SESSION_IDLE_TTL_SECONDS: "1800",
} satisfies NodeJS.ProcessEnv;

describe("loadServiceConfig", () => {
  it("normalizes a valid environment and applies the service port", () => {
    const config = loadServiceConfig("api", validEnvironment);

    expect(config).toMatchObject({
      appEnvironment: "test",
      appVersion: "test-version",
      dependencyTimeoutMs: 1500,
      port: 4000,
      serviceName: "api",
    });
  });

  it("reports invalid field names without exposing secret values", () => {
    const secret = "must-not-appear-in-errors";

    expect(() =>
      loadServiceConfig("worker", {
        ...validEnvironment,
        DATABASE_URL: secret,
        OBJECT_STORAGE_SECRET_KEY: secret,
      }),
    ).toThrowError(ConfigurationError);

    try {
      loadServiceConfig("worker", { ...validEnvironment, DATABASE_URL: secret });
    } catch (error) {
      expect(String(error)).toContain("DATABASE_URL");
      expect(String(error)).not.toContain(secret);
    }
  });

  it("requires an explicit AWS region for protected environments", () => {
    expect(() => loadServiceConfig("api", { ...validEnvironment, APP_ENV: "production" })).toThrow(
      /AWS_REGION/,
    );
    expect(() => loadServiceConfig("api", { ...validEnvironment, APP_ENV: "staging" })).toThrow(
      /AWS_REGION/,
    );
  });

  it("requires verified encrypted dependency transports in protected environments", () => {
    expect(() =>
      loadServiceConfig("api", {
        ...validEnvironment,
        APP_ENV: "production",
        AWS_REGION: "approved-region-1",
      }),
    ).toThrow(
      /DATABASE_URL.*sslmode=verify-full|OBJECT_STORAGE_ENDPOINT.*https|REDIS_URL.*rediss/s,
    );

    expect(
      loadServiceConfig("api", {
        ...validEnvironment,
        APP_ENV: "production",
        AWS_REGION: "approved-region-1",
        DATABASE_URL:
          "postgresql://test-user:test-password@database.example.test:5432/test-db?sslmode=verify-full",
        OBJECT_STORAGE_ENDPOINT: "https://objects.example.test",
        OIDC_CLIENT_AUTH_METHOD: "client_secret_basic",
        OIDC_CLIENT_SECRET: "test-client-secret",
        OIDC_ISSUER_URL: "https://identity.example.test",
        OIDC_REDIRECT_URI: "https://app.example.test/api/bff/auth/callback",
        REDIS_URL: "rediss://redis.example.test:6379/0",
      }),
    ).toMatchObject({ appEnvironment: "production", awsRegion: "approved-region-1" });
  });

  it("fails fast when OIDC client authentication and secret configuration disagree", () => {
    expect(() =>
      loadServiceConfig("api", {
        ...validEnvironment,
        OIDC_CLIENT_AUTH_METHOD: "client_secret_basic",
      }),
    ).toThrow(/OIDC_CLIENT_SECRET/);
    expect(() =>
      loadServiceConfig("api", {
        ...validEnvironment,
        OIDC_CLIENT_SECRET: "unexpected-secret",
      }),
    ).toThrow(/OIDC_CLIENT_SECRET/);
  });

  it("keeps checkout expiry within the server-side reservation window", () => {
    expect(() =>
      loadServiceConfig("api", {
        ...validEnvironment,
        PAYMENT_CHECKOUT_TTL_SECONDS: "901",
        PAYMENT_RESERVATION_TTL_SECONDS: "900",
      }),
    ).toThrow(/PAYMENT_CHECKOUT_TTL_SECONDS/);
  });

  it("allows the synthetic gateway only outside protected environments", () => {
    const paymentEnvironment = {
      ...validEnvironment,
      PAYMENT_CHECKOUT_BASE_URL: "http://127.0.0.1:3000/synthetic-checkout",
      PAYMENT_GATEWAY_MODE: "synthetic",
      PAYMENT_WEBHOOK_ACTIVE_KEY_ID: "test-payment-key-1",
      PAYMENT_WEBHOOK_SIGNING_KEYS: JSON.stringify({ "test-payment-key-1": testKey }),
    };
    expect(loadServiceConfig("api", paymentEnvironment).paymentGateway.mode).toBe("synthetic");
    expect(() =>
      loadServiceConfig("api", {
        ...paymentEnvironment,
        APP_ENV: "production",
        AWS_REGION: "approved-region-1",
      }),
    ).toThrow(/PAYMENT_GATEWAY_MODE/);
  });
});

describe("loadWebConfig", () => {
  const validWebEnvironment = {
    API_BASE_URL: "http://127.0.0.1:4000",
    APP_ENV: "test",
    APP_VERSION: "test-version",
    BFF_ACTIVE_COOKIE_KEY_ID: "test-key-1",
    BFF_COOKIE_ENCRYPTION_KEYS: JSON.stringify({ "test-key-1": testKey }),
    BFF_INTERNAL_SECRET: testKey,
    BFF_API_TIMEOUT_MS: "5000",
    LOG_LEVEL: "info",
    WEB_ORIGIN: "http://127.0.0.1:3000",
  } satisfies NodeJS.ProcessEnv;

  it("requires WEB_ORIGIN to be an origin rather than an application path", () => {
    expect(() =>
      loadWebConfig({ ...validWebEnvironment, WEB_ORIGIN: "https://app.example.test/path" }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it("fails closed when the BFF API origin is missing", () => {
    expect(() =>
      loadWebConfig({
        APP_ENV: "test",
        APP_VERSION: "test-version",
        BFF_ACTIVE_COOKIE_KEY_ID: "test-key-1",
        BFF_COOKIE_ENCRYPTION_KEYS: JSON.stringify({ "test-key-1": testKey }),
        BFF_INTERNAL_SECRET: testKey,
        BFF_API_TIMEOUT_MS: "5000",
        LOG_LEVEL: "info",
        WEB_ORIGIN: "http://127.0.0.1:3000",
      }),
    ).toThrow(/API_BASE_URL/);
  });

  it("requires an HTTPS API origin in protected environments", () => {
    expect(() =>
      loadWebConfig({
        ...validWebEnvironment,
        API_BASE_URL: "http://api.example.test",
        APP_ENV: "production",
        WEB_ORIGIN: "https://web.example.test",
      }),
    ).toThrow(/API_BASE_URL.*https/s);
  });

  it("normalizes the BFF trust-boundary configuration", () => {
    expect(loadWebConfig(validWebEnvironment)).toMatchObject({
      apiBaseUrl: "http://127.0.0.1:4000",
      webOrigin: "http://127.0.0.1:3000",
    });
  });
});
