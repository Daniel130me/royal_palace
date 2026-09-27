import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";

describe("worker health endpoints", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ["/health/live", "ok"],
    ["/health/ready", "ready"],
  ])("GET %s returns a healthy response", async (url, status) => {
    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: "worker", status });
  });
});
