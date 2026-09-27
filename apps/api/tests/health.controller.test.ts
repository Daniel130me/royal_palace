import { describe, expect, it } from "vitest";

import { HealthController } from "../src/health.controller.js";

describe("HealthController", () => {
  const controller = new HealthController();

  it("reports the API process as live", () => {
    expect(controller.live()).toEqual({ service: "api", status: "ok" });
  });

  it("reports the API process as ready before dependencies are introduced", () => {
    expect(controller.ready()).toEqual({ service: "api", status: "ready" });
  });
});
