import type { CurrentSession, PlatformRole } from "@royal-palace/contracts";

import {
  AUTHORIZATION_POLICY,
  type AuthorizationDecision,
  type AuthorizationRequest,
} from "./authorization.types.js";

const ALLOW = {
  ADMINISTRATOR: "allowed_administrator",
  ASSIGNED_CLINICIAN: "allowed_assigned_consented_clinician",
  FINANCE: "allowed_finance",
  ORGANIZATION_MEMBER: "allowed_organization_member",
  OWNER: "allowed_resource_owner",
  SUPPORT: "allowed_support",
} as const;

const PLATFORM_ALLOW_REASON: Readonly<Partial<Record<PlatformRole, string>>> = {
  ADMINISTRATOR: ALLOW.ADMINISTRATOR,
  FINANCE: ALLOW.FINANCE,
  SUPPORT: ALLOW.SUPPORT,
};

export class PolicyEngine {
  evaluate(request: AuthorizationRequest): AuthorizationDecision {
    if (request.actor === null) return this.deny(request.policy, "authentication_required");

    switch (request.policy) {
      case AUTHORIZATION_POLICY.VIEW_ORGANIZATION:
        return this.canViewOrganization(request.actor, request.context.organizationId);
      case AUTHORIZATION_POLICY.REVIEW_APPLICATION:
        return this.allowPlatformRole(request.actor, request.policy, ["SUPPORT", "ADMINISTRATOR"]);
      case AUTHORIZATION_POLICY.DECIDE_APPLICATION:
      case AUTHORIZATION_POLICY.ADMINISTER_ROLE_ASSIGNMENT:
      case AUTHORIZATION_POLICY.REVOKE_PRINCIPAL_SESSIONS:
        return this.allowPlatformRole(request.actor, request.policy, ["ADMINISTRATOR"]);
      case AUTHORIZATION_POLICY.VIEW_PATIENT:
        return this.canViewPatient(request.actor, request.context);
      case AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD:
        return this.canAccessClinicalRecord(request.actor, request.context);
      case AUTHORIZATION_POLICY.ESCALATE_TICKET:
        return this.canEscalateTicket(request.actor, request.context);
      case AUTHORIZATION_POLICY.VIEW_MANAGER_EARNINGS:
        return this.canViewManagerEarnings(request.actor, request.context.managerPrincipalId);
      case AUTHORIZATION_POLICY.VIEW_PATIENT_PAYMENT_AMOUNT:
        return this.canViewPatientPaymentAmount(request.actor, request.context.patientPrincipalId);
      default:
        return this.denyUnknownPolicy(request);
    }
  }

  private canViewOrganization(
    actor: CurrentSession,
    organizationId: string,
  ): AuthorizationDecision {
    const policy = AUTHORIZATION_POLICY.VIEW_ORGANIZATION;
    const platform = this.firstPlatformRole(actor, ["SUPPORT", "ADMINISTRATOR"]);
    if (platform !== null) {
      return this.allow(
        policy,
        platform,
        PLATFORM_ALLOW_REASON[platform] ?? "allowed_platform_role",
      );
    }
    const membership = this.firstOrganizationRole(actor, organizationId, [
      "ORGANIZATION_STAFF",
      "PROVIDER",
      "FINANCE",
      "LOGISTICS",
    ]);
    return membership === null
      ? this.deny(policy, "organization_membership_required")
      : this.allow(policy, membership, ALLOW.ORGANIZATION_MEMBER);
  }

  private canViewPatient(
    actor: CurrentSession,
    context: Extract<AuthorizationRequest, { policy: "VIEW_PATIENT" }>["context"],
  ): AuthorizationDecision {
    const policy = AUTHORIZATION_POLICY.VIEW_PATIENT;
    if (actor.principalId === context.patientPrincipalId && actor.roles.includes("PATIENT")) {
      return this.allow(policy, "PATIENT", ALLOW.OWNER);
    }
    const platform = this.firstPlatformRole(actor, ["SUPPORT", "ADMINISTRATOR"]);
    if (platform !== null && context.viewLevel === "OPERATIONAL") {
      return this.allow(
        policy,
        platform,
        PLATFORM_ALLOW_REASON[platform] ?? "allowed_platform_role",
      );
    }
    if (
      context.organizationId !== undefined &&
      context.hasActiveCareAssignment &&
      context.hasActiveConsent &&
      this.hasOrganizationRole(actor, context.organizationId, "PROVIDER")
    ) {
      return this.allow(policy, "PROVIDER", ALLOW.ASSIGNED_CLINICIAN);
    }
    return this.deny(policy, "patient_relationship_required");
  }

  private canAccessClinicalRecord(
    actor: CurrentSession,
    context: Extract<AuthorizationRequest, { policy: "ACCESS_CLINICAL_RECORD" }>["context"],
  ): AuthorizationDecision {
    const policy = AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD;
    if (
      actor.principalId === context.patientPrincipalId &&
      actor.roles.includes("PATIENT") &&
      context.patientRecordAuthorized
    ) {
      return this.allow(policy, "PATIENT", ALLOW.OWNER);
    }
    if (context.accessLevel === "REDACTED" && actor.roles.includes("SUPPORT")) {
      return this.allow(policy, "SUPPORT", ALLOW.SUPPORT);
    }
    if (
      context.hasActiveCareAssignment &&
      context.hasActiveConsent &&
      this.hasOrganizationRole(actor, context.organizationId, "PROVIDER")
    ) {
      return this.allow(policy, "PROVIDER", ALLOW.ASSIGNED_CLINICIAN);
    }
    return this.deny(policy, "clinical_relationship_and_consent_required");
  }

  private canEscalateTicket(
    actor: CurrentSession,
    context: Extract<AuthorizationRequest, { policy: "ESCALATE_TICKET" }>["context"],
  ): AuthorizationDecision {
    const policy = AUTHORIZATION_POLICY.ESCALATE_TICKET;
    const platform = this.firstPlatformRole(actor, ["SUPPORT", "ADMINISTRATOR"]);
    if (platform !== null) {
      return this.allow(
        policy,
        platform,
        PLATFORM_ALLOW_REASON[platform] ?? "allowed_platform_role",
      );
    }
    if (
      actor.roles.includes("MANAGER") &&
      actor.principalId === context.ticketOwnerPrincipalId &&
      context.disclosureLevel === "MINIMAL"
    ) {
      return this.allow(policy, "MANAGER", ALLOW.OWNER);
    }
    return this.deny(policy, "ticket_owner_with_minimal_disclosure_required");
  }

  private canViewManagerEarnings(
    actor: CurrentSession,
    managerPrincipalId: string,
  ): AuthorizationDecision {
    const policy = AUTHORIZATION_POLICY.VIEW_MANAGER_EARNINGS;
    if (actor.roles.includes("MANAGER") && actor.principalId === managerPrincipalId) {
      return this.allow(policy, "MANAGER", ALLOW.OWNER);
    }
    return this.allowPlatformRole(actor, policy, ["FINANCE", "ADMINISTRATOR"]);
  }

  private canViewPatientPaymentAmount(
    actor: CurrentSession,
    patientPrincipalId: string,
  ): AuthorizationDecision {
    const policy = AUTHORIZATION_POLICY.VIEW_PATIENT_PAYMENT_AMOUNT;
    if (actor.roles.includes("PATIENT") && actor.principalId === patientPrincipalId) {
      return this.allow(policy, "PATIENT", ALLOW.OWNER);
    }
    return this.allowPlatformRole(actor, policy, ["FINANCE", "ADMINISTRATOR"]);
  }

  private allowPlatformRole(
    actor: CurrentSession,
    policy: AuthorizationDecision["policy"],
    roles: readonly PlatformRole[],
  ): AuthorizationDecision {
    const role = this.firstPlatformRole(actor, roles);
    if (role === null) return this.deny(policy, "required_platform_role_missing");
    return this.allow(policy, role, PLATFORM_ALLOW_REASON[role] ?? "allowed_platform_role");
  }

  private firstPlatformRole(
    actor: CurrentSession,
    roles: readonly PlatformRole[],
  ): PlatformRole | null {
    return roles.find((role) => actor.roles.includes(role)) ?? null;
  }

  private firstOrganizationRole(
    actor: CurrentSession,
    organizationId: string,
    roles: readonly PlatformRole[],
  ): PlatformRole | null {
    const membership = actor.memberships.find((item) => item.organizationId === organizationId);
    return roles.find((role) => membership?.roles.includes(role) === true) ?? null;
  }

  private hasOrganizationRole(
    actor: CurrentSession,
    organizationId: string,
    role: PlatformRole,
  ): boolean {
    return this.firstOrganizationRole(actor, organizationId, [role]) === role;
  }

  private allow(
    policy: AuthorizationDecision["policy"],
    effectiveRole: PlatformRole,
    reasonCode: string,
  ): AuthorizationDecision {
    return { allowed: true, effectiveRole, policy, reasonCode };
  }

  private deny(policy: AuthorizationDecision["policy"], reasonCode: string): AuthorizationDecision {
    return { allowed: false, effectiveRole: null, policy, reasonCode };
  }

  private denyUnknownPolicy(request: never): AuthorizationDecision {
    return this.deny(
      (request as { policy?: AuthorizationDecision["policy"] }).policy ??
        AUTHORIZATION_POLICY.ADMINISTER_ROLE_ASSIGNMENT,
      "unknown_policy_denied",
    );
  }
}
