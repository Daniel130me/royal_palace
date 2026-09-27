import { describe, expect, it } from "vitest";

import { HealthController } from "../src/health.controller.js";

describe("HealthController", () => {
  const controller = new HealthController();

  it("reports the worker process as live", () => {
    expect(controller.live()).toEqual({ service: "worker", status: "ok" });
  });

  it("reports the worker process as ready before dependencies are introduced", () => {
    expect(controller.ready()).toEqual({ service: "worker", status: "ready" });
  });
});
