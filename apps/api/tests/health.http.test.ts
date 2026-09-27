import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { healthyChecks, testConfig } from "./test-config.js";

describe("API health endpoints", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule.register(testConfig, {
        check: async () => ({ checks: healthyChecks, ready: true }),
      }),
      new FastifyAdapter(),
      { logger: false },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health/live reports process liveness", async () => {
    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: "api", status: "ok" });
  });

  it("GET /health/ready reports dependency readiness", async () => {
    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      checks: healthyChecks,
      service: "api",
      status: "ready",
    });
  });
});
