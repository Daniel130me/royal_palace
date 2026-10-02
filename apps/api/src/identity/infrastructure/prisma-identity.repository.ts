import { Inject, Injectable } from "@nestjs/common";
import type { CurrentSession, PlatformRole } from "@royal-palace/contracts";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import type {
  IdentityRepository,
  OidcAuthenticationResult,
  SessionSecrets,
  StoredLoginTransaction,
} from "../domain/identity.types.js";

@Injectable()
export class PrismaIdentityRepository implements IdentityRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async createLoginTransaction(input: {
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
  }): Promise<void> {
    await this.database.oidcLoginTransaction.create({
      data: {
        encryptionKeyId: input.encryptionKeyId,
        expiresAt: input.expiresAt,
        id: input.id,
        issuer: input.issuer,
        nonceCiphertext: input.nonceCiphertext,
        pkceVerifierCiphertext: input.pkceVerifierCiphertext,
        reauthenticateSessionId: input.reauthenticateSessionId,
        redirectUri: input.redirectUri,
        requestedAssurance: input.requestedAssurance,
        returnTo: input.returnTo,
        stateHash: input.stateHash,
      },
      select: { id: true },
    });
  }

  async consumeLoginTransaction(input: {
    id: string;
    now: Date;
    stateHash: string;
  }): Promise<StoredLoginTransaction | null> {
    return this.database.$transaction(async (transaction) => {
      const record = await transaction.oidcLoginTransaction.findUnique({
        where: { id: input.id },
        select: {
          consumedAt: true,
          expiresAt: true,
          id: true,
          nonceCiphertext: true,
          pkceVerifierCiphertext: true,
          reauthenticateSessionId: true,
          requestedAssurance: true,
          returnTo: true,
          stateHash: true,
        },
      });
      if (
        record === null ||
        record.consumedAt !== null ||
        record.expiresAt <= input.now ||
        record.stateHash !== input.stateHash
      ) {
        return null;
      }

      const consumed = await transaction.oidcLoginTransaction.updateMany({
        where: {
          consumedAt: null,
          expiresAt: { gt: input.now },
          id: input.id,
          stateHash: input.stateHash,
        },
        data: { consumedAt: input.now },
      });
      if (consumed.count !== 1) return null;

      return {
        expiresAt: record.expiresAt,
        id: record.id,
        nonceCiphertext: record.nonceCiphertext,
        pkceVerifierCiphertext: record.pkceVerifierCiphertext,
        reauthenticateSessionId: record.reauthenticateSessionId,
        requestedAssurance: record.requestedAssurance,
        returnTo: record.returnTo,
      };
    });
  }

  async resolveExternalIdentity(input: {
    issuer: string;
    now: Date;
    subject: string;
  }): Promise<{ externalIdentityId: string; principalId: string }> {
    const identity = await this.database.externalIdentity.upsert({
      where: { issuer_subject: { issuer: input.issuer, subject: input.subject } },
      create: {
        id: createOpaqueId(),
        issuer: input.issuer,
        lastAuthenticatedAt: input.now,
        principal: { create: { id: createOpaqueId() } },
        subject: input.subject,
      },
      update: {},
      select: {
        id: true,
        principal: { select: { id: true, status: true } },
        status: true,
      },
    });
    if (identity.status !== "ACTIVE" || identity.principal.status !== "ACTIVE") {
      throw new Error("Identity is not active");
    }
    await this.database.externalIdentity.update({
      where: { id: identity.id },
      data: { lastAuthenticatedAt: input.now },
      select: { id: true },
    });
    return { externalIdentityId: identity.id, principalId: identity.principal.id };
  }

  async validateReauthenticationSession(input: {
    now: Date;
    principalId: string;
    sessionId: string;
  }): Promise<boolean> {
    return (
      (await this.database.authSession.count({
        where: {
          absoluteExpiresAt: { gt: input.now },
          id: input.sessionId,
          idleExpiresAt: { gt: input.now },
          principalId: input.principalId,
          status: "ACTIVE",
        },
      })) === 1
    );
  }

  async synchronizeVerifiedEmail(input: {
    email: string;
    issuer: string;
    now: Date;
    principalId: string;
  }): Promise<void> {
    const normalizedAddress = canonicalEmailAddress(input.email);
    await this.database.$transaction(async (transaction) => {
      // Serialize endpoint replacement per principal. The partial unique index is a
      // second line of defence against concurrent callbacks creating two active emails.
      const principal = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM identity_principals
        WHERE id = ${input.principalId}::uuid AND status = 'ACTIVE'
        FOR UPDATE
      `;
      if (principal.length !== 1) throw new Error("Identity is not active");
      const active = await transaction.notificationRecipientEndpoint.findFirst({
        select: { id: true, normalizedAddress: true },
        where: { channel: "EMAIL", invalidatedAt: null, principalId: input.principalId },
      });
      if (active?.normalizedAddress === normalizedAddress) return;
      if (active !== null) {
        await transaction.notificationRecipientEndpoint.update({
          data: { invalidatedAt: input.now, version: { increment: 1 } },
          where: { id: active.id },
        });
      }
      await transaction.notificationRecipientEndpoint.create({
        data: {
          address: input.email,
          channel: "EMAIL",
          id: createOpaqueId(),
          normalizedAddress,
          principalId: input.principalId,
          sourceIssuer: input.issuer,
          verificationSource: "OIDC_CLAIM",
          verifiedAt: input.now,
        },
        select: { id: true },
      });
    });
  }

  async createSession(input: {
    absoluteExpiresAt: Date;
    authentication: OidcAuthenticationResult;
    csrfSecretHash: string;
    encryptedIdToken: string | null;
    encryptedRefreshToken: string | null;
    encryptionKeyId: string | null;
    externalIdentityId: string;
    idleExpiresAt: Date;
    principalId: string;
    requestId: string;
    sessionId: string;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await transaction.authSession.create({
        data: {
          absoluteExpiresAt: input.absoluteExpiresAt,
          assuranceContext: input.authentication.assuranceContext,
          authenticatedAt: input.authentication.authenticatedAt,
          authenticationMethods: [...input.authentication.authenticationMethods],
          csrfSecretHash: input.csrfSecretHash,
          encryptionKeyId: input.encryptionKeyId,
          externalIdentityId: input.externalIdentityId,
          id: input.sessionId,
          idleExpiresAt: input.idleExpiresAt,
          principalId: input.principalId,
          providerIdTokenCiphertext: input.encryptedIdToken,
          providerRefreshTokenCiphertext: input.encryptedRefreshToken,
          providerSessionId: input.authentication.providerSessionId,
        },
        select: { id: true },
      });
      await transaction.auditEvent.create({
        data: {
          action: "identity.session.created",
          actorPrincipalId: input.principalId,
          id: createOpaqueId(),
          requestId: input.requestId,
          resourceId: input.sessionId,
          resourceType: "auth_session",
          result: "SUCCEEDED",
        },
        select: { id: true },
      });
    });
  }

  async getCurrentSession(input: {
    idleExpiresAt: Date;
    now: Date;
    sessionId: string;
    touchBefore: Date;
  }): Promise<CurrentSession | null> {
    const session = await this.database.authSession.findFirst({
      where: {
        absoluteExpiresAt: { gt: input.now },
        externalIdentity: { status: "ACTIVE" },
        id: input.sessionId,
        idleExpiresAt: { gt: input.now },
        principal: { status: "ACTIVE" },
        status: "ACTIVE",
      },
      select: {
        absoluteExpiresAt: true,
        assuranceContext: true,
        authenticatedAt: true,
        authenticationMethods: true,
        id: true,
        idleExpiresAt: true,
        lastSeenAt: true,
        principal: {
          select: {
            id: true,
            memberships: {
              where: {
                effectiveFrom: { lte: input.now },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: input.now } }],
              },
              select: {
                organizationId: true,
                roleAssignments: {
                  where: {
                    effectiveFrom: { lte: input.now },
                    OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: input.now } }],
                  },
                  select: { role: true },
                },
              },
            },
            roleAssignments: {
              where: {
                effectiveFrom: { lte: input.now },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: input.now } }],
                scope: "PLATFORM",
              },
              select: { role: true },
            },
          },
        },
      },
    });
    if (session === null) return null;

    let idleExpiresAt = session.idleExpiresAt;
    if (session.lastSeenAt < input.touchBefore) {
      idleExpiresAt = new Date(
        Math.min(input.idleExpiresAt.getTime(), session.absoluteExpiresAt.getTime()),
      );
      await this.database.authSession.updateMany({
        where: { id: input.sessionId, lastSeenAt: { lt: input.touchBefore }, status: "ACTIVE" },
        data: { idleExpiresAt, lastSeenAt: input.now, version: { increment: 1 } },
      });
    }

    return {
      absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
      assuranceContext: session.assuranceContext,
      authenticatedAt: session.authenticatedAt.toISOString(),
      authenticationMethods: session.authenticationMethods,
      idleExpiresAt: idleExpiresAt.toISOString(),
      memberships: session.principal.memberships.map((membership) => ({
        organizationId: membership.organizationId,
        roles: membership.roleAssignments.map((assignment) => assignment.role as PlatformRole),
      })),
      principalId: session.principal.id,
      roles: session.principal.roleAssignments.map((assignment) => assignment.role as PlatformRole),
      sessionId: session.id,
    };
  }

  async getSessionSecrets(sessionId: string, now: Date): Promise<SessionSecrets | null> {
    const session = await this.database.authSession.findFirst({
      where: {
        absoluteExpiresAt: { gt: now },
        id: sessionId,
        idleExpiresAt: { gt: now },
        principal: { status: "ACTIVE" },
        status: "ACTIVE",
      },
      select: {
        absoluteExpiresAt: true,
        externalIdentity: { select: { issuer: true, subject: true } },
        externalIdentityId: true,
        principalId: true,
        providerIdTokenCiphertext: true,
        providerRefreshTokenCiphertext: true,
      },
    });
    if (session === null) return null;
    return {
      absoluteExpiresAt: session.absoluteExpiresAt,
      encryptedIdToken: session.providerIdTokenCiphertext,
      encryptedRefreshToken: session.providerRefreshTokenCiphertext,
      externalIdentityId: session.externalIdentityId,
      issuer: session.externalIdentity.issuer,
      principalId: session.principalId,
      subject: session.externalIdentity.subject,
    };
  }

  async revokeSession(input: {
    now: Date;
    reason: string;
    requestId: string;
    sessionId: string;
  }): Promise<SessionSecrets | null> {
    return this.database.$transaction(async (transaction) => {
      const session = await transaction.authSession.findUnique({
        where: { id: input.sessionId },
        select: {
          absoluteExpiresAt: true,
          externalIdentity: { select: { issuer: true, subject: true } },
          externalIdentityId: true,
          principalId: true,
          providerIdTokenCiphertext: true,
          providerRefreshTokenCiphertext: true,
          status: true,
        },
      });
      if (session === null) return null;
      if (session.status === "ACTIVE") {
        await transaction.authSession.update({
          where: { id: input.sessionId },
          data: {
            revocationReason: input.reason,
            revokedAt: input.now,
            status: "REVOKED",
            version: { increment: 1 },
          },
          select: { id: true },
        });
        await transaction.auditEvent.create({
          data: {
            action: "identity.session.revoked",
            actorPrincipalId: session.principalId,
            id: createOpaqueId(),
            metadata: { reason: input.reason },
            reasonCode: input.reason,
            requestId: input.requestId,
            resourceId: input.sessionId,
            resourceType: "auth_session",
            result: "SUCCEEDED",
          },
          select: { id: true },
        });
      }
      return {
        absoluteExpiresAt: session.absoluteExpiresAt,
        encryptedIdToken: session.providerIdTokenCiphertext,
        encryptedRefreshToken: session.providerRefreshTokenCiphertext,
        externalIdentityId: session.externalIdentityId,
        issuer: session.externalIdentity.issuer,
        principalId: session.principalId,
        subject: session.externalIdentity.subject,
      };
    });
  }

  async revokePrincipalSessions(input: {
    actorPrincipalId: string;
    now: Date;
    reason: string;
    requestId: string;
    targetPrincipalId: string;
  }): Promise<number> {
    return this.database.$transaction(async (transaction) => {
      const revoked = await transaction.authSession.updateMany({
        where: { principalId: input.targetPrincipalId, status: "ACTIVE" },
        data: {
          revocationReason: input.reason,
          revokedAt: input.now,
          status: "REVOKED",
          version: { increment: 1 },
        },
      });
      await transaction.auditEvent.create({
        data: {
          action: "identity.principal_sessions.revoked",
          actorPrincipalId: input.actorPrincipalId,
          id: createOpaqueId(),
          metadata: { revokedSessionCount: revoked.count },
          reasonCode: input.reason,
          requestId: input.requestId,
          resourceId: input.targetPrincipalId,
          resourceType: "identity_principal",
          result: "SUCCEEDED",
        },
        select: { id: true },
      });
      return revoked.count;
    });
  }

  async updateRefreshedSession(input: {
    assuranceContext?: string | null;
    authenticatedAt?: Date;
    authenticationMethods?: readonly string[];
    encryptedIdToken?: string | null;
    encryptedRefreshToken?: string | null;
    encryptionKeyId?: string | null;
    idleExpiresAt: Date;
    now: Date;
    sessionId: string;
  }): Promise<void> {
    await this.database.authSession.updateMany({
      where: { id: input.sessionId, status: "ACTIVE" },
      data: {
        ...(input.assuranceContext === undefined
          ? {}
          : { assuranceContext: input.assuranceContext }),
        ...(input.authenticatedAt === undefined ? {} : { authenticatedAt: input.authenticatedAt }),
        ...(input.authenticationMethods === undefined
          ? {}
          : { authenticationMethods: [...input.authenticationMethods] }),
        ...(input.encryptedIdToken === undefined
          ? {}
          : { providerIdTokenCiphertext: input.encryptedIdToken }),
        ...(input.encryptedRefreshToken === undefined
          ? {}
          : { providerRefreshTokenCiphertext: input.encryptedRefreshToken }),
        ...(input.encryptionKeyId === undefined ? {} : { encryptionKeyId: input.encryptionKeyId }),
        idleExpiresAt: input.idleExpiresAt,
        lastSeenAt: input.now,
        version: { increment: 1 },
      },
    });
  }
}

function canonicalEmailAddress(address: string): string {
  const separator = address.lastIndexOf("@");
  if (separator <= 0 || separator === address.length - 1) {
    throw new Error("Verified email claim is invalid");
  }
  return `${address.slice(0, separator)}@${address.slice(separator + 1).toLowerCase()}`;
}
