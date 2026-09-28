import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type {
  BeginLoginResponse,
  CompleteLoginResponse,
  CurrentSession,
  LogoutResponse,
  PlatformRole,
} from "@royal-palace/contracts";
import { KeyRingSecretBox, randomSecret, sha256Hex } from "@royal-palace/security";
import * as oidc from "openid-client";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import type { IdentityRepository, OidcProvider } from "../domain/identity.types.js";
import { IDENTITY_REPOSITORY, OIDC_PROVIDER } from "../identity.tokens.js";

const LOGIN_NONCE_CONTEXT = "oidc-login-nonce";
const LOGIN_PKCE_CONTEXT = "oidc-login-pkce";
const PROVIDER_REFRESH_CONTEXT = "oidc-provider-refresh-token";
const PROVIDER_ID_TOKEN_CONTEXT = "oidc-provider-id-token";
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const PRIVILEGED_ROLES = new Set<PlatformRole>([
  "ADMINISTRATOR",
  "FINANCE",
  "LOGISTICS",
  "MANAGER",
  "ORGANIZATION_STAFF",
  "PROVIDER",
  "SUPPORT",
  "SYSTEM_WORKER",
]);

export class IdentityFlowError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "IdentityFlowError";
  }
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private readonly secrets: KeyRingSecretBox;

  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
    @Inject(IDENTITY_REPOSITORY) private readonly repository: IdentityRepository,
    @Inject(OIDC_PROVIDER) private readonly provider: OidcProvider,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {
    this.secrets = new KeyRingSecretBox(
      config.identity.encryptionKeys,
      config.identity.activeEncryptionKeyId,
    );
  }

  async beginLogin(input: {
    reauthenticateSessionId?: string;
    requestedAssurance?: string;
    returnTo: string;
  }): Promise<BeginLoginResponse> {
    assertSafeReturnPath(input.returnTo);
    if (
      input.requestedAssurance !== undefined &&
      input.requestedAssurance !== this.config.identity.privilegedAssuranceContext
    ) {
      throw new IdentityFlowError(
        "Requested assurance context is not supported",
        400,
        "unsupported_assurance",
      );
    }

    const transactionId = createOpaqueId();
    const state = randomSecret();
    const nonce = oidc.randomNonce();
    const verifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(verifier);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.identity.loginTransactionTtlSeconds * 1000,
    );
    await this.repository.createLoginTransaction({
      encryptionKeyId: this.secrets.keyId,
      expiresAt,
      id: transactionId,
      issuer: this.config.identity.issuerUrl,
      nonceCiphertext: this.secrets.seal(nonce, `${LOGIN_NONCE_CONTEXT}:${transactionId}`),
      pkceVerifierCiphertext: this.secrets.seal(verifier, `${LOGIN_PKCE_CONTEXT}:${transactionId}`),
      reauthenticateSessionId: input.reauthenticateSessionId ?? null,
      redirectUri: this.config.identity.redirectUri,
      requestedAssurance: input.requestedAssurance ?? null,
      returnTo: input.returnTo,
      stateHash: sha256Hex(state),
    });
    const authorizationUrl = await this.provider.buildAuthorizationUrl({
      codeChallenge,
      nonce,
      ...(input.requestedAssurance === undefined
        ? {}
        : { requestedAssurance: input.requestedAssurance }),
      state,
    });
    return { authorizationUrl: authorizationUrl.toString(), transactionId };
  }

  async completeLogin(input: {
    currentUrl: string;
    requestId: string;
    transactionId: string;
  }): Promise<CompleteLoginResponse> {
    const currentUrl = parseCallbackUrl(input.currentUrl, this.config.identity.redirectUri);
    const state = currentUrl.searchParams.get("state");
    if (state === null) throw new IdentityFlowError("Missing login state", 400, "missing_state");
    const now = new Date();
    const transaction = await this.repository.consumeLoginTransaction({
      id: input.transactionId,
      now,
      stateHash: sha256Hex(state),
    });
    if (transaction === null) {
      throw new IdentityFlowError(
        "Login transaction is invalid or expired",
        401,
        "invalid_login_transaction",
      );
    }

    const authentication = await this.provider.completeAuthorization({
      currentUrl,
      expectedNonce: this.secrets.open(
        transaction.nonceCiphertext,
        `${LOGIN_NONCE_CONTEXT}:${transaction.id}`,
      ),
      expectedState: state,
      pkceCodeVerifier: this.secrets.open(
        transaction.pkceVerifierCiphertext,
        `${LOGIN_PKCE_CONTEXT}:${transaction.id}`,
      ),
      ...(transaction.requestedAssurance === null
        ? {}
        : { requiredMaxAgeSeconds: this.config.identity.privilegedAuthMaxAgeSeconds }),
    });
    if (
      transaction.requestedAssurance !== null &&
      (authentication.assuranceContext !== transaction.requestedAssurance ||
        !this.isPrivilegedAuthenticationFresh(authentication.authenticatedAt, now))
    ) {
      throw new IdentityFlowError(
        "The required authentication assurance was not established",
        403,
        "insufficient_authentication_assurance",
      );
    }

    const identity = await this.repository.resolveExternalIdentity({
      issuer: authentication.issuer,
      now,
      subject: authentication.subject,
    });
    if (
      transaction.reauthenticateSessionId !== null &&
      !(await this.repository.validateReauthenticationSession({
        now,
        principalId: identity.principalId,
        sessionId: transaction.reauthenticateSessionId,
      }))
    ) {
      throw new IdentityFlowError(
        "Reauthentication identity did not match the active session",
        403,
        "reauthentication_identity_mismatch",
      );
    }

    const sessionId = createOpaqueId();
    const csrfToken = randomSecret();
    const absoluteExpiresAt = new Date(
      now.getTime() + this.config.identity.sessionAbsoluteTtlSeconds * 1000,
    );
    const idleExpiresAt = new Date(
      Math.min(
        now.getTime() + this.config.identity.sessionIdleTtlSeconds * 1000,
        absoluteExpiresAt.getTime(),
      ),
    );
    const encryptedRefreshToken =
      authentication.refreshToken === null
        ? null
        : this.secrets.seal(
            authentication.refreshToken,
            `${PROVIDER_REFRESH_CONTEXT}:${sessionId}`,
          );
    const encryptedIdToken =
      authentication.idToken === null
        ? null
        : this.secrets.seal(authentication.idToken, `${PROVIDER_ID_TOKEN_CONTEXT}:${sessionId}`);
    await this.repository.createSession({
      absoluteExpiresAt,
      authentication,
      csrfSecretHash: sha256Hex(csrfToken),
      encryptedIdToken,
      encryptedRefreshToken,
      encryptionKeyId:
        encryptedRefreshToken === null && encryptedIdToken === null ? null : this.secrets.keyId,
      externalIdentityId: identity.externalIdentityId,
      idleExpiresAt,
      principalId: identity.principalId,
      requestId: input.requestId,
      sessionId,
    });
    if (transaction.reauthenticateSessionId !== null) {
      await this.repository.revokeSession({
        now,
        reason: "REAUTHENTICATED",
        requestId: input.requestId,
        sessionId: transaction.reauthenticateSessionId,
      });
    }
    return { csrfToken, returnTo: transaction.returnTo, sessionId };
  }

  async currentSession(sessionId: string): Promise<CurrentSession> {
    const now = new Date();
    const session = await this.repository.getCurrentSession({
      idleExpiresAt: new Date(now.getTime() + this.config.identity.sessionIdleTtlSeconds * 1000),
      now,
      sessionId,
      touchBefore: new Date(now.getTime() - SESSION_TOUCH_INTERVAL_MS),
    });
    if (session === null) throw new IdentityFlowError("Session is invalid", 401, "invalid_session");
    this.assertPrivilegedAssurance(session);
    return session;
  }

  async refreshSession(input: { requestId: string; sessionId: string }): Promise<void> {
    const now = new Date();
    const session = await this.repository.getSessionSecrets(input.sessionId, now);
    if (session?.encryptedRefreshToken === null || session === null) {
      throw new IdentityFlowError("Reauthentication is required", 401, "reauthentication_required");
    }
    const refreshToken = this.secrets.open(
      session.encryptedRefreshToken,
      `${PROVIDER_REFRESH_CONTEXT}:${input.sessionId}`,
    );
    const refreshed = await this.provider.refresh(refreshToken);
    if (refreshed.subject !== undefined && refreshed.subject !== session.subject) {
      await this.repository.revokeSession({
        now,
        reason: "PROVIDER_SUBJECT_CHANGED",
        requestId: input.requestId,
        sessionId: input.sessionId,
      });
      throw new IdentityFlowError("Provider identity changed", 401, "provider_identity_changed");
    }
    const rotatedRefreshToken = refreshed.refreshToken ?? refreshToken;
    await this.repository.updateRefreshedSession({
      ...(refreshed.assuranceContext === undefined
        ? {}
        : { assuranceContext: refreshed.assuranceContext }),
      ...(refreshed.authenticatedAt === undefined
        ? {}
        : { authenticatedAt: refreshed.authenticatedAt }),
      ...(refreshed.authenticationMethods === undefined
        ? {}
        : { authenticationMethods: refreshed.authenticationMethods }),
      ...(refreshed.idToken === undefined
        ? {}
        : {
            encryptedIdToken:
              refreshed.idToken === null
                ? null
                : this.secrets.seal(
                    refreshed.idToken,
                    `${PROVIDER_ID_TOKEN_CONTEXT}:${input.sessionId}`,
                  ),
          }),
      encryptedRefreshToken: this.secrets.seal(
        rotatedRefreshToken,
        `${PROVIDER_REFRESH_CONTEXT}:${input.sessionId}`,
      ),
      encryptionKeyId: this.secrets.keyId,
      idleExpiresAt: new Date(
        Math.min(
          now.getTime() + this.config.identity.sessionIdleTtlSeconds * 1000,
          session.absoluteExpiresAt.getTime(),
        ),
      ),
      now,
      sessionId: input.sessionId,
    });
  }

  async logout(input: { requestId: string; sessionId: string }): Promise<LogoutResponse> {
    const session = await this.repository.revokeSession({
      now: new Date(),
      reason: "USER_LOGOUT",
      requestId: input.requestId,
      sessionId: input.sessionId,
    });
    if (session === null) return { endSessionUrl: null };

    const refreshToken =
      session.encryptedRefreshToken === null
        ? null
        : this.secrets.open(
            session.encryptedRefreshToken,
            `${PROVIDER_REFRESH_CONTEXT}:${input.sessionId}`,
          );
    const idToken =
      session.encryptedIdToken === null
        ? null
        : this.secrets.open(
            session.encryptedIdToken,
            `${PROVIDER_ID_TOKEN_CONTEXT}:${input.sessionId}`,
          );
    if (refreshToken !== null) {
      try {
        await this.provider.revoke(refreshToken);
      } catch {
        this.logger.warn("Provider token revocation failed after local session revocation");
      }
    }
    try {
      const endSessionUrl = await this.provider.buildEndSessionUrl(idToken);
      return { endSessionUrl: endSessionUrl?.toString() ?? null };
    } catch {
      this.logger.warn("Provider end-session URL could not be created after local logout");
      return { endSessionUrl: null };
    }
  }

  async revokePrincipalSessions(input: {
    actorSessionId: string;
    requestId: string;
    targetPrincipalId: string;
  }): Promise<{ revokedSessionCount: number }> {
    const actor = await this.currentSession(input.actorSessionId);
    await this.authorization.authorize({
      actor,
      context: {
        resourceId: input.targetPrincipalId,
        resourceType: "identity_principal",
      },
      policy: AUTHORIZATION_POLICY.REVOKE_PRINCIPAL_SESSIONS,
      requestId: input.requestId,
    });
    const revokedSessionCount = await this.repository.revokePrincipalSessions({
      actorPrincipalId: actor.principalId,
      now: new Date(),
      reason: "ADMINISTRATIVE_REVOCATION",
      requestId: input.requestId,
      targetPrincipalId: input.targetPrincipalId,
    });
    return { revokedSessionCount };
  }

  private assertPrivilegedAssurance(session: CurrentSession): void {
    const hasPrivilegedRole =
      session.roles.some((role) => PRIVILEGED_ROLES.has(role)) ||
      session.memberships.some((membership) =>
        membership.roles.some((role) => PRIVILEGED_ROLES.has(role)),
      );
    if (
      hasPrivilegedRole &&
      (session.assuranceContext !== this.config.identity.privilegedAssuranceContext ||
        !this.isPrivilegedAuthenticationFresh(new Date(session.authenticatedAt), new Date()))
    ) {
      throw new IdentityFlowError("Step-up authentication is required", 403, "step_up_required");
    }
  }

  private isPrivilegedAuthenticationFresh(authenticatedAt: Date, now: Date): boolean {
    const ageMilliseconds = now.getTime() - authenticatedAt.getTime();
    return (
      Number.isFinite(ageMilliseconds) &&
      ageMilliseconds >= 0 &&
      ageMilliseconds <= this.config.identity.privilegedAuthMaxAgeSeconds * 1000
    );
  }
}

function assertSafeReturnPath(value: string): void {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.length > 2048
  ) {
    throw new IdentityFlowError("Return path is invalid", 400, "invalid_return_path");
  }
}

function parseCallbackUrl(value: string, expectedRedirectUri: string): URL {
  let callback: URL;
  try {
    callback = new URL(value);
  } catch {
    throw new IdentityFlowError("Callback URL is invalid", 400, "invalid_callback_url");
  }
  const expected = new URL(expectedRedirectUri);
  if (callback.origin !== expected.origin || callback.pathname !== expected.pathname) {
    throw new IdentityFlowError("Callback URL is not allowed", 400, "invalid_callback_url");
  }
  return callback;
}
