import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { CurrentSession, LogisticsDeliveryStatus } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import {
  LOGISTICS_DELIVERY_REPOSITORY,
  type DispatchLogisticsDeliveryInput,
  type LogisticsDeliveryRecord,
  type LogisticsDeliveryRepository,
  type LogisticsListInput,
} from "../domain/logistics-delivery.types.js";

export interface LogisticsServiceContext {
  actor: CurrentSession;
  requestId: string;
}

export class LogisticsFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LogisticsFlowError";
  }
}

@Injectable()
export class LogisticsDeliveryService {
  constructor(
    @Inject(LOGISTICS_DELIVERY_REPOSITORY)
    private readonly repository: LogisticsDeliveryRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  async dispatch(
    context: LogisticsServiceContext,
    input: Omit<DispatchLogisticsDeliveryInput, "requestHash">,
  ) {
    await this.authorizeAdmin(context, input.handoffId, "pharmacy_order_handoff");
    const delivery = await this.repository.dispatch(repositoryContext(context), {
      ...input,
      requestHash: requestHash(input),
    });
    return adminProjection(delivery);
  }

  async reassign(
    context: LogisticsServiceContext,
    deliveryId: string,
    input: {
      courierPrincipalId?: string;
      expectedVersion: number;
      idempotencyKey: string;
      logisticsOrganizationId: string;
      reasonCode: string;
    },
  ) {
    await this.authorizeAdmin(context, deliveryId, "logistics_delivery");
    const delivery = await this.repository.reassign(repositoryContext(context), {
      ...input,
      deliveryId,
      requestHash: requestHash({ ...input, deliveryId }),
    });
    return adminProjection(requireDelivery(delivery));
  }

  async cancel(
    context: LogisticsServiceContext,
    deliveryId: string,
    input: { expectedVersion: number; idempotencyKey: string; reasonCode: string },
  ) {
    await this.authorizeAdmin(context, deliveryId, "logistics_delivery");
    const delivery = await this.repository.cancel(repositoryContext(context), {
      ...input,
      deliveryId,
      requestHash: requestHash({ ...input, deliveryId }),
    });
    return adminProjection(requireDelivery(delivery));
  }

  async listAdmin(context: LogisticsServiceContext, input: PublicListInput) {
    await this.authorizeAdmin(context, context.actor.principalId, "logistics_delivery_list");
    return page(
      await this.repository.listAdmin(repositoryList(input)),
      input.limit,
      adminProjection,
    );
  }

  async getAdmin(context: LogisticsServiceContext, deliveryId: string) {
    await this.authorizeAdmin(context, deliveryId, "logistics_delivery");
    return adminProjection(await this.requireDelivery(deliveryId));
  }

  async listOrganization(
    context: LogisticsServiceContext,
    organizationId: string,
    input: PublicListInput,
  ) {
    await this.authorizeOrganization(context, organizationId, organizationId, "logistics_queue");
    return page(
      await this.repository.listByLogisticsOrganization(organizationId, repositoryList(input)),
      input.limit,
      logisticsProjection,
    );
  }

  async getOrganization(
    context: LogisticsServiceContext,
    organizationId: string,
    deliveryId: string,
  ) {
    const delivery = await this.requireDelivery(deliveryId);
    assertScope(delivery.logisticsOrganizationId === organizationId);
    await this.authorizeOrganization(context, organizationId, deliveryId, "logistics_delivery");
    return logisticsProjection(delivery);
  }

  async assignCourier(
    context: LogisticsServiceContext,
    organizationId: string,
    deliveryId: string,
    input: {
      courierPrincipalId: string;
      expectedAssignmentVersion: number;
      idempotencyKey: string;
    },
  ) {
    const delivery = await this.requireDelivery(deliveryId);
    assertScope(delivery.logisticsOrganizationId === organizationId);
    await this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId: deliveryId, resourceType: "logistics_delivery" },
      policy: AUTHORIZATION_POLICY.ADMINISTER_LOGISTICS_COURIER_ASSIGNMENT,
      requestId: context.requestId,
    });
    return logisticsProjection(
      requireDelivery(
        await this.repository.assignCourier(repositoryContext(context), {
          ...input,
          deliveryId,
          requestHash: requestHash({ ...input, deliveryId }),
        }),
      ),
    );
  }

  async transition(
    context: LogisticsServiceContext,
    organizationId: string,
    deliveryId: string,
    input: {
      expectedVersion: number;
      idempotencyKey: string;
      reasonCode?: string;
      toStatus: Exclude<LogisticsDeliveryStatus, "ASSIGNED" | "DELIVERED" | "CANCELLED">;
    },
  ) {
    const delivery = await this.requireDelivery(deliveryId);
    assertScope(delivery.logisticsOrganizationId === organizationId);
    await this.authorizeOrganization(context, organizationId, deliveryId, "logistics_delivery");
    return logisticsProjection(
      requireDelivery(
        await this.repository.transition(repositoryContext(context), {
          ...input,
          deliveryId,
          requestHash: requestHash({ ...input, deliveryId }),
        }),
      ),
    );
  }

  async verifyRecipientCode(
    context: LogisticsServiceContext,
    organizationId: string,
    deliveryId: string,
    input: {
      expectedVersion: number;
      idempotencyKey: string;
      recipientCode: string;
    },
  ) {
    const delivery = await this.requireDelivery(deliveryId);
    assertScope(delivery.logisticsOrganizationId === organizationId);
    await this.authorizeOrganization(context, organizationId, deliveryId, "logistics_delivery");
    const result = await this.repository.verifyRecipientCode(repositoryContext(context), {
      ...input,
      deliveryId,
      requestHash: requestHash({ ...input, deliveryId }),
    });
    if (result.outcome === "DELIVERED") return logisticsProjection(result.delivery);
    if (result.outcome === "CODE_EXPIRED") {
      throw new LogisticsFlowError("recipient_code_expired", 410, "Confirmation code has expired");
    }
    if (result.outcome === "RATE_LIMITED") {
      throw new LogisticsFlowError(
        "recipient_code_rate_limited",
        429,
        "Confirmation attempts are temporarily limited",
      );
    }
    throw new LogisticsFlowError("recipient_code_invalid", 422, "Confirmation code is invalid");
  }

  async history(
    context: LogisticsServiceContext,
    organizationId: string,
    deliveryId: string,
    limit: number,
  ) {
    const delivery = await this.requireDelivery(deliveryId);
    assertScope(delivery.logisticsOrganizationId === organizationId);
    await this.authorizeOrganization(context, organizationId, deliveryId, "logistics_delivery");
    return historyProjection(await this.repository.listHistory(deliveryId, limit));
  }

  async adminHistory(context: LogisticsServiceContext, deliveryId: string, limit: number) {
    await this.authorizeAdmin(context, deliveryId, "logistics_delivery_history");
    await this.requireDelivery(deliveryId);
    return historyProjection(await this.repository.listHistory(deliveryId, limit));
  }

  async listPatient(context: LogisticsServiceContext, input: PublicListInput) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: context.actor.principalId,
        resourceId: context.actor.principalId,
        resourceType: "patient_logistics_delivery_list",
      },
      policy: AUTHORIZATION_POLICY.VIEW_LOGISTICS_DELIVERY,
      requestId: context.requestId,
    });
    return page(
      await this.repository.listByPatient(context.actor.principalId, repositoryList(input)),
      input.limit,
      patientProjection,
    );
  }

  async getPatient(context: LogisticsServiceContext, deliveryId: string) {
    const delivery = await this.requireDelivery(deliveryId);
    await this.authorizeView(context, delivery);
    assertScope(delivery.patientPrincipalId === context.actor.principalId);
    return patientProjection(delivery);
  }

  async listPharmacy(
    context: LogisticsServiceContext,
    organizationId: string,
    input: PublicListInput,
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        organizationId,
        pharmacyOrganizationId: organizationId,
        resourceId: organizationId,
        resourceType: "pharmacy_logistics_delivery_list",
      },
      policy: AUTHORIZATION_POLICY.VIEW_LOGISTICS_DELIVERY,
      requestId: context.requestId,
    });
    return page(
      await this.repository.listByPharmacy(organizationId, repositoryList(input)),
      input.limit,
      pharmacyProjection,
    );
  }

  async getPharmacy(context: LogisticsServiceContext, organizationId: string, deliveryId: string) {
    const delivery = await this.requireDelivery(deliveryId);
    assertScope(delivery.pharmacyOrganizationId === organizationId);
    await this.authorizeView(context, delivery);
    return pharmacyProjection(delivery);
  }

  private async authorizeAdmin(
    context: LogisticsServiceContext,
    resourceId: string,
    resourceType: string,
  ): Promise<void> {
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId, resourceType },
      policy: AUTHORIZATION_POLICY.ADMINISTER_LOGISTICS_ASSIGNMENT,
      requestId: context.requestId,
    });
  }

  private async authorizeOrganization(
    context: LogisticsServiceContext,
    organizationId: string,
    resourceId: string,
    resourceType: string,
  ): Promise<void> {
    await this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId, resourceType },
      policy: AUTHORIZATION_POLICY.MANAGE_LOGISTICS_DELIVERY,
      requestId: context.requestId,
    });
  }

  private async authorizeView(
    context: LogisticsServiceContext,
    delivery: LogisticsDeliveryRecord,
  ): Promise<void> {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        logisticsOrganizationId: delivery.logisticsOrganizationId,
        organizationId: delivery.logisticsOrganizationId,
        patientPrincipalId: delivery.patientPrincipalId,
        pharmacyOrganizationId: delivery.pharmacyOrganizationId,
        resourceId: delivery.id,
        resourceType: "logistics_delivery",
      },
      policy: AUTHORIZATION_POLICY.VIEW_LOGISTICS_DELIVERY,
      requestId: context.requestId,
    });
  }

  private async requireDelivery(deliveryId: string): Promise<LogisticsDeliveryRecord> {
    const delivery = await this.repository.findById(deliveryId);
    if (delivery === null) {
      throw new LogisticsFlowError("delivery_not_found", 404, "Delivery was not found");
    }
    return delivery;
  }
}

interface PublicListInput {
  cursor?: string;
  limit: number;
  status?: LogisticsDeliveryStatus;
}

function repositoryContext(context: LogisticsServiceContext) {
  return { actorPrincipalId: context.actor.principalId, requestId: context.requestId };
}

function repositoryList(input: PublicListInput): LogisticsListInput {
  return {
    ...(input.cursor === undefined ? {} : { cursor: decodeCursor(input.cursor) }),
    limit: input.limit + 1,
    ...(input.status === undefined ? {} : { status: input.status }),
  };
}

function page<T>(
  rows: LogisticsDeliveryRecord[],
  limit: number,
  project: (row: LogisticsDeliveryRecord) => T,
) {
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  const last = data.at(-1);
  return {
    data: data.map(project),
    nextCursor:
      hasMore && last !== undefined
        ? Buffer.from(JSON.stringify([last.assignedAt.toISOString(), last.id])).toString(
            "base64url",
          )
        : null,
  };
}

function decodeCursor(cursor: string): { assignedAt: Date; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      throw new Error("invalid cursor");
    }
    const assignedAt = new Date(parsed[0]);
    if (Number.isNaN(assignedAt.getTime())) throw new Error("invalid cursor");
    return { assignedAt, id: parsed[1] };
  } catch {
    throw new LogisticsFlowError("invalid_cursor", 400, "Delivery cursor is invalid");
  }
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requireDelivery(delivery: LogisticsDeliveryRecord | null): LogisticsDeliveryRecord {
  if (delivery === null) {
    throw new LogisticsFlowError("delivery_conflict", 409, "Delivery changed concurrently");
  }
  return delivery;
}

function assertScope(condition: boolean): void {
  if (!condition) throw new LogisticsFlowError("delivery_not_found", 404, "Delivery was not found");
}

function timeline(delivery: LogisticsDeliveryRecord) {
  return {
    acceptedAt: iso(delivery.acceptedAt),
    arrivedAtDestinationAt: iso(delivery.arrivedAtDestinationAt),
    arrivedAtPickupAt: iso(delivery.arrivedAtPickupAt),
    assignedAt: delivery.assignedAt.toISOString(),
    cancelledAt: iso(delivery.cancelledAt),
    deliveredAt: iso(delivery.deliveredAt),
    failedAt: iso(delivery.failedAt),
    pickedUpAt: iso(delivery.pickedUpAt),
    pickupVerifiedAt: iso(delivery.pickupVerifiedAt),
    returnedAt: iso(delivery.returnedAt),
  };
}

function baseProjection(delivery: LogisticsDeliveryRecord) {
  return {
    deliveryNumber: delivery.deliveryNumber,
    handoffReference: delivery.handoffReference,
    id: delivery.id,
    status: delivery.status,
    timeline: timeline(delivery),
    updatedAt: delivery.updatedAt.toISOString(),
    version: delivery.version,
  };
}

function adminProjection(delivery: LogisticsDeliveryRecord) {
  return {
    ...baseProjection(delivery),
    courierAssigned: (delivery.activeAssignment?.courierPrincipalId ?? null) !== null,
    deliveryArea: area(delivery.deliveryAddress),
    logisticsOrganizationId: delivery.logisticsOrganizationId,
    orderNumber: delivery.orderNumber,
    pharmacyOrganizationId: delivery.pharmacyOrganizationId,
    pickupArea: area(delivery.pickupAddress),
  };
}

function logisticsProjection(delivery: LogisticsDeliveryRecord) {
  return {
    ...baseProjection(delivery),
    activeAssignment: delivery.activeAssignment,
    deliveryAddress: delivery.deliveryAddress,
    deliveryInstruction: delivery.deliveryInstruction,
    orderNumber: delivery.orderNumber,
    pickupAddress: delivery.pickupAddress,
    pickupContactName: delivery.pickupContactName,
    pickupContactPhoneE164: delivery.pickupContactPhoneE164,
    pickupLocationName: delivery.pickupLocationName,
    recipientName: delivery.recipientName,
    recipientPhoneE164: delivery.recipientPhoneE164,
  };
}

function patientProjection(delivery: LogisticsDeliveryRecord) {
  return {
    ...baseProjection(delivery),
    deliveryArea: area(delivery.deliveryAddress),
    pickupLocationName: delivery.pickupLocationName,
  };
}

function pharmacyProjection(delivery: LogisticsDeliveryRecord) {
  return {
    ...baseProjection(delivery),
    deliveryArea: area(delivery.deliveryAddress),
    orderNumber: delivery.orderNumber,
    pickupLocationName: delivery.pickupLocationName,
  };
}

function area(address: {
  administrativeArea: string;
  countryCode: string;
  locality: string;
  postalCode?: string;
}) {
  return {
    administrativeArea: address.administrativeArea,
    countryCode: address.countryCode,
    locality: address.locality,
    ...(address.postalCode === undefined ? {} : { postalCode: address.postalCode }),
  };
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function historyProjection(rows: Awaited<ReturnType<LogisticsDeliveryRepository["listHistory"]>>) {
  return {
    data: rows.map((row) => ({
      fromStatus: row.fromStatus,
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      reasonCode: row.reasonCode,
      toStatus: row.toStatus,
    })),
  };
}
