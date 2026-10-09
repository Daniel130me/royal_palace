import type { CurrentSession, PlatformRole } from "@royal-palace/contracts";
import { describe, expect, it } from "vitest";

import {
  AUTHORIZATION_POLICY,
  type AuthorizationPolicy,
  type AuthorizationRequest,
} from "../src/authorization/domain/authorization.types.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const ALL_ROLES: readonly PlatformRole[] = [
  "PATIENT",
  "MANAGER",
  "ORGANIZATION_APPLICANT",
  "ORGANIZATION_STAFF",
  "PROVIDER",
  "SUPPORT",
  "ADMINISTRATOR",
  "FINANCE",
  "LOGISTICS",
  "SYSTEM_WORKER",
];

const organizationId = createOpaqueId();
const resourceId = createOpaqueId();
const targetPrincipalId = createOpaqueId();

function actor(
  roles: readonly PlatformRole[],
  options: { organizationRoles?: readonly PlatformRole[]; principalId?: string } = {},
): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: "urn:royal-palace:assurance:mfa",
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships:
      options.organizationRoles === undefined
        ? []
        : [{ organizationId, organizationType: "HOSPITAL", roles: options.organizationRoles }],
    principalId: options.principalId ?? createOpaqueId(),
    roles,
    sessionId: createOpaqueId(),
  };
}

function baselineRequest(
  policy: AuthorizationPolicy,
  session: CurrentSession,
): AuthorizationRequest {
  const base = { actor: session, policy };
  switch (policy) {
    case AUTHORIZATION_POLICY.VIEW_ORGANIZATION:
      return {
        ...base,
        policy,
        context: { organizationId, resourceId, resourceType: "organization" },
      };
    case AUTHORIZATION_POLICY.REVIEW_APPLICATION:
    case AUTHORIZATION_POLICY.DECIDE_APPLICATION:
    case AUTHORIZATION_POLICY.MANAGE_OWN_APPLICATION:
      return {
        ...base,
        policy,
        context: {
          applicantPrincipalId: targetPrincipalId,
          resourceId,
          resourceType: "application",
        },
      };
    case AUTHORIZATION_POLICY.VIEW_PATIENT:
      return {
        ...base,
        policy,
        context: {
          hasActiveCareAssignment: false,
          hasActiveConsent: false,
          organizationId,
          patientPrincipalId: targetPrincipalId,
          patientScopeId: targetPrincipalId,
          resourceId,
          resourceType: "patient",
          viewLevel: "OPERATIONAL",
        },
      };
    case AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD:
      return {
        ...base,
        policy,
        context: {
          accessLevel: "FULL",
          hasActiveCareAssignment: false,
          hasActiveConsent: false,
          organizationId,
          patientPrincipalId: targetPrincipalId,
          patientRecordAuthorized: false,
          patientScopeId: targetPrincipalId,
          resourceId,
          resourceType: "clinical_record",
        },
      };
    case AUTHORIZATION_POLICY.ESCALATE_TICKET:
      return {
        ...base,
        policy,
        context: {
          disclosureLevel: "MINIMAL",
          resourceId,
          resourceType: "support_ticket",
          ticketOwnerPrincipalId: targetPrincipalId,
        },
      };
    case AUTHORIZATION_POLICY.VIEW_MANAGER_EARNINGS:
    case AUTHORIZATION_POLICY.VIEW_MANAGER_REFERRALS:
      return {
        ...base,
        policy,
        context: {
          managerPrincipalId: targetPrincipalId,
          resourceId,
          resourceType: "manager_earning",
        },
      };
    case AUTHORIZATION_POLICY.VIEW_PATIENT_PAYMENT_AMOUNT:
    case AUTHORIZATION_POLICY.BOOK_APPOINTMENT:
      return {
        ...base,
        policy,
        context: { patientPrincipalId: targetPrincipalId, resourceId, resourceType: "payment" },
      };
    case AUTHORIZATION_POLICY.MANAGE_PRACTITIONER_AVAILABILITY:
    case AUTHORIZATION_POLICY.MANAGE_OWN_PRESCRIPTION:
      return {
        ...base,
        policy,
        context: {
          practitionerPrincipalId: targetPrincipalId,
          resourceId,
          resourceType: "availability",
        },
      };
    case AUTHORIZATION_POLICY.MANAGE_PHARMACY_PRESCRIPTION:
    case AUTHORIZATION_POLICY.MANAGE_PHARMACY_QUOTE:
    case AUTHORIZATION_POLICY.MANAGE_PHARMACY_HANDOFF:
    case AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY:
      return {
        ...base,
        policy,
        context: { organizationId, resourceId, resourceType: "prescription" },
      };
    case AUTHORIZATION_POLICY.ROUTE_PRESCRIPTION:
    case AUTHORIZATION_POLICY.ACCEPT_PHARMACY_QUOTE:
    case AUTHORIZATION_POLICY.CANCEL_OWN_PHARMACY_ORDER:
      return {
        ...base,
        policy,
        context: {
          patientPrincipalId: targetPrincipalId,
          resourceId,
          resourceType: "prescription",
        },
      };
    case AUTHORIZATION_POLICY.VIEW_PRESCRIPTION:
      return {
        ...base,
        policy,
        context: {
          patientPrincipalId: targetPrincipalId,
          pharmacyOrganizationId: organizationId,
          practitionerPrincipalId: targetPrincipalId,
          resourceId,
          resourceType: "prescription",
        },
      };
    case AUTHORIZATION_POLICY.VIEW_PHARMACY_ORDER:
    case AUTHORIZATION_POLICY.VIEW_PHARMACY_QUOTE:
      return {
        ...base,
        policy,
        context: {
          organizationId,
          patientPrincipalId: targetPrincipalId,
          resourceId,
          resourceType: "pharmacy_commercial",
        },
      };
    case AUTHORIZATION_POLICY.VIEW_APPOINTMENT:
      return {
        ...base,
        policy,
        context: {
          patientPrincipalId: targetPrincipalId,
          practitionerPrincipalId: targetPrincipalId,
          resourceId,
          resourceType: "appointment",
        },
      };
    case AUTHORIZATION_POLICY.ADMINISTER_CONSULTATION_FEES:
    case AUTHORIZATION_POLICY.ADMINISTER_ROLE_ASSIGNMENT:
    case AUTHORIZATION_POLICY.ADMINISTER_CATALOGUE:
    case AUTHORIZATION_POLICY.ADMINISTER_COMMISSION_POLICY:
    case AUTHORIZATION_POLICY.ADMINISTER_MANAGER_PROGRAM:
    case AUTHORIZATION_POLICY.ADMINISTER_NOTIFICATION_DELIVERY:
    case AUTHORIZATION_POLICY.ADMINISTER_PHARMACY_DISPUTE:
    case AUTHORIZATION_POLICY.CORRECT_REFERRAL_ATTRIBUTION:
    case AUTHORIZATION_POLICY.RECORD_SETTLED_PATIENT_ACTIVITY:
    case AUTHORIZATION_POLICY.EXPIRE_APPOINTMENT_RESERVATIONS:
    case AUTHORIZATION_POLICY.EXPIRE_PRESCRIPTIONS:
    case AUTHORIZATION_POLICY.RECONCILE_PAYMENT:
    case AUTHORIZATION_POLICY.REVIEW_MANAGER_TICKET:
      return { ...base, policy, context: { resourceId, resourceType: "role_assignment" } };
    case AUTHORIZATION_POLICY.REVOKE_PRINCIPAL_SESSIONS:
      return { ...base, policy, context: { resourceId, resourceType: "identity_principal" } };
  }
}

describe("PolicyEngine", () => {
  const engine = new PolicyEngine();
  const roleMatrix: Readonly<Record<AuthorizationPolicy, readonly PlatformRole[]>> = {
    ACCESS_CLINICAL_RECORD: [],
    ADMINISTER_CONSULTATION_FEES: ["ADMINISTRATOR"],
    ADMINISTER_CATALOGUE: ["ADMINISTRATOR"],
    ADMINISTER_COMMISSION_POLICY: ["ADMINISTRATOR"],
    ADMINISTER_MANAGER_PROGRAM: ["ADMINISTRATOR"],
    ADMINISTER_NOTIFICATION_DELIVERY: ["ADMINISTRATOR"],
    ADMINISTER_ROLE_ASSIGNMENT: ["ADMINISTRATOR"],
    DECIDE_APPLICATION: ["ADMINISTRATOR"],
    CORRECT_REFERRAL_ATTRIBUTION: ["ADMINISTRATOR"],
    BOOK_APPOINTMENT: [],
    ESCALATE_TICKET: ["SUPPORT", "ADMINISTRATOR"],
    EXPIRE_APPOINTMENT_RESERVATIONS: ["SYSTEM_WORKER"],
    MANAGE_PRACTITIONER_AVAILABILITY: [],
    MANAGE_OWN_PRESCRIPTION: [],
    MANAGE_PHARMACY_PRESCRIPTION: [],
    MANAGE_PHARMACY_QUOTE: [],
    ACCEPT_PHARMACY_QUOTE: [],
    CANCEL_OWN_PHARMACY_ORDER: [],
    MANAGE_PHARMACY_HANDOFF: [],
    MANAGE_PHARMACY_INVENTORY: [],
    ADMINISTER_PHARMACY_DISPUTE: ["ADMINISTRATOR"],
    MANAGE_OWN_APPLICATION: [],
    REVIEW_APPLICATION: ["SUPPORT", "ADMINISTRATOR"],
    REVOKE_PRINCIPAL_SESSIONS: ["ADMINISTRATOR"],
    RECORD_SETTLED_PATIENT_ACTIVITY: ["SYSTEM_WORKER"],
    RECONCILE_PAYMENT: ["FINANCE", "ADMINISTRATOR"],
    REVIEW_MANAGER_TICKET: ["SUPPORT", "ADMINISTRATOR"],
    VIEW_MANAGER_EARNINGS: ["FINANCE", "ADMINISTRATOR"],
    VIEW_MANAGER_REFERRALS: ["SUPPORT", "ADMINISTRATOR"],
    VIEW_ORGANIZATION: ["SUPPORT", "ADMINISTRATOR"],
    VIEW_PATIENT: ["SUPPORT", "ADMINISTRATOR"],
    VIEW_PATIENT_PAYMENT_AMOUNT: ["FINANCE", "ADMINISTRATOR"],
    VIEW_APPOINTMENT: ["SUPPORT", "ADMINISTRATOR"],
    ROUTE_PRESCRIPTION: [],
    VIEW_PRESCRIPTION: [],
    VIEW_PHARMACY_ORDER: ["SUPPORT", "ADMINISTRATOR"],
    VIEW_PHARMACY_QUOTE: ["SUPPORT", "ADMINISTRATOR"],
    EXPIRE_PRESCRIPTIONS: ["SYSTEM_WORKER"],
  };

  for (const [policy, allowedRoles] of Object.entries(roleMatrix) as [
    AuthorizationPolicy,
    readonly PlatformRole[],
  ][]) {
    for (const role of ALL_ROLES) {
      it(`${policy} ${allowedRoles.includes(role) ? "allows" : "denies"} platform role ${role}`, () => {
        expect(engine.evaluate(baselineRequest(policy, actor([role]))).allowed).toBe(
          allowedRoles.includes(role),
        );
      });
    }
  }

  it("defaults to deny for unauthenticated and unknown policies", () => {
    const request = baselineRequest(AUTHORIZATION_POLICY.VIEW_ORGANIZATION, actor([]));
    expect(engine.evaluate({ ...request, actor: null }).allowed).toBe(false);
    expect(
      engine.evaluate({ ...request, policy: "UNKNOWN_POLICY" } as unknown as AuthorizationRequest),
    ).toMatchObject({ allowed: false, reasonCode: "unknown_policy_denied" });
  });

  it("allows an authenticated applicant to manage only their own application", () => {
    const applicant = actor([]);
    const request = baselineRequest(AUTHORIZATION_POLICY.MANAGE_OWN_APPLICATION, applicant);
    if (request.policy !== AUTHORIZATION_POLICY.MANAGE_OWN_APPLICATION) throw new Error();
    expect(
      engine.evaluate({
        ...request,
        context: { ...request.context, applicantPrincipalId: applicant.principalId },
      }).allowed,
    ).toBe(true);
    expect(engine.evaluate(request).allowed).toBe(false);
  });

  it("requires the matching organization membership rather than a platform role", () => {
    expect(
      engine.evaluate(
        baselineRequest(
          AUTHORIZATION_POLICY.VIEW_ORGANIZATION,
          actor([], { organizationRoles: ["ORGANIZATION_STAFF"] }),
        ),
      ).allowed,
    ).toBe(true);
    expect(
      engine.evaluate(
        baselineRequest(AUTHORIZATION_POLICY.VIEW_ORGANIZATION, actor(["ORGANIZATION_STAFF"])),
      ).allowed,
    ).toBe(false);
  });

  it("allows clinical access only for the patient or assigned and consented clinician", () => {
    const patient = actor(["PATIENT"], { principalId: targetPrincipalId });
    const ownRecord = baselineRequest(AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD, patient);
    if (ownRecord.policy !== AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD) throw new Error();
    expect(
      engine.evaluate({
        ...ownRecord,
        context: { ...ownRecord.context, patientRecordAuthorized: true },
      }).allowed,
    ).toBe(true);

    const provider = actor([], { organizationRoles: ["PROVIDER"] });
    const providerRequest = baselineRequest(AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD, provider);
    if (providerRequest.policy !== AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD) throw new Error();
    expect(
      engine.evaluate({
        ...providerRequest,
        context: {
          ...providerRequest.context,
          hasActiveCareAssignment: true,
          hasActiveConsent: true,
        },
      }).allowed,
    ).toBe(true);
    expect(
      engine.evaluate({
        ...providerRequest,
        context: {
          ...providerRequest.context,
          hasActiveCareAssignment: true,
          hasActiveConsent: false,
        },
      }).allowed,
    ).toBe(false);
  });

  it("limits support to redacted clinical access", () => {
    const request = baselineRequest(
      AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD,
      actor(["SUPPORT"]),
    );
    if (request.policy !== AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD) throw new Error();
    expect(engine.evaluate(request).allowed).toBe(false);
    expect(
      engine.evaluate({ ...request, context: { ...request.context, accessLevel: "REDACTED" } })
        .allowed,
    ).toBe(true);
  });

  it("limits managers to their own minimal ticket and earnings views", () => {
    const manager = actor(["MANAGER"]);
    const ticket = baselineRequest(AUTHORIZATION_POLICY.ESCALATE_TICKET, manager);
    const earnings = baselineRequest(AUTHORIZATION_POLICY.VIEW_MANAGER_EARNINGS, manager);
    if (ticket.policy !== AUTHORIZATION_POLICY.ESCALATE_TICKET) throw new Error();
    if (earnings.policy !== AUTHORIZATION_POLICY.VIEW_MANAGER_EARNINGS) throw new Error();

    expect(
      engine.evaluate({
        ...ticket,
        context: { ...ticket.context, ticketOwnerPrincipalId: manager.principalId },
      }).allowed,
    ).toBe(true);
    expect(
      engine.evaluate({
        ...ticket,
        context: {
          ...ticket.context,
          disclosureLevel: "FULL",
          ticketOwnerPrincipalId: manager.principalId,
        },
      }).allowed,
    ).toBe(false);
    expect(
      engine.evaluate({
        ...earnings,
        context: { ...earnings.context, managerPrincipalId: manager.principalId },
      }).allowed,
    ).toBe(true);
    expect(
      engine.evaluate(baselineRequest(AUTHORIZATION_POLICY.VIEW_PATIENT_PAYMENT_AMOUNT, manager))
        .allowed,
    ).toBe(false);
  });

  it("separates pharmacy quote management from patient quote acceptance", () => {
    const pharmacyMember = actor([], { organizationRoles: ["ORGANIZATION_STAFF"] });
    const patient = actor(["PATIENT"], { principalId: targetPrincipalId });

    expect(
      engine.evaluate(baselineRequest(AUTHORIZATION_POLICY.MANAGE_PHARMACY_QUOTE, pharmacyMember))
        .allowed,
    ).toBe(true);
    expect(
      engine.evaluate(baselineRequest(AUTHORIZATION_POLICY.ACCEPT_PHARMACY_QUOTE, patient)).allowed,
    ).toBe(true);
    expect(
      engine.evaluate(baselineRequest(AUTHORIZATION_POLICY.ACCEPT_PHARMACY_QUOTE, pharmacyMember))
        .allowed,
    ).toBe(false);
  });
});
