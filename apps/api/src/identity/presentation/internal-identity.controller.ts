import { Body, Controller, HttpException, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  BeginLoginResponse,
  CompleteLoginResponse,
  CurrentSession,
  LogoutResponse,
} from "@royal-palace/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { PolicyProtected } from "../../authorization/presentation/policy-protected.decorator.js";
import { IdentityFlowError, IdentityService } from "../application/identity.service.js";
import { InternalRequestGuard } from "./internal-request.guard.js";

const opaqueId = z.uuid();
const beginLoginSchema = z.object({
  reauthenticateSessionId: opaqueId.optional(),
  requestedAssurance: z.string().trim().min(1).max(255).optional(),
  returnTo: z.string().min(1).max(2048),
});
const completeLoginSchema = z.object({
  currentUrl: z.url().max(4096),
  transactionId: opaqueId,
});
const sessionSchema = z.object({ sessionId: opaqueId });
const revokePrincipalSessionsSchema = z.object({
  actorSessionId: opaqueId,
  targetPrincipalId: opaqueId,
});

@Controller("v1/internal/auth")
@UseGuards(InternalRequestGuard)
export class InternalIdentityController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  @Post("login/start")
  beginLogin(@Body() body: unknown): Promise<BeginLoginResponse> {
    return this.execute(() => this.identity.beginLogin(parse(beginLoginSchema, body)));
  }

  @Post("login/callback")
  completeLogin(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<CompleteLoginResponse> {
    const input = parse(completeLoginSchema, body);
    return this.execute(() =>
      this.identity.completeLogin({ ...input, requestId: requireRequestId(request) }),
    );
  }

  @Post("session/current")
  currentSession(@Body() body: unknown): Promise<CurrentSession> {
    const input = parse(sessionSchema, body);
    return this.execute(() => this.identity.currentSession(input.sessionId));
  }

  @Post("session/refresh")
  async refreshSession(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ refreshed: true }> {
    const input = parse(sessionSchema, body);
    await this.execute(() =>
      this.identity.refreshSession({
        requestId: requireRequestId(request),
        sessionId: input.sessionId,
      }),
    );
    return { refreshed: true };
  }

  @Post("session/logout")
  logout(@Body() body: unknown, @Req() request: FastifyRequest): Promise<LogoutResponse> {
    const input = parse(sessionSchema, body);
    return this.execute(() =>
      this.identity.logout({ requestId: requireRequestId(request), sessionId: input.sessionId }),
    );
  }

  @Post("session/revoke-principal")
  @PolicyProtected(AUTHORIZATION_POLICY.REVOKE_PRINCIPAL_SESSIONS)
  revokePrincipalSessions(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ revokedSessionCount: number }> {
    const input = parse(revokePrincipalSessionsSchema, body);
    return this.execute(() =>
      this.identity.revokePrincipalSessions({
        ...input,
        requestId: requireRequestId(request),
      }),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof IdentityFlowError) {
        throw new HttpException({ error: error.code, message: error.message }, error.status);
      }
      if (error instanceof AuthorizationDeniedError) {
        throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
      }
      throw error;
    }
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
  }
  return result.data;
}

function requireRequestId(request: FastifyRequest): string {
  const requestId = request.headers["x-request-id"];
  if (typeof requestId !== "string") {
    throw new HttpException(
      { error: "missing_request_id", message: "Request ID is required" },
      400,
    );
  }
  return requestId;
}
