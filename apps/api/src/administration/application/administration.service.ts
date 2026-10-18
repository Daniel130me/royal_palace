import { Inject, Injectable } from "@nestjs/common";
import type {
  AdminAppointmentScope,
  AdminComplaintPriority,
  AdminComplaintScope,
  AdminComplaintStatus,
  AdminDeliveryScope,
  CurrentSession,
  PlatformRole,
} from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { administrationFilterHash, decodeAdministrationCursor } from "./administration-cursor.js";
import {
  ADMINISTRATION_REPOSITORY,
  type AdministrationRepository,
} from "../domain/administration.types.js";

export const ADMINISTRATION_MAX_PAGE_SIZE = 50;
const CREDENTIAL_EXPIRY_REVIEW_DAYS = 90;

const COMPLAINT_TRANSITIONS: Readonly<
  Record<AdminComplaintStatus, readonly AdminComplaintStatus[]>
> = {
  OPEN: ["INVESTIGATING", "RESOLVED", "CLOSED"],
  INVESTIGATING: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["INVESTIGATING", "CLOSED"],
  CLOSED: ["INVESTIGATING"],
};

export class AdministrationFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdministrationFlowError";
  }
}

export interface AdministrationRequestContext {
  actor: CurrentSession;
  requestId: string;
}

@Injectable()
export class AdministrationService {
  constructor(
    @Inject(ADMINISTRATION_REPOSITORY) private readonly repository: AdministrationRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  async getDashboard(
    context: AdministrationRequestContext,
    input: { dayFrom: string; dayTo: string },
  ) {
    await this.authorize(
      context,
      AUTHORIZATION_POLICY.VIEW_PLATFORM_DASHBOARD,
      "platform_dashboard",
    );
    const now = new Date();
    const credentialExpiringBefore = new Date(
      now.getTime() + CREDENTIAL_EXPIRY_REVIEW_DAYS * 24 * 60 * 60 * 1_000,
    );
    return this.repository.getDashboard({
      credentialExpiringBefore,
      dayFrom: new Date(input.dayFrom),
      dayTo: new Date(input.dayTo),
    });
  }

  async listComplaints(
    context: AdministrationRequestContext,
    input: {
      cursor?: string;
      limit?: number;
      priority?: AdminComplaintPriority;
      query?: string;
      scope: AdminComplaintScope;
    },
  ) {
    await this.authorize(
      context,
      AUTHORIZATION_POLICY.VIEW_PLATFORM_COMPLAINTS,
      "platform_complaint_list",
    );
    const filters = { priority: input.priority, query: input.query, scope: input.scope };
    return this.repository.listComplaints({
      cursor: decodeAdministrationCursor(input.cursor, administrationFilterHash(filters)),
      limit: input.limit ?? 25,
      priority: input.priority,
      query: input.query,
      scope: input.scope,
    });
  }

  async transitionComplaint(
    context: AdministrationRequestContext,
    complaintId: string,
    input: {
      expectedVersion: number;
      internalNote?: string;
      status: AdminComplaintStatus;
    },
  ) {
    await this.authorize(
      context,
      AUTHORIZATION_POLICY.MANAGE_PLATFORM_COMPLAINTS,
      "platform_complaint",
      complaintId,
    );
    const result = await this.repository.transitionComplaint({
      actorPrincipalId: context.actor.principalId,
      allowedFromStatuses: complaintSourcesFor(input.status),
      complaintId,
      expectedVersion: input.expectedVersion,
      internalNote: input.internalNote,
      occurredAt: new Date(),
      status: input.status,
    });
    if (result === null) {
      throw new AdministrationFlowError(
        "complaint_conflict",
        409,
        "Complaint changed, was not found, or cannot move to the requested status",
      );
    }
    return result;
  }

  async listDeliveries(
    context: AdministrationRequestContext,
    input: { cursor?: string; limit?: number; query?: string; scope: AdminDeliveryScope },
  ) {
    await this.authorize(
      context,
      AUTHORIZATION_POLICY.ADMINISTER_LOGISTICS_ASSIGNMENT,
      "platform_delivery_list",
    );
    const filters = { query: input.query, scope: input.scope };
    return this.repository.listDeliveries({
      cursor: decodeAdministrationCursor(input.cursor, administrationFilterHash(filters)),
      limit: input.limit ?? 25,
      query: input.query,
      scope: input.scope,
    });
  }

  async listAppointments(
    context: AdministrationRequestContext,
    input: {
      cursor?: string;
      dayFrom: string;
      dayTo: string;
      limit?: number;
      query?: string;
      scope: AdminAppointmentScope;
    },
  ) {
    await this.authorize(context, AUTHORIZATION_POLICY.VIEW_PLATFORM_APPOINTMENTS, "appointment");
    const filters = {
      dayFrom: input.dayFrom,
      dayTo: input.dayTo,
      query: input.query,
      scope: input.scope,
    };
    return this.repository.listAppointments({
      cursor: decodeAdministrationCursor(input.cursor, administrationFilterHash(filters)),
      dayFrom: new Date(input.dayFrom),
      dayTo: new Date(input.dayTo),
      limit: input.limit ?? 25,
      query: input.query,
      scope: input.scope,
    });
  }

  async listAuditEvents(
    context: AdministrationRequestContext,
    input: {
      action?: string;
      cursor?: string;
      effectiveRole?: PlatformRole;
      from?: string;
      limit?: number;
      query?: string;
      to?: string;
    },
  ) {
    await this.authorize(context, AUTHORIZATION_POLICY.VIEW_PLATFORM_AUDIT_TRAIL, "audit_event");
    const filters = {
      action: input.action,
      effectiveRole: input.effectiveRole,
      from: input.from,
      query: input.query,
      to: input.to,
    };
    return this.repository.listAuditEvents({
      action: input.action,
      cursor: decodeAdministrationCursor(input.cursor, administrationFilterHash(filters)),
      effectiveRole: input.effectiveRole,
      from: input.from === undefined ? undefined : new Date(input.from),
      limit: input.limit ?? 25,
      query: input.query,
      to: input.to === undefined ? undefined : new Date(input.to),
    });
  }

  private authorize(
    context: AdministrationRequestContext,
    policy:
      | typeof AUTHORIZATION_POLICY.VIEW_PLATFORM_APPOINTMENTS
      | typeof AUTHORIZATION_POLICY.VIEW_PLATFORM_AUDIT_TRAIL
      | typeof AUTHORIZATION_POLICY.VIEW_PLATFORM_DASHBOARD
      | typeof AUTHORIZATION_POLICY.VIEW_PLATFORM_COMPLAINTS
      | typeof AUTHORIZATION_POLICY.MANAGE_PLATFORM_COMPLAINTS
      | typeof AUTHORIZATION_POLICY.ADMINISTER_LOGISTICS_ASSIGNMENT,
    resourceType: string,
    resourceId = context.actor.principalId,
  ) {
    return this.authorization.authorize({
      actor: context.actor,
      context: { resourceId, resourceType },
      policy,
      requestId: context.requestId,
    });
  }
}

function complaintSourcesFor(target: AdminComplaintStatus): AdminComplaintStatus[] {
  return (Object.keys(COMPLAINT_TRANSITIONS) as AdminComplaintStatus[]).filter((source) =>
    COMPLAINT_TRANSITIONS[source].includes(target),
  );
}
