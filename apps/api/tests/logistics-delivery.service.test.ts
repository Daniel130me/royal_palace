import type { CurrentSession } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import type { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { LogisticsDeliveryService } from "../src/logistics/application/logistics-delivery.service.js";
import type {
  LogisticsDeliveryRecord,
  LogisticsDeliveryRepository,
} from "../src/logistics/domain/logistics-delivery.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const patientPrincipalId = createOpaqueId();
const pharmacyOrganizationId = createOpaqueId();
const logisticsOrganizationId = createOpaqueId();
const courierPrincipalId = createOpaqueId();

const delivery: LogisticsDeliveryRecord = {
  acceptedAt: null,
  activeAssignment: {
    assignedAt: new Date("2026-10-15T10:00:00.000Z"),
    courierPrincipalId,
    id: createOpaqueId(),
    logisticsOrganizationId,
    version: 1,
  },
  arrivedAtDestinationAt: null,
  arrivedAtPickupAt: null,
  assignedAt: new Date("2026-10-15T10:00:00.000Z"),
  cancelledAt: null,
  createdAt: new Date("2026-10-15T10:00:00.000Z"),
  deliveredAt: null,
  deliveryAddress: {
    addressLine1: "18 Private Street",
    administrativeArea: "Lagos",
    countryCode: "NG",
    locality: "Ikeja",
    postalCode: "100001",
  },
  deliveryInstruction: "Call only on arrival",
  deliveryNumber: "DLV-TEST",
  failedAt: null,
  handoffId: createOpaqueId(),
  handoffReference: "HANDOFF-TEST",
  id: createOpaqueId(),
  logisticsOrganizationId,
  orderId: createOpaqueId(),
  orderNumber: "ORDER-TEST",
  patientPrincipalId,
  pharmacyOrganizationId,
  pickedUpAt: null,
  pickupAddress: {
    addressLine1: "2 Pharmacy Road",
    administrativeArea: "Lagos",
    countryCode: "NG",
    locality: "Ikeja",
  },
  pickupContactName: "Private Pharmacist",
  pickupContactPhoneE164: "+2348000000001",
  pickupLocationName: "Synthetic Pharmacy",
  pickupVerifiedAt: null,
  recipientName: "Private Patient",
  recipientPhoneE164: "+2348000000002",
  returnedAt: null,
  status: "ASSIGNED",
  updatedAt: new Date("2026-10-15T10:00:00.000Z"),
  version: 1,
};

describe("LogisticsDeliveryService projections", () => {
  it("returns a patient tracking projection without recipient, courier, order, or full-address data", async () => {
    const { service, repository } = createService();
    const result = await service.listPatient(context(session(["PATIENT"], patientPrincipalId)), {
      limit: 25,
    });

    expect(repository.listByPatient).toHaveBeenCalledWith(
      patientPrincipalId,
      expect.objectContaining({ limit: 26 }),
    );
    expect(result.data[0]).toMatchObject({
      deliveryArea: { administrativeArea: "Lagos", countryCode: "NG", locality: "Ikeja" },
      deliveryNumber: "DLV-TEST",
      pickupLocationName: "Synthetic Pharmacy",
    });
    expect(result.data[0]).not.toHaveProperty("recipientName");
    expect(result.data[0]).not.toHaveProperty("recipientPhoneE164");
    expect(result.data[0]).not.toHaveProperty("activeAssignment");
    expect(result.data[0]).not.toHaveProperty("orderNumber");
    expect(result.data[0]).not.toHaveProperty("deliveryAddress");
  });

  it("returns full fulfilment fields only to the exact logistics organization boundary", async () => {
    const { service } = createService();
    const result = await service.getOrganization(
      context(session([], createOpaqueId(), ["LOGISTICS"])),
      logisticsOrganizationId,
      delivery.id,
    );

    expect(result).toMatchObject({
      activeAssignment: { courierPrincipalId },
      deliveryAddress: { addressLine1: "18 Private Street" },
      pickupContactPhoneE164: "+2348000000001",
      recipientPhoneE164: "+2348000000002",
    });
  });

  it("hides an out-of-scope delivery as not found before returning sensitive fields", async () => {
    const { service } = createService();
    await expect(
      service.getOrganization(
        context(session([], createOpaqueId(), ["LOGISTICS"])),
        createOpaqueId(),
        delivery.id,
      ),
    ).rejects.toMatchObject({ code: "delivery_not_found", status: 404 });
  });
});

function createService() {
  const repository = {
    assignCourier: vi.fn(),
    cancel: vi.fn(),
    dispatch: vi.fn(),
    findById: vi.fn().mockResolvedValue(delivery),
    listAdmin: vi.fn().mockResolvedValue([delivery]),
    listByLogisticsOrganization: vi.fn().mockResolvedValue([delivery]),
    listByPatient: vi.fn().mockResolvedValue([delivery]),
    listByPharmacy: vi.fn().mockResolvedValue([delivery]),
    listHistory: vi.fn().mockResolvedValue([]),
    reassign: vi.fn(),
    transition: vi.fn(),
  } satisfies LogisticsDeliveryRepository;
  const authorization = {
    authorize: vi.fn().mockResolvedValue({ allowed: true }),
  } as unknown as AuthorizationService;
  return { repository, service: new LogisticsDeliveryService(repository, authorization) };
}

function session(
  roles: CurrentSession["roles"],
  principalId: string,
  organizationRoles: CurrentSession["roles"] = [],
): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: "urn:royal-palace:assurance:mfa",
    authenticatedAt: "2026-10-15T00:00:00.000Z",
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships:
      organizationRoles.length === 0
        ? []
        : [
            {
              organizationId: logisticsOrganizationId,
              organizationType: "LOGISTICS",
              roles: organizationRoles,
            },
          ],
    principalId,
    roles,
    sessionId: createOpaqueId(),
  };
}

function context(actor: CurrentSession) {
  return { actor, requestId: createOpaqueId() };
}
