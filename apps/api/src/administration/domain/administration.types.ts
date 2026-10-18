import type {
  AdminAppointmentListResponse,
  AdminAppointmentScope,
  AdminAuditEventListResponse,
  AdminComplaintListResponse,
  AdminComplaintPriority,
  AdminComplaintScope,
  AdminComplaintStatus,
  AdminComplaintTransitionResponse,
  AdminDashboardResponse,
  AdminDeliveryListResponse,
  AdminDeliveryScope,
  AdminPractitionerDetail,
  AdminPractitionerListResponse,
  AdminPractitionerScope,
  AdminPrincipalListResponse,
  AdminPrincipalScope,
  PractitionerVerificationStatus,
  PlatformRole,
} from "@royal-palace/contracts";

export interface AdministrationCursor {
  id: string;
  timestamp: Date;
}

export interface ListAdminAppointmentsQuery {
  cursor?: AdministrationCursor;
  dayFrom: Date;
  dayTo: Date;
  limit: number;
  query?: string;
  scope: AdminAppointmentScope;
}

export interface ListAdminAuditEventsQuery {
  action?: string;
  cursor?: AdministrationCursor;
  effectiveRole?: PlatformRole;
  from?: Date;
  limit: number;
  query?: string;
  to?: Date;
}

export interface ListAdminComplaintsQuery {
  cursor?: AdministrationCursor;
  limit: number;
  priority?: AdminComplaintPriority;
  query?: string;
  scope: AdminComplaintScope;
}

export interface ListAdminDeliveriesQuery {
  cursor?: AdministrationCursor;
  limit: number;
  query?: string;
  scope: AdminDeliveryScope;
}

export interface ListAdminPractitionersQuery {
  cursor?: AdministrationCursor;
  limit: number;
  query?: string;
  scope: AdminPractitionerScope;
}

export interface ListAdminPrincipalsQuery {
  cursor?: AdministrationCursor;
  limit: number;
  query?: string;
  role?: PlatformRole;
  scope: AdminPrincipalScope;
}

export type TransitionAdminPrincipalResult =
  | { outcome: "UPDATED"; principal: AdminPrincipalListResponse["data"][number] }
  | {
      outcome:
        "LAST_ADMINISTRATOR" | "NO_CHANGE" | "NOT_FOUND" | "SELF_DISABLE" | "VERSION_CONFLICT";
    };

export interface IdentityAdministrationRepository {
  listPrincipals(query: ListAdminPrincipalsQuery): Promise<AdminPrincipalListResponse>;
  transitionPrincipal(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    principalId: string;
    reason: string;
    requestId: string;
    status: "ACTIVE" | "DISABLED";
  }): Promise<TransitionAdminPrincipalResult>;
}

export interface AdminDashboardQuery {
  credentialExpiringBefore: Date;
  dayFrom: Date;
  dayTo: Date;
}

export interface TransitionAdminComplaintInput {
  actorPrincipalId: string;
  allowedFromStatuses: readonly AdminComplaintStatus[];
  complaintId: string;
  expectedVersion: number;
  internalNote?: string;
  occurredAt: Date;
  status: AdminComplaintStatus;
}

export interface TransitionAdminPractitionerInput {
  actorPrincipalId: string;
  allowedFromStatuses: readonly PractitionerVerificationStatus[];
  expectedVersion: number;
  note?: string;
  occurredAt: Date;
  practitionerId: string;
  requestId: string;
  status: Exclude<PractitionerVerificationStatus, "PENDING">;
}

export interface AdministrationRepository {
  getDashboard(query: AdminDashboardQuery): Promise<AdminDashboardResponse>;
  listAppointments(query: ListAdminAppointmentsQuery): Promise<AdminAppointmentListResponse>;
  listAuditEvents(query: ListAdminAuditEventsQuery): Promise<AdminAuditEventListResponse>;
  listComplaints(query: ListAdminComplaintsQuery): Promise<AdminComplaintListResponse>;
  listDeliveries(query: ListAdminDeliveriesQuery): Promise<AdminDeliveryListResponse>;
  listPractitioners(query: ListAdminPractitionersQuery): Promise<AdminPractitionerListResponse>;
  getPractitioner(practitionerId: string): Promise<AdminPractitionerDetail | null>;
  transitionPractitioner(
    input: TransitionAdminPractitionerInput,
  ): Promise<AdminPractitionerDetail | null>;
  transitionComplaint(
    input: TransitionAdminComplaintInput,
  ): Promise<AdminComplaintTransitionResponse | null>;
}

export const ADMINISTRATION_REPOSITORY = Symbol("ADMINISTRATION_REPOSITORY");
export const IDENTITY_ADMINISTRATION_REPOSITORY = Symbol("IDENTITY_ADMINISTRATION_REPOSITORY");
