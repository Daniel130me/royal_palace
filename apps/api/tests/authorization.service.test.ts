import type { CurrentSession } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationDeniedError,
  AuthorizationService,
} from "../src/authorization/application/authorization.service.js";
import type { AuthorizationAuditRepository } from "../src/authorization/domain/authorization.types.js";
import { AUTHORIZATION_POLICY } from "../src/authorization/domain/authorization.types.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

function administrator(): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: "urn:royal-palace:assurance:mfa",
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId: createOpaqueId(),
    roles: ["ADMINISTRATOR"],
    sessionId: createOpaqueId(),
  };
}

describe("AuthorizationService", () => {
  it("appends an immutable decision fact before returning an allow", async () => {
    const append = vi.fn<AuthorizationAuditRepository["append"]>(async () => undefined);
    const service = new AuthorizationService(new PolicyEngine(), { append });
    const resourceId = createOpaqueId();

    await expect(
      service.authorize({
        actor: administrator(),
        context: { resourceId, resourceType: "identity_principal" },
        policy: AUTHORIZATION_POLICY.REVOKE_PRINCIPAL_SESSIONS,
        requestId: "request-1",
      }),
    ).resolves.toMatchObject({ allowed: true, effectiveRole: "ADMINISTRATOR" });
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId, result: "SUCCEEDED" }),
    );
  });

  it("audits a direct-object-reference denial and throws a safe error", async () => {
    const append = vi.fn<AuthorizationAuditRepository["append"]>(async () => undefined);
    const service = new AuthorizationService(new PolicyEngine(), { append });

    await expect(
      service.authorize({
        actor: { ...administrator(), roles: ["MANAGER"] },
        context: {
          managerPrincipalId: createOpaqueId(),
          resourceId: createOpaqueId(),
          resourceType: "manager_earning",
        },
        policy: AUTHORIZATION_POLICY.VIEW_MANAGER_EARNINGS,
        requestId: "request-2",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveRole: null, result: "DENIED" }),
    );
  });

  it("fails closed when the audit event cannot be persisted", async () => {
    const service = new AuthorizationService(new PolicyEngine(), {
      append: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });

    await expect(
      service.authorize({
        actor: administrator(),
        context: { resourceId: createOpaqueId(), resourceType: "role_assignment" },
        policy: AUTHORIZATION_POLICY.ADMINISTER_ROLE_ASSIGNMENT,
        requestId: "request-3",
      }),
    ).rejects.toThrow("database unavailable");
  });
});
