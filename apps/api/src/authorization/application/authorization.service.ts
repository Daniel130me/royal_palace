import { Inject, Injectable } from "@nestjs/common";

import {
  type AuthorizationAuditRepository,
  type AuthorizationContext,
  type AuthorizationDecision,
  type AuthorizationPolicy,
} from "../domain/authorization.types.js";
import type { PolicyEngine } from "../domain/policy-engine.js";
import { AUTHORIZATION_AUDIT_REPOSITORY, POLICY_ENGINE } from "../authorization.tokens.js";
import type { CurrentSession } from "@royal-palace/contracts";

export class AuthorizationDeniedError extends Error {
  constructor(
    readonly decision: AuthorizationDecision,
    message = "Access is denied",
  ) {
    super(message);
    this.name = "AuthorizationDeniedError";
  }
}

interface AuthorizeInput<P extends AuthorizationPolicy> {
  actor: CurrentSession | null;
  context: AuthorizationContext<P>;
  correlationId?: string;
  policy: P;
  requestId: string;
}

/**
 * The single application boundary for protected actions. Every decision is appended
 * before control returns, so an unavailable audit store fails the request closed.
 */
@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(POLICY_ENGINE) private readonly policies: PolicyEngine,
    @Inject(AUTHORIZATION_AUDIT_REPOSITORY)
    private readonly audit: AuthorizationAuditRepository,
  ) {}

  async authorize<P extends AuthorizationPolicy>(
    input: AuthorizeInput<P>,
  ): Promise<AuthorizationDecision> {
    const decision = this.policies.evaluate({
      actor: input.actor,
      context: input.context,
      policy: input.policy,
    } as Parameters<PolicyEngine["evaluate"]>[0]);

    await this.audit.append({
      actorPrincipalId: input.actor?.principalId ?? null,
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
      effectiveRole: decision.effectiveRole,
      ...(input.context.organizationId === undefined
        ? {}
        : { organizationId: input.context.organizationId }),
      ...(input.context.patientScopeId === undefined
        ? {}
        : { patientScopeId: input.context.patientScopeId }),
      policy: input.policy,
      reasonCode: decision.reasonCode,
      requestId: input.requestId,
      resourceId: input.context.resourceId,
      resourceType: input.context.resourceType,
      result: decision.allowed ? "SUCCEEDED" : "DENIED",
    });

    if (!decision.allowed) throw new AuthorizationDeniedError(decision);
    return decision;
  }
}
