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

export interface AdministrationRepository {
  getDashboard(query: AdminDashboardQuery): Promise<AdminDashboardResponse>;
  listAppointments(query: ListAdminAppointmentsQuery): Promise<AdminAppointmentListResponse>;
  listAuditEvents(query: ListAdminAuditEventsQuery): Promise<AdminAuditEventListResponse>;
  listComplaints(query: ListAdminComplaintsQuery): Promise<AdminComplaintListResponse>;
  listDeliveries(query: ListAdminDeliveriesQuery): Promise<AdminDeliveryListResponse>;
  transitionComplaint(
    input: TransitionAdminComplaintInput,
  ): Promise<AdminComplaintTransitionResponse | null>;
}

export const ADMINISTRATION_REPOSITORY = Symbol("ADMINISTRATION_REPOSITORY");
