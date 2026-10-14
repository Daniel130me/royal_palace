import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type {
  CurrentSession,
  LaboratoryBookingStatus,
  LaboratoryCollectionMode,
  LaboratoryHomeCollectionInput,
} from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import {
  LABORATORY_REPOSITORY,
  LaboratoryConflictError,
  type LaboratoryRepository,
  type LaboratoryRequestAccessRecord,
  type LaboratoryRequestDraft,
} from "../domain/laboratory.types.js";

export interface LaboratoryRequestContext {
  actor: CurrentSession;
  requestId: string;
}

export class LaboratoryFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LaboratoryFlowError";
  }
}

@Injectable()
export class LaboratoryService {
  constructor(
    @Inject(LABORATORY_REPOSITORY) private readonly repository: LaboratoryRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async createRequest(context: LaboratoryRequestContext, draft: LaboratoryRequestDraft) {
    this.assertSyntheticClinicalWorkflow();
    const practitioner = await this.requireVerifiedPractitioner(context.actor.principalId);
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        practitionerPrincipalId: practitioner.principalId,
        resourceId: practitioner.id,
        resourceType: "laboratory_request",
      },
      policy: AUTHORIZATION_POLICY.MANAGE_OWN_LABORATORY_REQUEST,
      requestId: context.requestId,
    });
    return publicRequest(
      await this.repository.createRequest({
        actorPrincipalId: context.actor.principalId,
        draft,
        practitionerId: practitioner.id,
        requestId: context.requestId,
      }),
    );
  }

  async get(context: LaboratoryRequestContext, requestId: string) {
    this.assertSyntheticClinicalWorkflow();
    const request = await this.requireRequest(requestId);
    await this.authorizeView(context, request);
    return isAssignedLaboratory(context.actor, request)
      ? laboratoryProjection(request)
      : context.actor.principalId === request.patientPrincipalId
        ? publicRequest(request)
        : practitionerProjection(request);
  }

  async listForPatient(
    context: LaboratoryRequestContext,
    input: { cursor?: string; limit: number },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: context.actor.principalId,
        resourceId: context.actor.principalId,
        resourceType: "patient_laboratory_request_list",
      },
      policy: AUTHORIZATION_POLICY.ROUTE_LABORATORY_REQUEST,
      requestId: context.requestId,
    });
    const page = await this.repository.listByPatient({
      ...(input.cursor === undefined ? {} : { cursor: decodeCreatedCursor(input.cursor) }),
      limit: input.limit,
      patientPrincipalId: context.actor.principalId,
    });
    return { ...page, data: page.data.map(publicRequest) };
  }

  async listForPractitioner(
    context: LaboratoryRequestContext,
    input: { cursor?: string; limit: number; patientId?: string },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        practitionerPrincipalId: context.actor.principalId,
        resourceId: context.actor.principalId,
        resourceType: "practitioner_laboratory_request_list",
      },
      policy: AUTHORIZATION_POLICY.MANAGE_OWN_LABORATORY_REQUEST,
      requestId: context.requestId,
    });
    const page = await this.repository.listByPractitioner({
      ...(input.cursor === undefined ? {} : { cursor: decodeCreatedCursor(input.cursor) }),
      limit: input.limit,
      ...(input.patientId === undefined ? {} : { patientId: input.patientId }),
      practitionerPrincipalId: context.actor.principalId,
    });
    return { ...page, data: page.data.map(practitionerProjection) };
  }

  async book(
    context: LaboratoryRequestContext,
    requestId: string,
    idempotencyKey: string,
    input: {
      collectionMode: LaboratoryCollectionMode;
      expectedVersion: number;
      homeCollection?: LaboratoryHomeCollectionInput;
      laboratoryOrganizationId: string;
      scheduledAt?: string;
    },
  ) {
    this.assertSyntheticClinicalWorkflow();
    if (
      (input.collectionMode === "HOME" && input.homeCollection === undefined) ||
      (input.collectionMode === "FACILITY" && input.homeCollection !== undefined)
    ) {
      throw new LaboratoryFlowError(
        "invalid_collection_details",
        400,
        "Collection details do not match the selected collection method",
      );
    }
    const request = await this.requireRequest(requestId);
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: request.patientPrincipalId,
        resourceId: request.id,
        resourceType: "laboratory_request",
      },
      policy: AUTHORIZATION_POLICY.ROUTE_LABORATORY_REQUEST,
      requestId: context.requestId,
    });
    const scheduledAt = input.scheduledAt === undefined ? undefined : new Date(input.scheduledAt);
    if (scheduledAt !== undefined && scheduledAt.getTime() <= Date.now()) {
      throw new LaboratoryFlowError(
        "invalid_schedule",
        400,
        "The laboratory schedule must be in the future",
      );
    }
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          expectedVersion: input.expectedVersion,
          collectionMode: input.collectionMode,
          homeCollection: input.homeCollection ?? null,
          laboratoryOrganizationId: input.laboratoryOrganizationId,
          requestId,
          scheduledAt: scheduledAt?.toISOString() ?? null,
        }),
      )
      .digest("hex");
    return publicRequest(
      this.requireMutation(
        await this.repository.book({
          actorPrincipalId: context.actor.principalId,
          draft: {
            collectionMode: input.collectionMode,
            ...(input.homeCollection === undefined ? {} : { homeCollection: input.homeCollection }),
            laboratoryOrganizationId: input.laboratoryOrganizationId,
            ...(scheduledAt === undefined ? {} : { scheduledAt }),
          },
          expectedVersion: input.expectedVersion,
          idempotencyKey,
          patientPrincipalId: context.actor.principalId,
          requestHash,
          requestId,
          traceRequestId: context.requestId,
        }),
        "laboratory_booking_conflict",
      ),
    );
  }

  async listLaboratoryQueue(
    context: LaboratoryRequestContext,
    organizationId: string,
    input: { cursor?: string; limit: number; status?: LaboratoryBookingStatus },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        organizationId,
        resourceId: organizationId,
        resourceType: "laboratory_booking_queue",
      },
      policy: AUTHORIZATION_POLICY.MANAGE_LABORATORY_BOOKING,
      requestId: context.requestId,
    });
    return this.repository.listLaboratoryQueue({
      ...(input.cursor === undefined ? {} : { cursor: decodeAcceptedCursor(input.cursor) }),
      limit: input.limit,
      organizationId,
      ...(input.status === undefined ? {} : { status: input.status }),
    });
  }

  async getLaboratoryBooking(
    context: LaboratoryRequestContext,
    organizationId: string,
    bookingId: string,
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId: bookingId, resourceType: "laboratory_booking" },
      policy: AUTHORIZATION_POLICY.MANAGE_LABORATORY_BOOKING,
      requestId: context.requestId,
    });
    const request = await this.repository.findByBooking({ bookingId, organizationId });
    if (request === null) {
      throw new LaboratoryFlowError("laboratory_booking_not_found", 404, "Booking was not found");
    }
    return laboratoryProjectionForOrganization(request, organizationId);
  }

  async transitionBooking(
    context: LaboratoryRequestContext,
    organizationId: string,
    bookingId: string,
    input: {
      expectedVersion: number;
      reasonCode: string;
      toStatus: LaboratoryBookingStatus;
    },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId: bookingId, resourceType: "laboratory_booking" },
      policy: AUTHORIZATION_POLICY.MANAGE_LABORATORY_BOOKING,
      requestId: context.requestId,
    });
    const request = this.requireMutation(
      await this.repository.transitionBooking({
        actorPrincipalId: context.actor.principalId,
        bookingId,
        expectedVersion: input.expectedVersion,
        organizationId,
        reasonCode: input.reasonCode,
        requestId: context.requestId,
        toStatus: input.toStatus,
      }),
      "laboratory_booking_transition_conflict",
    );
    return laboratoryProjectionForOrganization(request, organizationId);
  }

  private async authorizeView(
    context: LaboratoryRequestContext,
    request: LaboratoryRequestAccessRecord,
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        ...(request.laboratoryOrganizationId === undefined
          ? {}
          : { laboratoryOrganizationId: request.laboratoryOrganizationId }),
        patientPrincipalId: request.patientPrincipalId,
        practitionerPrincipalId: request.practitionerPrincipalId,
        resourceId: request.id,
        resourceType: "laboratory_request",
      },
      policy: AUTHORIZATION_POLICY.VIEW_LABORATORY_REQUEST,
      requestId: context.requestId,
    });
  }

  private async requireVerifiedPractitioner(principalId: string) {
    const practitioner = await this.repository.findPractitionerByPrincipal(principalId);
    if (practitioner === null || practitioner.verificationStatus !== "VERIFIED") {
      throw new LaboratoryFlowError(
        "verified_practitioner_required",
        403,
        "A verified practitioner is required",
      );
    }
    return practitioner;
  }

  private async requireRequest(requestId: string) {
    const request = await this.repository.findById(requestId);
    if (request === null) {
      throw new LaboratoryFlowError("laboratory_request_not_found", 404, "Request was not found");
    }
    return request;
  }

  private requireMutation<T>(result: T | null, code: string): T {
    if (result === null) {
      throw new LaboratoryFlowError(code, 409, "The request conflicts with current data");
    }
    return result;
  }

  private assertSyntheticClinicalWorkflow() {
    if (this.config.clinicalWorkflow.mode !== "synthetic") {
      throw new LaboratoryFlowError(
        "clinical_workflow_disabled",
        503,
        "Clinical workflows are not enabled in this environment",
      );
    }
  }
}

function decodeCreatedCursor(value: string): { createdAt: Date; id: string } {
  return decodeCursor(value, "createdAt") as { createdAt: Date; id: string };
}

function decodeAcceptedCursor(value: string): { acceptedAt: Date; id: string } {
  return decodeCursor(value, "acceptedAt") as { acceptedAt: Date; id: string };
}

function decodeCursor(value: string, dateKey: "acceptedAt" | "createdAt") {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (typeof decoded.id !== "string" || typeof decoded[dateKey] !== "string") throw new Error();
    const date = new Date(decoded[dateKey]);
    if (!Number.isFinite(date.getTime())) throw new Error();
    return { [dateKey]: date, id: decoded.id };
  } catch {
    throw new LaboratoryFlowError("invalid_cursor", 400, "Cursor is invalid");
  }
}

function publicRequest(request: LaboratoryRequestAccessRecord) {
  const {
    laboratoryOrganizationId: _laboratoryOrganizationId,
    patientPrincipalId: _patientPrincipalId,
    practitionerPrincipalId: _practitionerPrincipalId,
    ...response
  } = request;
  return response;
}

function practitionerProjection(request: LaboratoryRequestAccessRecord) {
  const response = publicRequest(request);
  return {
    ...response,
    bookings: response.bookings.map((booking) => ({ ...booking, homeCollection: null })),
  };
}

function laboratoryProjection(request: LaboratoryRequestAccessRecord) {
  return laboratoryProjectionForOrganization(request, request.laboratoryOrganizationId);
}

function laboratoryProjectionForOrganization(
  request: LaboratoryRequestAccessRecord,
  organizationId: string | undefined,
) {
  const {
    appointmentId: _appointmentId,
    statusHistory: _statusHistory,
    ...response
  } = publicRequest(request);
  return {
    ...response,
    bookings:
      organizationId === undefined
        ? []
        : response.bookings.filter((booking) => booking.laboratory.id === organizationId),
  };
}

function isAssignedLaboratory(
  actor: CurrentSession,
  request: LaboratoryRequestAccessRecord,
): boolean {
  return (
    request.laboratoryOrganizationId !== undefined &&
    actor.memberships.some(
      (membership) => membership.organizationId === request.laboratoryOrganizationId,
    )
  );
}

export function mapLaboratoryConflict(error: unknown): never | void {
  if (!(error instanceof LaboratoryConflictError)) return;
  throw new LaboratoryFlowError(
    `laboratory_${error.reason.toLowerCase()}`,
    409,
    "The laboratory request changed or is unavailable",
  );
}
