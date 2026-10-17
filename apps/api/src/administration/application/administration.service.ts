import { Inject, Injectable } from "@nestjs/common";
import type { AdminAppointmentScope, CurrentSession, PlatformRole } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { administrationFilterHash, decodeAdministrationCursor } from "./administration-cursor.js";
import {
  ADMINISTRATION_REPOSITORY,
  type AdministrationRepository,
} from "../domain/administration.types.js";

export const ADMINISTRATION_MAX_PAGE_SIZE = 50;

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
      | typeof AUTHORIZATION_POLICY.VIEW_PLATFORM_AUDIT_TRAIL,
    resourceType: string,
  ) {
    return this.authorization.authorize({
      actor: context.actor,
      context: { resourceId: context.actor.principalId, resourceType },
      policy,
      requestId: context.requestId,
    });
  }
}
