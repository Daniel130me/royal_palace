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
      case AUTHORIZATION_POLICY.MANAGE_OWN_APPLICATION:
        return request.actor.principalId === request.context.applicantPrincipalId
          ? this.allow(request.policy, this.firstActorRole(request.actor), ALLOW.OWNER)
          : this.deny(request.policy, "application_ownership_required");
      case AUTHORIZATION_POLICY.BOOK_APPOINTMENT:
        return request.actor.roles.includes("PATIENT") &&
          request.actor.principalId === request.context.patientPrincipalId
          ? this.allow(request.policy, "PATIENT", ALLOW.OWNER)
          : this.deny(request.policy, "patient_ownership_required");
      case AUTHORIZATION_POLICY.MANAGE_PRACTITIONER_AVAILABILITY:
        return request.actor.roles.includes("PROVIDER") &&
          request.actor.principalId === request.context.practitionerPrincipalId
          ? this.allow(request.policy, "PROVIDER", ALLOW.OWNER)
          : this.deny(request.policy, "practitioner_ownership_required");
      case AUTHORIZATION_POLICY.MANAGE_OWN_PRESCRIPTION:
        return request.actor.roles.includes("PROVIDER") &&
          request.actor.principalId === request.context.practitionerPrincipalId
          ? this.allow(request.policy, "PROVIDER", ALLOW.OWNER)
          : this.deny(request.policy, "prescription_issuer_required");
      case AUTHORIZATION_POLICY.MANAGE_OWN_LABORATORY_REQUEST:
        return request.actor.roles.includes("PROVIDER") &&
          request.actor.principalId === request.context.practitionerPrincipalId
          ? this.allow(request.policy, "PROVIDER", ALLOW.OWNER)
          : this.deny(request.policy, "laboratory_request_issuer_required");
      case AUTHORIZATION_POLICY.ROUTE_PRESCRIPTION:
        return request.actor.roles.includes("PATIENT") &&
          request.actor.principalId === request.context.patientPrincipalId
          ? this.allow(request.policy, "PATIENT", ALLOW.OWNER)
          : this.deny(request.policy, "prescription_patient_required");
      case AUTHORIZATION_POLICY.ROUTE_LABORATORY_REQUEST:
      case AUTHORIZATION_POLICY.SUBMIT_SERVICE_REVIEW:
        return request.actor.roles.includes("PATIENT") &&
          request.actor.principalId === request.context.patientPrincipalId
          ? this.allow(request.policy, "PATIENT", ALLOW.OWNER)
          : this.deny(request.policy, "laboratory_request_patient_required");
      case AUTHORIZATION_POLICY.VIEW_PRESCRIPTION:
        return this.canViewPrescription(request.actor, request.context);
      case AUTHORIZATION_POLICY.VIEW_LABORATORY_REQUEST:
        return this.canViewLaboratoryRequest(request.actor, request.context);
      case AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT:
        return this.canViewLaboratoryResult(request.actor, request.context);
      case AUTHORIZATION_POLICY.ACKNOWLEDGE_CRITICAL_LABORATORY_RESULT:
        return request.actor.roles.includes("PROVIDER") &&
          request.actor.principalId === request.context.practitionerPrincipalId
          ? this.allow(request.policy, "PROVIDER", ALLOW.OWNER)
          : this.deny(request.policy, "ordering_practitioner_required");
      case AUTHORIZATION_POLICY.MANAGE_PHARMACY_PRESCRIPTION:
      case AUTHORIZATION_POLICY.MANAGE_PHARMACY_SCANNED_PRESCRIPTION:
      case AUTHORIZATION_POLICY.MANAGE_PHARMACY_QUOTE:
      case AUTHORIZATION_POLICY.MANAGE_PHARMACY_HANDOFF:
      case AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY:
      case AUTHORIZATION_POLICY.MANAGE_PHARMACY_SETTINGS:
      case AUTHORIZATION_POLICY.MANAGE_LABORATORY_BOOKING:
      case AUTHORIZATION_POLICY.MANAGE_LABORATORY_RESULT:
      case AUTHORIZATION_POLICY.MANAGE_LOGISTICS_DELIVERY:
      case AUTHORIZATION_POLICY.REQUEST_ORGANIZATION_PAYOUT:
        return this.canManageOrganizationResource(
          request.actor,
          request.context.organizationId,
          request.policy,
        );
      case AUTHORIZATION_POLICY.VIEW_ORGANIZATION_FINANCIALS:
        if (request.context.organizationId === undefined) {
          return this.allowPlatformRole(request.actor, request.policy, [
            "FINANCE",
            "ADMINISTRATOR",
          ]);
        }
        return this.canManageOrganizationResource(
          request.actor,
          request.context.organizationId,
          request.policy,
        );
      case AUTHORIZATION_POLICY.REVIEW_ORGANIZATION_PAYOUT:
        return this.allowPlatformRole(request.actor, request.policy, ["FINANCE", "ADMINISTRATOR"]);
      case AUTHORIZATION_POLICY.ACCEPT_PHARMACY_QUOTE:
      case AUTHORIZATION_POLICY.CREATE_DIRECT_PHARMACY_QUOTE:
      case AUTHORIZATION_POLICY.MANAGE_OWN_SCANNED_PRESCRIPTION:
      case AUTHORIZATION_POLICY.CANCEL_OWN_PHARMACY_ORDER:
        return request.actor.roles.includes("PATIENT") &&
          request.actor.principalId === request.context.patientPrincipalId
          ? this.allow(request.policy, "PATIENT", ALLOW.OWNER)
          : this.deny(request.policy, "patient_ownership_required");
      case AUTHORIZATION_POLICY.VIEW_PHARMACY_ORDER:
      case AUTHORIZATION_POLICY.VIEW_PHARMACY_QUOTE:
        {
          const platform = this.firstPlatformRole(request.actor, ["SUPPORT", "ADMINISTRATOR"]);
          if (platform !== null) {
            return this.allow(
              request.policy,
              platform,
              PLATFORM_ALLOW_REASON[platform] ?? "allowed_platform_role",
            );
          }
        }
        if (
          request.actor.roles.includes("PATIENT") &&
          request.actor.principalId === request.context.patientPrincipalId
        ) {
          return this.allow(request.policy, "PATIENT", ALLOW.OWNER);
        }
        return this.canManageOrganizationResource(
          request.actor,
          request.context.organizationId,
          request.policy,
        );
      case AUTHORIZATION_POLICY.VIEW_LOGISTICS_DELIVERY:
        return this.canViewLogisticsDelivery(request.actor, request.context);
      case AUTHORIZATION_POLICY.VIEW_NOTIFICATION_INBOX:
      case AUTHORIZATION_POLICY.MANAGE_NOTIFICATION_PREFERENCES:
        return request.actor.principalId === request.context.recipientPrincipalId
          ? this.allow(request.policy, this.firstActorRole(request.actor), ALLOW.OWNER)
          : this.deny(request.policy, "notification_recipient_required");
      case AUTHORIZATION_POLICY.MANAGE_ORGANIZATION_TEAM: {
        const platformRole = this.firstPlatformRole(request.actor, ["ADMINISTRATOR"]);
        if (platformRole !== null) {
          return this.allow(request.policy, platformRole, ALLOW.ADMINISTRATOR);
        }
        return this.hasOrganizationRole(
          request.actor,
          request.context.organizationId,
          "ORGANIZATION_ADMIN",
        )
          ? this.allow(request.policy, "ORGANIZATION_ADMIN", ALLOW.ORGANIZATION_MEMBER)
          : this.deny(request.policy, "organization_admin_membership_required");
      }
      case AUTHORIZATION_POLICY.REVIEW_APPLICATION:
        return this.allowPlatformRole(request.actor, request.policy, ["SUPPORT", "ADMINISTRATOR"]);
      case AUTHORIZATION_POLICY.DECIDE_APPLICATION:
      case AUTHORIZATION_POLICY.ADMINISTER_CATALOGUE:
      case AUTHORIZATION_POLICY.ADMINISTER_SERVICE_PRICING:
      case AUTHORIZATION_POLICY.ADMINISTER_CONSULTATION_FEES:
      case AUTHORIZATION_POLICY.ADMINISTER_COMMISSION_POLICY:
      case AUTHORIZATION_POLICY.ADMINISTER_MANAGER_PROGRAM:
      case AUTHORIZATION_POLICY.ADMINISTER_NOTIFICATION_DELIVERY:
      case AUTHORIZATION_POLICY.ADMINISTER_PHARMACY_ORDER_OVERSIGHT:
      case AUTHORIZATION_POLICY.ADMINISTER_LOGISTICS_ASSIGNMENT:
      case AUTHORIZATION_POLICY.ADMINISTER_REVIEW_MODERATION:
      case AUTHORIZATION_POLICY.CORRECT_REFERRAL_ATTRIBUTION:
      case AUTHORIZATION_POLICY.ADMINISTER_ROLE_ASSIGNMENT:
      case AUTHORIZATION_POLICY.ADMINISTER_PHARMACY_DISPUTE:
      case AUTHORIZATION_POLICY.REVOKE_PRINCIPAL_SESSIONS:
        return this.allowPlatformRole(request.actor, request.policy, ["ADMINISTRATOR"]);
      case AUTHORIZATION_POLICY.RECORD_SETTLED_PATIENT_ACTIVITY:
      case AUTHORIZATION_POLICY.EXPIRE_APPOINTMENT_RESERVATIONS:
      case AUTHORIZATION_POLICY.EXPIRE_PHARMACY_QUOTES:
      case AUTHORIZATION_POLICY.EXPIRE_PRESCRIPTIONS:
        return this.allowPlatformRole(request.actor, request.policy, ["SYSTEM_WORKER"]);
      case AUTHORIZATION_POLICY.RECONCILE_PAYMENT:
        return this.allowPlatformRole(request.actor, request.policy, ["FINANCE", "ADMINISTRATOR"]);
      case AUTHORIZATION_POLICY.REVIEW_MANAGER_TICKET:
        return this.allowPlatformRole(request.actor, request.policy, ["SUPPORT", "ADMINISTRATOR"]);
      case AUTHORIZATION_POLICY.VIEW_PATIENT:
        return this.canViewPatient(request.actor, request.context);
      case AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD:
        return this.canAccessClinicalRecord(request.actor, request.context);
      case AUTHORIZATION_POLICY.ESCALATE_TICKET:
        return this.canEscalateTicket(request.actor, request.context);
      case AUTHORIZATION_POLICY.VIEW_MANAGER_EARNINGS:
        return this.canViewManagerEarnings(request.actor, request.context.managerPrincipalId);
      case AUTHORIZATION_POLICY.VIEW_MANAGER_REFERRALS:
        return this.canViewManagerReferrals(request.actor, request.context.managerPrincipalId);
      case AUTHORIZATION_POLICY.VIEW_PATIENT_PAYMENT_AMOUNT:
        return this.canViewPatientPaymentAmount(request.actor, request.context.patientPrincipalId);
      case AUTHORIZATION_POLICY.VIEW_APPOINTMENT:
        if (
          request.actor.roles.includes("PATIENT") &&
          request.actor.principalId === request.context.patientPrincipalId
        ) {
          return this.allow(request.policy, "PATIENT", ALLOW.OWNER);
        }
        if (
          request.context.practitionerPrincipalId !== null &&
          request.actor.roles.includes("PROVIDER") &&
          request.actor.principalId === request.context.practitionerPrincipalId
        ) {
          return this.allow(request.policy, "PROVIDER", ALLOW.OWNER);
        }
        return this.allowPlatformRole(request.actor, request.policy, ["SUPPORT", "ADMINISTRATOR"]);
      default:
        return this.denyUnknownPolicy(request);
    }
  }

  private canViewLogisticsDelivery(
    actor: CurrentSession,
    context: Extract<AuthorizationRequest, { policy: "VIEW_LOGISTICS_DELIVERY" }>["context"],
  ): AuthorizationDecision {
    const policy = AUTHORIZATION_POLICY.VIEW_LOGISTICS_DELIVERY;
    const administrator = this.firstPlatformRole(actor, ["ADMINISTRATOR"]);
    if (administrator !== null) {
      return this.allow(policy, administrator, ALLOW.ADMINISTRATOR);
    }
    if (actor.roles.includes("PATIENT") && actor.principalId === context.patientPrincipalId) {
      return this.allow(policy, "PATIENT", ALLOW.OWNER);
    }
    const organizationRole = this.firstOrganizationRole(actor, context.logisticsOrganizationId, [
      "ORGANIZATION_ADMIN",
      "ORGANIZATION_STAFF",
      "LOGISTICS",
    ]);
    if (organizationRole !== null) {
      return this.allow(policy, organizationRole, ALLOW.ORGANIZATION_MEMBER);
    }
    return this.canManageOrganizationResource(actor, context.pharmacyOrganizationId, policy);
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

  private canViewManagerReferrals(
    actor: CurrentSession,
    managerPrincipalId: string,
  ): AuthorizationDecision {
    const policy = AUTHORIZATION_POLICY.VIEW_MANAGER_REFERRALS;
    if (actor.roles.includes("MANAGER") && actor.principalId === managerPrincipalId) {
      return this.allow(policy, "MANAGER", ALLOW.OWNER);
    }
    return this.allowPlatformRole(actor, policy, ["SUPPORT", "ADMINISTRATOR"]);
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

  private canViewPrescription(
    actor: CurrentSession,
    context: Extract<AuthorizationRequest, { policy: "VIEW_PRESCRIPTION" }>["context"],
  ): AuthorizationDecision {
    const policy = AUTHORIZATION_POLICY.VIEW_PRESCRIPTION;
    if (actor.roles.includes("PATIENT") && actor.principalId === context.patientPrincipalId) {
      return this.allow(policy, "PATIENT", ALLOW.OWNER);
    }
    if (actor.roles.includes("PROVIDER") && actor.principalId === context.practitionerPrincipalId) {
      return this.allow(policy, "PROVIDER", ALLOW.OWNER);
    }
    if (context.pharmacyOrganizationId !== undefined) {
      return this.canManageOrganizationResource(actor, context.pharmacyOrganizationId, policy);
    }
    return this.deny(policy, "prescription_relationship_required");
  }

  private canViewLaboratoryRequest(
    actor: CurrentSession,
    context: Extract<AuthorizationRequest, { policy: "VIEW_LABORATORY_REQUEST" }>["context"],
  ): AuthorizationDecision {
    const policy = AUTHORIZATION_POLICY.VIEW_LABORATORY_REQUEST;
    if (actor.roles.includes("PATIENT") && actor.principalId === context.patientPrincipalId) {
      return this.allow(policy, "PATIENT", ALLOW.OWNER);
    }
    if (actor.roles.includes("PROVIDER") && actor.principalId === context.practitionerPrincipalId) {
      return this.allow(policy, "PROVIDER", ALLOW.OWNER);
    }
    if (context.laboratoryOrganizationId !== undefined) {
      return this.canManageOrganizationResource(actor, context.laboratoryOrganizationId, policy);
    }
    return this.deny(policy, "laboratory_request_relationship_required");
  }

  private canViewLaboratoryResult(
    actor: CurrentSession,
    context: Extract<AuthorizationRequest, { policy: "VIEW_LABORATORY_RESULT" }>["context"],
  ): AuthorizationDecision {
    const policy = AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT;
    if (actor.roles.includes("PATIENT") && actor.principalId === context.patientPrincipalId) {
      return this.allow(policy, "PATIENT", ALLOW.OWNER);
    }
    if (actor.roles.includes("PROVIDER") && actor.principalId === context.practitionerPrincipalId) {
      return this.allow(policy, "PROVIDER", ALLOW.OWNER);
    }
    return this.canManageOrganizationResource(actor, context.laboratoryOrganizationId, policy);
  }

  private canManageOrganizationResource(
    actor: CurrentSession,
    organizationId: string,
    policy: AuthorizationDecision["policy"],
  ): AuthorizationDecision {
    const role = this.firstOrganizationRole(actor, organizationId, [
      "ORGANIZATION_STAFF",
      "PROVIDER",
    ]);
    const denialReason =
      policy === AUTHORIZATION_POLICY.MANAGE_LABORATORY_BOOKING ||
      policy === AUTHORIZATION_POLICY.MANAGE_LABORATORY_RESULT ||
      policy === AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT ||
      policy === AUTHORIZATION_POLICY.VIEW_LABORATORY_REQUEST
        ? "assigned_laboratory_membership_required"
        : "assigned_pharmacy_membership_required";
    return role === null
      ? this.deny(policy, denialReason)
      : this.allow(policy, role, ALLOW.ORGANIZATION_MEMBER);
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

  private firstActorRole(actor: CurrentSession): PlatformRole | null {
    return actor.roles[0] ?? actor.memberships[0]?.roles[0] ?? null;
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
    effectiveRole: PlatformRole | null,
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
