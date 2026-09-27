import { describe, expect, it } from "vitest";

import { loadServiceConfig } from "../src/environment.js";
import {
  createLoggerOptions,
  createServiceLogger,
  resolveRequestContext,
  StructuredLogger,
} from "../src/observability.js";

const environment = {
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

describe("request context", () => {
  it("preserves a safe request ID and trace ID while creating a child span", () => {
    const context = resolveRequestContext({
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      "x-request-id": "request-123",
    });

    expect(context.requestId).toBe("request-123");
    expect(context.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(context.traceparent).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/);
  });

  it("replaces malformed caller-controlled correlation headers", () => {
    const context = resolveRequestContext({
      traceparent: "invalid",
      "x-request-id": "contains spaces and control\ncharacters",
    });

    expect(context.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(context.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });
});

describe("structured logging", () => {
  it("includes service metadata and redacts configured sensitive fields", () => {
    const lines: string[] = [];
    const logger = createServiceLogger(loadServiceConfig("api", environment), {
      write(chunk: string) {
        lines.push(chunk);
      },
    });

    logger.info({ password: "password-value", secret: "secret-value" }, "redaction-test");

    const output = lines.join("");
    expect(output).toContain('"service":"api"');
    expect(output).toContain('"environment":"test"');
    expect(output).toContain('"version":"test-version"');
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("password-value");
    expect(output).not.toContain("secret-value");
  });

  it("removes query values from serialized request URLs", () => {
    const options = createLoggerOptions(loadServiceConfig("api", environment));
    const serializer = options.serializers?.req;

    expect(serializer?.({ method: "GET", url: "/callback?token=sensitive-value" })).toEqual({
      id: undefined,
      method: "GET",
      remoteAddress: undefined,
      url: "/callback",
    });
  });

  it("does not stringify unknown framework log objects", () => {
    const lines: string[] = [];
    const pinoLogger = createServiceLogger(loadServiceConfig("api", environment), {
      write(chunk: string) {
        lines.push(chunk);
      },
    });
    const logger = new StructuredLogger(pinoLogger);

    logger.log({ password: "must-not-be-logged" });

    const output = lines.join("");
    expect(output).toContain("[non-string log payload omitted]");
    expect(output).not.toContain("must-not-be-logged");
  });
});
