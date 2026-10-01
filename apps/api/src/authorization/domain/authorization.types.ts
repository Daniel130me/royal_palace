import type { CurrentSession, PlatformRole } from "@royal-palace/contracts";

export const AUTHORIZATION_POLICY = {
  ACCESS_CLINICAL_RECORD: "ACCESS_CLINICAL_RECORD",
  ADMINISTER_CATALOGUE: "ADMINISTER_CATALOGUE",
  ADMINISTER_COMMISSION_POLICY: "ADMINISTER_COMMISSION_POLICY",
  ADMINISTER_MANAGER_PROGRAM: "ADMINISTER_MANAGER_PROGRAM",
  ADMINISTER_ROLE_ASSIGNMENT: "ADMINISTER_ROLE_ASSIGNMENT",
  DECIDE_APPLICATION: "DECIDE_APPLICATION",
  CORRECT_REFERRAL_ATTRIBUTION: "CORRECT_REFERRAL_ATTRIBUTION",
  ESCALATE_TICKET: "ESCALATE_TICKET",
  MANAGE_OWN_APPLICATION: "MANAGE_OWN_APPLICATION",
  REVIEW_APPLICATION: "REVIEW_APPLICATION",
  REVOKE_PRINCIPAL_SESSIONS: "REVOKE_PRINCIPAL_SESSIONS",
  RECORD_SETTLED_PATIENT_ACTIVITY: "RECORD_SETTLED_PATIENT_ACTIVITY",
  REVIEW_MANAGER_TICKET: "REVIEW_MANAGER_TICKET",
  VIEW_MANAGER_EARNINGS: "VIEW_MANAGER_EARNINGS",
  VIEW_MANAGER_REFERRALS: "VIEW_MANAGER_REFERRALS",
  VIEW_ORGANIZATION: "VIEW_ORGANIZATION",
  VIEW_PATIENT: "VIEW_PATIENT",
  VIEW_PATIENT_PAYMENT_AMOUNT: "VIEW_PATIENT_PAYMENT_AMOUNT",
} as const;

/** Bump whenever an existing policy's access semantics change. */
export const AUTHORIZATION_POLICY_VERSION = 4;

export type AuthorizationPolicy = (typeof AUTHORIZATION_POLICY)[keyof typeof AUTHORIZATION_POLICY];

interface ResourceReference {
  organizationId?: string;
  patientScopeId?: string;
  resourceId: string;
  resourceType: string;
}

export interface AuthorizationPolicyContexts {
  ACCESS_CLINICAL_RECORD: ResourceReference & {
    accessLevel: "FULL" | "REDACTED";
    hasActiveCareAssignment: boolean;
    hasActiveConsent: boolean;
    patientPrincipalId: string;
    patientRecordAuthorized: boolean;
    organizationId: string;
    patientScopeId: string;
  };
  ADMINISTER_CATALOGUE: ResourceReference;
  ADMINISTER_COMMISSION_POLICY: ResourceReference;
  ADMINISTER_MANAGER_PROGRAM: ResourceReference;
  ADMINISTER_ROLE_ASSIGNMENT: ResourceReference;
  DECIDE_APPLICATION: ResourceReference & { applicantPrincipalId: string };
  CORRECT_REFERRAL_ATTRIBUTION: ResourceReference;
  ESCALATE_TICKET: ResourceReference & {
    disclosureLevel: "MINIMAL" | "FULL";
    ticketOwnerPrincipalId: string;
  };
  MANAGE_OWN_APPLICATION: ResourceReference & { applicantPrincipalId: string };
  REVIEW_APPLICATION: ResourceReference & { applicantPrincipalId: string };
  REVOKE_PRINCIPAL_SESSIONS: ResourceReference;
  RECORD_SETTLED_PATIENT_ACTIVITY: ResourceReference;
  REVIEW_MANAGER_TICKET: ResourceReference;
  VIEW_MANAGER_EARNINGS: ResourceReference & { managerPrincipalId: string };
  VIEW_MANAGER_REFERRALS: ResourceReference & { managerPrincipalId: string };
  VIEW_ORGANIZATION: ResourceReference & { organizationId: string };
  VIEW_PATIENT: ResourceReference & {
    hasActiveCareAssignment: boolean;
    hasActiveConsent: boolean;
    organizationId?: string;
    patientPrincipalId: string;
    patientScopeId: string;
    viewLevel: "CARE" | "OPERATIONAL";
  };
  VIEW_PATIENT_PAYMENT_AMOUNT: ResourceReference & { patientPrincipalId: string };
}

export type AuthorizationContext<P extends AuthorizationPolicy> = AuthorizationPolicyContexts[P];

export type AuthorizationRequest = {
  [P in AuthorizationPolicy]: {
    actor: CurrentSession | null;
    context: AuthorizationContext<P>;
    policy: P;
  };
}[AuthorizationPolicy];

export interface AuthorizationDecision {
  allowed: boolean;
  effectiveRole: PlatformRole | null;
  policy: AuthorizationPolicy;
  reasonCode: string;
}

export interface AuthorizationAuditInput {
  actorPrincipalId: string | null;
  correlationId?: string;
  effectiveRole: PlatformRole | null;
  organizationId?: string;
  patientScopeId?: string;
  policy: AuthorizationPolicy;
  reasonCode: string;
  requestId: string;
  resourceId: string;
  resourceType: string;
  result: "DENIED" | "SUCCEEDED";
}

export interface AuthorizationAuditRepository {
  append(input: AuthorizationAuditInput): Promise<void>;
}
