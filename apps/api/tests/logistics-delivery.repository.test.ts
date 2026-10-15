import { describe, expect, it, vi } from "vitest";

import type {
  LogisticsConflictError,
  LogisticsDeliveryRecord,
} from "../src/logistics/domain/logistics-delivery.types.js";
import { PrismaLogisticsDeliveryRepository } from "../src/logistics/infrastructure/prisma-logistics-delivery.repository.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

const principalId = createOpaqueId();
const deliveryId = createOpaqueId();
const requestHash = "a".repeat(64);

describe("PrismaLogisticsDeliveryRepository idempotency", () => {
  it("replays a completed dispatch without creating a second delivery or notification", async () => {
    const deliveryCreate = vi.fn();
    const transaction = replayTransaction(deliveryCreate, requestHash);
    const database = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<string>) =>
        operation(transaction),
      ),
    };
    const repository = new PrismaLogisticsDeliveryRepository(database as never, testConfig);
    vi.spyOn(repository, "findById").mockResolvedValue(deliveryRecord());

    const result = await repository.dispatch(
      { actorPrincipalId: principalId, requestId: "request-replay" },
      dispatchInput(requestHash),
    );

    expect(result.id).toBe(deliveryId);
    expect(deliveryCreate).not.toHaveBeenCalled();
    expect(transaction.notificationDelivery.create).not.toHaveBeenCalled();
    expect(transaction.notificationInbox.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of a dispatch idempotency key with a different request hash", async () => {
    const deliveryCreate = vi.fn();
    const transaction = replayTransaction(deliveryCreate, "b".repeat(64));
    const database = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<string>) =>
        operation(transaction),
      ),
    };
    const repository = new PrismaLogisticsDeliveryRepository(database as never, testConfig);

    await expect(
      repository.dispatch(
        { actorPrincipalId: principalId, requestId: "request-conflict" },
        dispatchInput(requestHash),
      ),
    ).rejects.toMatchObject<Partial<LogisticsConflictError>>({ code: "IDEMPOTENCY_CONFLICT" });
    expect(deliveryCreate).not.toHaveBeenCalled();
  });
});

function replayTransaction(deliveryCreate: ReturnType<typeof vi.fn>, storedRequestHash: string) {
  return {
    idempotencyKey: {
      findUnique: vi.fn().mockResolvedValue({
        requestHash: storedRequestHash,
        resourceId: deliveryId,
        responseStatusCode: 201,
        status: "COMPLETED",
      }),
    },
    logisticsDelivery: { create: deliveryCreate },
    notificationDelivery: { create: vi.fn() },
    notificationInbox: { create: vi.fn() },
  };
}

function dispatchInput(hash: string) {
  return {
    courierPrincipalId: principalId,
    deliveryAddress: {
      addressLine1: "2 Synthetic Patient Street",
      administrativeArea: "Ontario",
      countryCode: "CA",
      locality: "Toronto",
    },
    handoffId: createOpaqueId(),
    idempotencyKey: "dispatch-replay-key",
    logisticsOrganizationId: createOpaqueId(),
    pickupAddress: {
      addressLine1: "1 Synthetic Pharmacy Street",
      administrativeArea: "Ontario",
      countryCode: "CA",
      locality: "Toronto",
    },
    pickupContactName: "Synthetic Pharmacist",
    pickupContactPhoneE164: "+15555550101",
    pickupLocationName: "Synthetic Pharmacy",
    recipientName: "Synthetic Patient",
    recipientPhoneE164: "+15555550102",
    requestHash: hash,
  };
}

function deliveryRecord(): LogisticsDeliveryRecord {
  const timestamp = new Date("2026-10-15T10:00:00.000Z");
  return {
    acceptedAt: null,
    activeAssignment: null,
    arrivedAtDestinationAt: null,
    arrivedAtPickupAt: null,
    assignedAt: timestamp,
    cancelledAt: null,
    createdAt: timestamp,
    deliveredAt: null,
    deliveryAddress: {
      addressLine1: "2 Synthetic Patient Street",
      administrativeArea: "Ontario",
      countryCode: "CA",
      locality: "Toronto",
    },
    deliveryInstruction: null,
    deliveryNumber: "DLV-REPLAY",
    failedAt: null,
    handoffId: createOpaqueId(),
    handoffReference: "HANDOFF-REPLAY",
    id: deliveryId,
    logisticsOrganizationId: createOpaqueId(),
    orderId: createOpaqueId(),
    orderNumber: "ORDER-REPLAY",
    patientPrincipalId: createOpaqueId(),
    pharmacyOrganizationId: createOpaqueId(),
    pickedUpAt: null,
    pickupAddress: {
      addressLine1: "1 Synthetic Pharmacy Street",
      administrativeArea: "Ontario",
      countryCode: "CA",
      locality: "Toronto",
    },
    pickupContactName: "Synthetic Pharmacist",
    pickupContactPhoneE164: "+15555550101",
    pickupLocationName: "Synthetic Pharmacy",
    pickupVerifiedAt: null,
    recipientName: "Synthetic Patient",
    recipientPhoneE164: "+15555550102",
    returnedAt: null,
    status: "ASSIGNED",
    updatedAt: timestamp,
    version: 1,
  };
}
