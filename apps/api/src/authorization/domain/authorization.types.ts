import type { CurrentSession, PlatformRole } from "@royal-palace/contracts";

export const AUTHORIZATION_POLICY = {
  ACCESS_CLINICAL_RECORD: "ACCESS_CLINICAL_RECORD",
  ADMINISTER_CONSULTATION_FEES: "ADMINISTER_CONSULTATION_FEES",
  ADMINISTER_CATALOGUE: "ADMINISTER_CATALOGUE",
  ADMINISTER_SERVICE_PRICING: "ADMINISTER_SERVICE_PRICING",
  ADMINISTER_COMMISSION_POLICY: "ADMINISTER_COMMISSION_POLICY",
  ADMINISTER_MANAGER_PROGRAM: "ADMINISTER_MANAGER_PROGRAM",
  ADMINISTER_NOTIFICATION_DELIVERY: "ADMINISTER_NOTIFICATION_DELIVERY",
  ADMINISTER_PHARMACY_ORDER_OVERSIGHT: "ADMINISTER_PHARMACY_ORDER_OVERSIGHT",
  VIEW_NOTIFICATION_INBOX: "VIEW_NOTIFICATION_INBOX",
  MANAGE_NOTIFICATION_PREFERENCES: "MANAGE_NOTIFICATION_PREFERENCES",
  ADMINISTER_ROLE_ASSIGNMENT: "ADMINISTER_ROLE_ASSIGNMENT",
  DECIDE_APPLICATION: "DECIDE_APPLICATION",
  CORRECT_REFERRAL_ATTRIBUTION: "CORRECT_REFERRAL_ATTRIBUTION",
  ESCALATE_TICKET: "ESCALATE_TICKET",
  EXPIRE_APPOINTMENT_RESERVATIONS: "EXPIRE_APPOINTMENT_RESERVATIONS",
  EXPIRE_PHARMACY_QUOTES: "EXPIRE_PHARMACY_QUOTES",
  BOOK_APPOINTMENT: "BOOK_APPOINTMENT",
  MANAGE_PRACTITIONER_AVAILABILITY: "MANAGE_PRACTITIONER_AVAILABILITY",
  MANAGE_OWN_PRESCRIPTION: "MANAGE_OWN_PRESCRIPTION",
  MANAGE_PHARMACY_PRESCRIPTION: "MANAGE_PHARMACY_PRESCRIPTION",
  MANAGE_PHARMACY_SCANNED_PRESCRIPTION: "MANAGE_PHARMACY_SCANNED_PRESCRIPTION",
  MANAGE_PHARMACY_QUOTE: "MANAGE_PHARMACY_QUOTE",
  ACCEPT_PHARMACY_QUOTE: "ACCEPT_PHARMACY_QUOTE",
  CREATE_DIRECT_PHARMACY_QUOTE: "CREATE_DIRECT_PHARMACY_QUOTE",
  MANAGE_OWN_SCANNED_PRESCRIPTION: "MANAGE_OWN_SCANNED_PRESCRIPTION",
  CANCEL_OWN_PHARMACY_ORDER: "CANCEL_OWN_PHARMACY_ORDER",
  MANAGE_PHARMACY_HANDOFF: "MANAGE_PHARMACY_HANDOFF",
  MANAGE_PHARMACY_INVENTORY: "MANAGE_PHARMACY_INVENTORY",
  MANAGE_PHARMACY_SETTINGS: "MANAGE_PHARMACY_SETTINGS",
  MANAGE_OWN_LABORATORY_REQUEST: "MANAGE_OWN_LABORATORY_REQUEST",
  ROUTE_LABORATORY_REQUEST: "ROUTE_LABORATORY_REQUEST",
  VIEW_LABORATORY_REQUEST: "VIEW_LABORATORY_REQUEST",
  MANAGE_LABORATORY_BOOKING: "MANAGE_LABORATORY_BOOKING",
  MANAGE_LABORATORY_RESULT: "MANAGE_LABORATORY_RESULT",
  SUBMIT_SERVICE_REVIEW: "SUBMIT_SERVICE_REVIEW",
  VIEW_LABORATORY_RESULT: "VIEW_LABORATORY_RESULT",
  ACKNOWLEDGE_CRITICAL_LABORATORY_RESULT: "ACKNOWLEDGE_CRITICAL_LABORATORY_RESULT",
  ADMINISTER_PHARMACY_DISPUTE: "ADMINISTER_PHARMACY_DISPUTE",
  MANAGE_OWN_APPLICATION: "MANAGE_OWN_APPLICATION",
  REVIEW_APPLICATION: "REVIEW_APPLICATION",
  REVOKE_PRINCIPAL_SESSIONS: "REVOKE_PRINCIPAL_SESSIONS",
  RECORD_SETTLED_PATIENT_ACTIVITY: "RECORD_SETTLED_PATIENT_ACTIVITY",
  RECONCILE_PAYMENT: "RECONCILE_PAYMENT",
  REVIEW_MANAGER_TICKET: "REVIEW_MANAGER_TICKET",
  VIEW_MANAGER_EARNINGS: "VIEW_MANAGER_EARNINGS",
  VIEW_MANAGER_REFERRALS: "VIEW_MANAGER_REFERRALS",
  VIEW_ORGANIZATION: "VIEW_ORGANIZATION",
  VIEW_PATIENT: "VIEW_PATIENT",
  VIEW_PATIENT_PAYMENT_AMOUNT: "VIEW_PATIENT_PAYMENT_AMOUNT",
  VIEW_ORGANIZATION_FINANCIALS: "VIEW_ORGANIZATION_FINANCIALS",
  REQUEST_ORGANIZATION_PAYOUT: "REQUEST_ORGANIZATION_PAYOUT",
  REVIEW_ORGANIZATION_PAYOUT: "REVIEW_ORGANIZATION_PAYOUT",
  VIEW_APPOINTMENT: "VIEW_APPOINTMENT",
  ROUTE_PRESCRIPTION: "ROUTE_PRESCRIPTION",
  VIEW_PRESCRIPTION: "VIEW_PRESCRIPTION",
  VIEW_PHARMACY_ORDER: "VIEW_PHARMACY_ORDER",
  VIEW_PHARMACY_QUOTE: "VIEW_PHARMACY_QUOTE",
  EXPIRE_PRESCRIPTIONS: "EXPIRE_PRESCRIPTIONS",
} as const;

/** Bump whenever an existing policy's access semantics change. */
export const AUTHORIZATION_POLICY_VERSION = 21;

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
  ADMINISTER_CONSULTATION_FEES: ResourceReference;
  ADMINISTER_CATALOGUE: ResourceReference;
  ADMINISTER_SERVICE_PRICING: ResourceReference;
  ADMINISTER_COMMISSION_POLICY: ResourceReference;
  ADMINISTER_MANAGER_PROGRAM: ResourceReference;
  ADMINISTER_NOTIFICATION_DELIVERY: ResourceReference;
  ADMINISTER_PHARMACY_ORDER_OVERSIGHT: ResourceReference;
  VIEW_NOTIFICATION_INBOX: ResourceReference & { recipientPrincipalId: string };
  MANAGE_NOTIFICATION_PREFERENCES: ResourceReference & { recipientPrincipalId: string };
  ADMINISTER_ROLE_ASSIGNMENT: ResourceReference;
  DECIDE_APPLICATION: ResourceReference & { applicantPrincipalId: string };
  CORRECT_REFERRAL_ATTRIBUTION: ResourceReference;
  BOOK_APPOINTMENT: ResourceReference & { patientPrincipalId: string };
  ESCALATE_TICKET: ResourceReference & {
    disclosureLevel: "MINIMAL" | "FULL";
    ticketOwnerPrincipalId: string;
  };
  EXPIRE_APPOINTMENT_RESERVATIONS: ResourceReference;
  EXPIRE_PHARMACY_QUOTES: ResourceReference;
  MANAGE_OWN_APPLICATION: ResourceReference & { applicantPrincipalId: string };
  MANAGE_PRACTITIONER_AVAILABILITY: ResourceReference & {
    practitionerPrincipalId: string;
  };
  MANAGE_OWN_PRESCRIPTION: ResourceReference & { practitionerPrincipalId: string };
  MANAGE_PHARMACY_PRESCRIPTION: ResourceReference & { organizationId: string };
  MANAGE_PHARMACY_SCANNED_PRESCRIPTION: ResourceReference & { organizationId: string };
  MANAGE_PHARMACY_QUOTE: ResourceReference & { organizationId: string };
  ACCEPT_PHARMACY_QUOTE: ResourceReference & { patientPrincipalId: string };
  CREATE_DIRECT_PHARMACY_QUOTE: ResourceReference & { patientPrincipalId: string };
  MANAGE_OWN_SCANNED_PRESCRIPTION: ResourceReference & { patientPrincipalId: string };
  CANCEL_OWN_PHARMACY_ORDER: ResourceReference & { patientPrincipalId: string };
  MANAGE_PHARMACY_HANDOFF: ResourceReference & { organizationId: string };
  MANAGE_PHARMACY_INVENTORY: ResourceReference & { organizationId: string };
  MANAGE_PHARMACY_SETTINGS: ResourceReference & { organizationId: string };
  MANAGE_OWN_LABORATORY_REQUEST: ResourceReference & { practitionerPrincipalId: string };
  ROUTE_LABORATORY_REQUEST: ResourceReference & { patientPrincipalId: string };
  VIEW_LABORATORY_REQUEST: ResourceReference & {
    laboratoryOrganizationId?: string;
    patientPrincipalId: string;
    practitionerPrincipalId: string;
  };
  MANAGE_LABORATORY_BOOKING: ResourceReference & { organizationId: string };
  MANAGE_LABORATORY_RESULT: ResourceReference & { organizationId: string };
  SUBMIT_SERVICE_REVIEW: ResourceReference & { patientPrincipalId: string };
  VIEW_LABORATORY_RESULT: ResourceReference & {
    laboratoryOrganizationId: string;
    patientPrincipalId: string;
    practitionerPrincipalId: string;
  };
  ACKNOWLEDGE_CRITICAL_LABORATORY_RESULT: ResourceReference & {
    practitionerPrincipalId: string;
  };
  ADMINISTER_PHARMACY_DISPUTE: ResourceReference;
  REVIEW_APPLICATION: ResourceReference & { applicantPrincipalId: string };
  REVOKE_PRINCIPAL_SESSIONS: ResourceReference;
  RECORD_SETTLED_PATIENT_ACTIVITY: ResourceReference;
  RECONCILE_PAYMENT: ResourceReference;
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
  VIEW_ORGANIZATION_FINANCIALS: ResourceReference & { organizationId?: string };
  REQUEST_ORGANIZATION_PAYOUT: ResourceReference & { organizationId: string };
  REVIEW_ORGANIZATION_PAYOUT: ResourceReference;
  VIEW_APPOINTMENT: ResourceReference & {
    patientPrincipalId: string;
    practitionerPrincipalId: string | null;
  };
  ROUTE_PRESCRIPTION: ResourceReference & { patientPrincipalId: string };
  VIEW_PRESCRIPTION: ResourceReference & {
    patientPrincipalId: string;
    pharmacyOrganizationId?: string;
    practitionerPrincipalId: string;
  };
  VIEW_PHARMACY_ORDER: ResourceReference & {
    organizationId: string;
    patientPrincipalId: string;
  };
  VIEW_PHARMACY_QUOTE: ResourceReference & {
    organizationId: string;
    patientPrincipalId: string;
  };
  EXPIRE_PRESCRIPTIONS: ResourceReference;
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
