import type { CurrentSession } from "@royal-palace/contracts";

export interface AuthorizationRequest {
  codeChallenge: string;
  nonce: string;
  requestedAssurance?: string;
  state: string;
}

export interface OidcAuthenticationResult {
  assuranceContext: string | null;
  authenticatedAt: Date;
  authenticationMethods: readonly string[];
  idToken: string | null;
  issuer: string;
  providerSessionId: string | null;
  refreshToken: string | null;
  subject: string;
  verifiedEmail: string | null;
}

export interface OidcProvider {
  buildAuthorizationUrl(request: AuthorizationRequest): Promise<URL>;
  completeAuthorization(input: {
    currentUrl: URL;
    expectedNonce: string;
    expectedState: string;
    pkceCodeVerifier: string;
    requiredMaxAgeSeconds?: number;
  }): Promise<OidcAuthenticationResult>;
  refresh(refreshToken: string): Promise<
    Partial<OidcAuthenticationResult> & {
      refreshToken: string | null;
    }
  >;
  revoke(refreshToken: string): Promise<void>;
  buildEndSessionUrl(idToken: string | null): Promise<URL | null>;
}

export interface StoredLoginTransaction {
  expiresAt: Date;
  id: string;
  nonceCiphertext: string;
  pkceVerifierCiphertext: string;
  reauthenticateSessionId: string | null;
  requestedAssurance: string | null;
  returnTo: string;
}

export interface SessionSecrets {
  absoluteExpiresAt: Date;
  encryptedIdToken: string | null;
  encryptedRefreshToken: string | null;
  externalIdentityId: string;
  issuer: string;
  principalId: string;
  subject: string;
}

export interface IdentityRepository {
  consumeLoginTransaction(input: {
    id: string;
    now: Date;
    stateHash: string;
  }): Promise<StoredLoginTransaction | null>;
  createLoginTransaction(input: {
    encryptionKeyId: string;
    expiresAt: Date;
    id: string;
    issuer: string;
    nonceCiphertext: string;
    pkceVerifierCiphertext: string;
    reauthenticateSessionId: string | null;
    redirectUri: string;
    requestedAssurance: string | null;
    returnTo: string;
    stateHash: string;
  }): Promise<void>;
  createSession(input: {
    authentication: OidcAuthenticationResult;
    csrfSecretHash: string;
    encryptedIdToken: string | null;
    encryptedRefreshToken: string | null;
    encryptionKeyId: string | null;
    externalIdentityId: string;
    principalId: string;
    requestId: string;
    sessionId: string;
    absoluteExpiresAt: Date;
    idleExpiresAt: Date;
  }): Promise<void>;
  getCurrentSession(input: {
    idleExpiresAt: Date;
    now: Date;
    sessionId: string;
    touchBefore: Date;
  }): Promise<CurrentSession | null>;
  getSessionSecrets(sessionId: string, now: Date): Promise<SessionSecrets | null>;
  resolveExternalIdentity(input: {
    issuer: string;
    now: Date;
    subject: string;
  }): Promise<{ externalIdentityId: string; principalId: string }>;
  revokePrincipalSessions(input: {
    actorPrincipalId: string;
    now: Date;
    reason: string;
    requestId: string;
    targetPrincipalId: string;
  }): Promise<number>;
  revokeSession(input: {
    now: Date;
    reason: string;
    requestId: string;
    sessionId: string;
  }): Promise<SessionSecrets | null>;
  synchronizeVerifiedEmail(input: {
    email: string;
    issuer: string;
    now: Date;
    principalId: string;
  }): Promise<void>;
  updateRefreshedSession(input: {
    assuranceContext?: string | null;
    authenticatedAt?: Date;
    authenticationMethods?: readonly string[];
    encryptedIdToken?: string | null;
    encryptedRefreshToken?: string | null;
    encryptionKeyId?: string | null;
    idleExpiresAt: Date;
    now: Date;
    sessionId: string;
  }): Promise<void>;
  validateReauthenticationSession(input: {
    now: Date;
    principalId: string;
    sessionId: string;
  }): Promise<boolean>;
}
