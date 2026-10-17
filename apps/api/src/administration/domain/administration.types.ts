import type {
  AdminAppointmentListResponse,
  AdminAppointmentScope,
  AdminAuditEventListResponse,
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

export interface AdministrationRepository {
  listAppointments(query: ListAdminAppointmentsQuery): Promise<AdminAppointmentListResponse>;
  listAuditEvents(query: ListAdminAuditEventsQuery): Promise<AdminAuditEventListResponse>;
}

export const ADMINISTRATION_REPOSITORY = Symbol("ADMINISTRATION_REPOSITORY");
