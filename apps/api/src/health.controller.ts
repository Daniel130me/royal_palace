import { Controller, Get } from "@nestjs/common";

export interface HealthResponse {
  service: "api";
  status: "ok" | "ready";
}

@Controller("health")
export class HealthController {
  @Get("live")
  live(): HealthResponse {
    return { service: "api", status: "ok" };
  }

  @Get("ready")
  ready(): HealthResponse {
    // Increment 01 has no external dependencies. Increment 02 adds dependency probes.
    return { service: "api", status: "ready" };
  }
}
