import { Controller, Get } from "@nestjs/common";

export interface HealthResponse {
  service: "worker";
  status: "ok" | "ready";
}

@Controller("health")
export class HealthController {
  @Get("live")
  live(): HealthResponse {
    return { service: "worker", status: "ok" };
  }

  @Get("ready")
  ready(): HealthResponse {
    // Increment 01 has no queue or database dependency. Increment 02 adds probes.
    return { service: "worker", status: "ready" };
  }
}
