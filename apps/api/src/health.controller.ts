import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { DependencyCheck, DependencyReadiness } from "@royal-palace/config/readiness";
import type { FastifyReply } from "fastify";

import { DEPENDENCY_READINESS } from "./tokens.js";

export interface HealthResponse {
  checks?: readonly DependencyCheck[];
  service: "api";
  status: "not_ready" | "ok" | "ready";
}

@Controller("health")
export class HealthController {
  constructor(@Inject(DEPENDENCY_READINESS) private readonly dependencies: DependencyReadiness) {}

  @Get("live")
  live(): HealthResponse {
    return { service: "api", status: "ok" };
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResponse> {
    const readiness = await this.dependencies.check();
    if (!readiness.ready) reply.code(503);

    return {
      checks: readiness.checks,
      service: "api",
      status: readiness.ready ? "ready" : "not_ready",
    };
  }
}
