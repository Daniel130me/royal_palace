import "reflect-metadata";

import { describe, expect, it } from "vitest";

import { AUTHORIZATION_POLICY } from "../src/authorization/domain/authorization.types.js";
import { AUTHORIZATION_POLICY_METADATA } from "../src/authorization/presentation/policy-protected.decorator.js";
import { InternalIdentityController } from "../src/identity/presentation/internal-identity.controller.js";

describe("protected route policy inventory", () => {
  it("maps administrative principal revocation to its named policy", () => {
    const handler = InternalIdentityController.prototype.revokePrincipalSessions;
    expect(Reflect.getMetadata(AUTHORIZATION_POLICY_METADATA, handler)).toBe(
      AUTHORIZATION_POLICY.REVOKE_PRINCIPAL_SESSIONS,
    );
  });
});
