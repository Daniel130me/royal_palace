import type { FastifyReply } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { HealthController } from "../src/health.controller.js";
import { healthyChecks } from "./test-config.js";

describe("HealthController", () => {
  const dependencies = {
    check: vi.fn(async () => ({ checks: healthyChecks, ready: true })),
  };
  const controller = new HealthController(dependencies);

  it("reports the API process as live", () => {
    expect(controller.live()).toEqual({ service: "api", status: "ok" });
  });

  it("reports dependency readiness", async () => {
    const reply = { code: vi.fn() } as unknown as FastifyReply;

    await expect(controller.ready(reply)).resolves.toEqual({
      checks: healthyChecks,
      service: "api",
      status: "ready",
    });
    expect(reply.code).not.toHaveBeenCalled();
  });

  it("returns a service-unavailable status when any dependency is down", async () => {
    const reply = { code: vi.fn() } as unknown as FastifyReply;
    const unavailable = new HealthController({
      check: vi.fn(async () => ({
        checks: [{ name: "postgresql", status: "down" }] as const,
        ready: false,
      })),
    });

    await expect(unavailable.ready(reply)).resolves.toMatchObject({ status: "not_ready" });
    expect(reply.code).toHaveBeenCalledWith(503);
  });
});
