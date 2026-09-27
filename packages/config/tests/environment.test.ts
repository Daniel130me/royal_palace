import { describe, expect, it } from "vitest";

import { ConfigurationError, loadServiceConfig, loadWebConfig } from "../src/environment.js";

const validEnvironment = {
  APP_ENV: "test",
  APP_VERSION: "test-version",
  CLAMAV_HOST: "127.0.0.1",
  CLAMAV_PORT: "3310",
  DATABASE_URL: "postgresql://test-user:test-password@127.0.0.1:5432/test-db",
  DEPENDENCY_TIMEOUT_MS: "1500",
  LOG_LEVEL: "info",
  OBJECT_STORAGE_ACCESS_KEY: "test-access-key",
  OBJECT_STORAGE_BUCKET_QUARANTINE: "test-quarantine",
  OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
  OBJECT_STORAGE_SECRET_KEY: "test-secret-key",
  QUEUE_NAMESPACE: "royal-palace:test",
  REDIS_URL: "redis://127.0.0.1:6379/0",
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
        REDIS_URL: "rediss://redis.example.test:6379/0",
      }),
    ).toMatchObject({ appEnvironment: "production", awsRegion: "approved-region-1" });
  });
});

describe("loadWebConfig", () => {
  it("fails closed when the BFF API origin is missing", () => {
    expect(() =>
      loadWebConfig({ APP_ENV: "test", APP_VERSION: "test-version", LOG_LEVEL: "info" }),
    ).toThrow(/API_BASE_URL/);
  });

  it("requires an HTTPS API origin in protected environments", () => {
    expect(() =>
      loadWebConfig({
        API_BASE_URL: "http://api.example.test",
        APP_ENV: "production",
        APP_VERSION: "test-version",
        LOG_LEVEL: "info",
      }),
    ).toThrow(/API_BASE_URL.*https/s);
  });
});
