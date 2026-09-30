import type { ExecutionContext } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { CurrentSession } from "@royal-palace/contracts";
import { createInternalRequestHeaders } from "@royal-palace/security";
import { describe, expect, it, vi } from "vitest";

import type { IdentityService } from "../src/identity/application/identity.service.js";
import {
  AuthenticatedInternalRequestGuard,
  type AuthenticatedInternalRequest,
} from "../src/identity/presentation/authenticated-internal-request.guard.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const secret = Buffer.alloc(32, 9).toString("base64");
const sessionId = createOpaqueId();
const currentSession: CurrentSession = {
  absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
  assuranceContext: null,
  authenticatedAt: "2026-09-30T00:00:00.000Z",
  authenticationMethods: ["pwd"],
  idleExpiresAt: "2099-01-01T00:00:00.000Z",
  memberships: [],
  principalId: createOpaqueId(),
  roles: [],
  sessionId,
};

describe("AuthenticatedInternalRequestGuard", () => {
  it("verifies the service signature before resolving and attaching the session", async () => {
    const path = "/v1/applications";
    const requestId = "request-guard-1";
    const signed = createInternalRequestHeaders(
      { body: "", method: "GET", path, requestId, sessionReference: sessionId },
      secret,
    );
    const request = {
      headers: { ...signed, "x-request-id": requestId },
      method: "GET",
      url: path,
    } as unknown as AuthenticatedInternalRequest;
    const identity = { currentSession: vi.fn(async () => currentSession) };
    const guard = new AuthenticatedInternalRequestGuard(
      { identity: { bffInternalSecret: secret } } as ApiServiceConfig,
      identity as unknown as IdentityService,
    );

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.currentSession).toEqual(currentSession);
    expect(identity.currentSession).toHaveBeenCalledWith(sessionId);
  });

  it("rejects a session reference that was not covered by the signature", async () => {
    const path = "/v1/applications";
    const requestId = "request-guard-2";
    const signed = createInternalRequestHeaders(
      { body: "", method: "GET", path, requestId, sessionReference: sessionId },
      secret,
    );
    const request = {
      headers: {
        ...signed,
        "x-request-id": requestId,
        "x-rp-session-reference": createOpaqueId(),
      },
      method: "GET",
      url: path,
    } as unknown as AuthenticatedInternalRequest;
    const guard = new AuthenticatedInternalRequestGuard(
      { identity: { bffInternalSecret: secret } } as ApiServiceConfig,
      { currentSession: vi.fn() } as unknown as IdentityService,
    );

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({ status: 401 });
  });
});

function contextFor(request: AuthenticatedInternalRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
