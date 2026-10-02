import { KeyRingSecretBox, sha256Hex } from "@royal-palace/security";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { IdentityService } from "../src/identity/application/identity.service.js";
import type { IdentityFlowError } from "../src/identity/application/identity.service.js";
import type { IdentityRepository, OidcProvider } from "../src/identity/domain/identity.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

function repository(overrides: Partial<IdentityRepository> = {}): IdentityRepository {
  return {
    consumeLoginTransaction: vi.fn(async () => null),
    createLoginTransaction: vi.fn(async () => undefined),
    createSession: vi.fn(async () => undefined),
    getCurrentSession: vi.fn(async () => null),
    getSessionSecrets: vi.fn(async () => null),
    resolveExternalIdentity: vi.fn(async () => ({
      externalIdentityId: createOpaqueId(),
      principalId: createOpaqueId(),
    })),
    revokePrincipalSessions: vi.fn(async () => 0),
    revokeSession: vi.fn(async () => null),
    synchronizeVerifiedEmail: vi.fn(async () => undefined),
    updateRefreshedSession: vi.fn(async () => undefined),
    validateReauthenticationSession: vi.fn(async () => true),
    ...overrides,
  };
}

function provider(overrides: Partial<OidcProvider> = {}): OidcProvider {
  return {
    buildAuthorizationUrl: vi.fn(async () => new URL("http://identity.test/authorize")),
    buildEndSessionUrl: vi.fn(async () => null),
    completeAuthorization: vi.fn(async () => ({
      assuranceContext: null,
      authenticatedAt: new Date("2026-09-28T12:00:00.000Z"),
      authenticationMethods: ["pwd"],
      idToken: null,
      issuer: testConfig.identity.issuerUrl,
      providerSessionId: null,
      refreshToken: null,
      subject: "subject-1",
      verifiedEmail: null,
    })),
    refresh: vi.fn(async () => ({ refreshToken: null })),
    revoke: vi.fn(async () => undefined),
    ...overrides,
  };
}

function authorization(): AuthorizationService {
  return {
    authorize: vi.fn(async (input: { policy: string }) => ({
      allowed: true,
      effectiveRole: "ADMINISTRATOR" as const,
      policy: input.policy,
      reasonCode: "allowed_administrator",
    })),
  } as unknown as AuthorizationService;
}

describe("IdentityService", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("stores only hashed state and encrypted PKCE/nonce values", async () => {
    const createLoginTransaction = vi.fn<IdentityRepository["createLoginTransaction"]>(
      async () => undefined,
    );
    const oidcProvider = provider();
    const service = new IdentityService(
      testConfig,
      repository({ createLoginTransaction }),
      oidcProvider,
      authorization(),
    );

    const result = await service.beginLogin({ returnTo: "/#/patient/dashboard" });

    expect(result.authorizationUrl).toBe("http://identity.test/authorize");
    const stored = createLoginTransaction.mock.calls[0]?.[0];
    const authorizationRequest = vi.mocked(oidcProvider.buildAuthorizationUrl).mock.calls[0]?.[0];
    expect(stored?.stateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.stateHash).toBe(sha256Hex(authorizationRequest?.state ?? ""));
    expect(stored?.nonceCiphertext).not.toContain(authorizationRequest?.nonce ?? "missing");
    expect(stored?.pkceVerifierCiphertext).toContain("v1.test-key-1.");
  });

  it("rejects a callback when the single-use transaction is missing", async () => {
    const service = new IdentityService(testConfig, repository(), provider(), authorization());
    const callback = `${testConfig.identity.redirectUri}?code=code&state=state`;

    await expect(
      service.completeLogin({
        currentUrl: callback,
        requestId: "request-1",
        transactionId: createOpaqueId(),
      }),
    ).rejects.toMatchObject<Partial<IdentityFlowError>>({
      code: "invalid_login_transaction",
      status: 401,
    });
  });

  it("records only an identity-provider-verified email endpoint", async () => {
    const principalId = createOpaqueId();
    const synchronizeVerifiedEmail = vi.fn<IdentityRepository["synchronizeVerifiedEmail"]>(
      async () => undefined,
    );
    const service = new IdentityService(
      testConfig,
      repository({
        consumeLoginTransaction: vi.fn(async () => ({
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          id: "test-transaction",
          nonceCiphertext: new KeyRingSecretBox(
            testConfig.identity.encryptionKeys,
            testConfig.identity.activeEncryptionKeyId,
          ).seal("nonce", "oidc-login-nonce:test-transaction"),
          pkceVerifierCiphertext: new KeyRingSecretBox(
            testConfig.identity.encryptionKeys,
            testConfig.identity.activeEncryptionKeyId,
          ).seal("verifier", "oidc-login-pkce:test-transaction"),
          reauthenticateSessionId: null,
          requestedAssurance: null,
          returnTo: "/",
        })),
        resolveExternalIdentity: vi.fn(async () => ({
          externalIdentityId: createOpaqueId(),
          principalId,
        })),
        synchronizeVerifiedEmail,
      }),
      provider({
        completeAuthorization: vi.fn(async () => ({
          assuranceContext: null,
          authenticatedAt: new Date(),
          authenticationMethods: ["pwd"],
          idToken: null,
          issuer: testConfig.identity.issuerUrl,
          providerSessionId: null,
          refreshToken: null,
          subject: "subject-1",
          verifiedEmail: "person@example.test",
        })),
      }),
      authorization(),
    );

    await service.completeLogin({
      currentUrl: `${testConfig.identity.redirectUri}?code=code&state=state`,
      requestId: "request-verified-email",
      transactionId: "test-transaction",
    });

    expect(synchronizeVerifiedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "person@example.test",
        issuer: testConfig.identity.issuerUrl,
        principalId,
      }),
    );
  });

  it("requires the configured assurance for privileged application roles", async () => {
    const service = new IdentityService(
      testConfig,
      repository({
        getCurrentSession: vi.fn(async () => ({
          absoluteExpiresAt: "2026-09-29T12:00:00.000Z",
          assuranceContext: null,
          authenticatedAt: "2026-09-28T12:00:00.000Z",
          authenticationMethods: ["pwd"],
          idleExpiresAt: "2026-09-28T12:30:00.000Z",
          memberships: [],
          principalId: createOpaqueId(),
          roles: ["ADMINISTRATOR"] as const,
          sessionId: createOpaqueId(),
        })),
      }),
      provider(),
      authorization(),
    );

    await expect(service.currentSession(createOpaqueId())).rejects.toMatchObject<
      Partial<IdentityFlowError>
    >({ code: "step_up_required", status: 403 });
  });

  it("requires privileged authentication to be recent even when MFA assurance is present", async () => {
    const service = new IdentityService(
      testConfig,
      repository({
        getCurrentSession: vi.fn(async () => ({
          absoluteExpiresAt: "2099-09-29T12:00:00.000Z",
          assuranceContext: testConfig.identity.privilegedAssuranceContext,
          authenticatedAt: "2020-01-01T00:00:00.000Z",
          authenticationMethods: ["pwd", "otp"],
          idleExpiresAt: "2099-09-29T12:00:00.000Z",
          memberships: [],
          principalId: createOpaqueId(),
          roles: ["ADMINISTRATOR"] as const,
          sessionId: createOpaqueId(),
        })),
      }),
      provider(),
      authorization(),
    );

    await expect(service.currentSession(createOpaqueId())).rejects.toMatchObject<
      Partial<IdentityFlowError>
    >({ code: "step_up_required", status: 403 });
  });

  it("accepts a recent configured assurance for a privileged role", async () => {
    const current = {
      absoluteExpiresAt: "2099-09-29T12:00:00.000Z",
      assuranceContext: testConfig.identity.privilegedAssuranceContext,
      authenticatedAt: new Date().toISOString(),
      authenticationMethods: ["pwd", "otp"],
      idleExpiresAt: "2099-09-29T12:00:00.000Z",
      memberships: [],
      principalId: createOpaqueId(),
      roles: ["ADMINISTRATOR"] as const,
      sessionId: createOpaqueId(),
    };
    const service = new IdentityService(
      testConfig,
      repository({ getCurrentSession: vi.fn(async () => current) }),
      provider(),
      authorization(),
    );

    await expect(service.currentSession(createOpaqueId())).resolves.toEqual(current);
  });

  it("revokes the local session even when provider revocation is unavailable", async () => {
    const sessionId = createOpaqueId();
    const secretBox = new KeyRingSecretBox(
      testConfig.identity.encryptionKeys,
      testConfig.identity.activeEncryptionKeyId,
    );
    const revokeSession = vi.fn<IdentityRepository["revokeSession"]>(async () => ({
      absoluteExpiresAt: new Date("2026-09-29T12:00:00.000Z"),
      encryptedIdToken: null,
      encryptedRefreshToken: secretBox.seal(
        "refresh-token",
        `oidc-provider-refresh-token:${sessionId}`,
      ),
      externalIdentityId: createOpaqueId(),
      issuer: testConfig.identity.issuerUrl,
      principalId: createOpaqueId(),
      subject: "subject-1",
    }));
    const oidcProvider = provider({
      revoke: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
    });
    const service = new IdentityService(
      testConfig,
      repository({ revokeSession }),
      oidcProvider,
      authorization(),
    );

    await expect(service.logout({ requestId: "request-1", sessionId })).resolves.toEqual({
      endSessionUrl: null,
    });
    expect(revokeSession).toHaveBeenCalledOnce();
    expect(oidcProvider.revoke).toHaveBeenCalledWith("refresh-token");
  });

  it("allows only a recently stepped-up administrator to revoke a principal's sessions", async () => {
    const actorPrincipalId = createOpaqueId();
    const targetPrincipalId = createOpaqueId();
    const revokePrincipalSessions = vi.fn<IdentityRepository["revokePrincipalSessions"]>(
      async () => 3,
    );
    const authorizationService = authorization();
    const service = new IdentityService(
      testConfig,
      repository({
        getCurrentSession: vi.fn(async () => ({
          absoluteExpiresAt: "2099-09-29T12:00:00.000Z",
          assuranceContext: testConfig.identity.privilegedAssuranceContext,
          authenticatedAt: new Date().toISOString(),
          authenticationMethods: ["pwd", "otp"],
          idleExpiresAt: "2099-09-29T12:00:00.000Z",
          memberships: [],
          principalId: actorPrincipalId,
          roles: ["ADMINISTRATOR"] as const,
          sessionId: createOpaqueId(),
        })),
        revokePrincipalSessions,
      }),
      provider(),
      authorizationService,
    );

    await expect(
      service.revokePrincipalSessions({
        actorSessionId: createOpaqueId(),
        requestId: "request-1",
        targetPrincipalId,
      }),
    ).resolves.toEqual({ revokedSessionCount: 3 });
    expect(revokePrincipalSessions).toHaveBeenCalledWith(
      expect.objectContaining({ actorPrincipalId, targetPrincipalId }),
    );
    expect(authorizationService.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ principalId: actorPrincipalId }),
        context: expect.objectContaining({ resourceId: targetPrincipalId }),
        policy: "REVOKE_PRINCIPAL_SESSIONS",
      }),
    );
  });
});
