import type { CurrentSession } from "@royal-palace/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import {
  PharmacyInventoryFlowError,
  PharmacyInventoryService,
} from "../src/pharmacy/application/pharmacy-inventory.service.js";
import type { PharmacyInventoryRepository } from "../src/pharmacy/domain/pharmacy-inventory.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const organizationId = createOpaqueId();
const principalId = createOpaqueId();
const itemId = createOpaqueId();

const actor: CurrentSession = {
  absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
  assuranceContext: "urn:royal-palace:aal2",
  authenticatedAt: new Date().toISOString(),
  authenticationMethods: ["pwd", "otp"],
  idleExpiresAt: "2099-01-01T00:00:00.000Z",
  memberships: [{ organizationId, organizationType: "PHARMACY", roles: ["ORGANIZATION_STAFF"] }],
  principalId,
  roles: [],
  sessionId: createOpaqueId(),
};

describe("PharmacyInventoryService", () => {
  const authorize = vi.fn().mockResolvedValue(undefined);
  const repository = {
    listCatalogItems: vi.fn(),
    recordMovement: vi.fn(),
  } as unknown as PharmacyInventoryRepository;
  const service = new PharmacyInventoryService(repository, {
    authorize,
  } as unknown as AuthorizationService);
  const context = { actor, requestId: "request-inventory-001" };

  beforeEach(() => vi.clearAllMocks());

  it("authorizes and scopes bounded catalogue queries to the pharmacy", async () => {
    vi.mocked(repository.listCatalogItems).mockResolvedValue({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    });

    await service.listCatalogItems(context, { limit: 25, pharmacyOrganizationId: organizationId });

    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ organizationId }),
        policy: "MANAGE_PHARMACY_INVENTORY",
      }),
    );
    expect(repository.listCatalogItems).toHaveBeenCalledWith({
      cursor: undefined,
      limit: 25,
      pharmacyOrganizationId: organizationId,
    });
  });

  it("rejects malformed opaque cursors before repository access", async () => {
    await expect(
      service.listCatalogItems(context, {
        cursor: "not-a-valid-cursor",
        limit: 25,
        pharmacyOrganizationId: organizationId,
      }),
    ).rejects.toMatchObject({ code: "invalid_cursor", status: 400 });
    expect(repository.listCatalogItems).not.toHaveBeenCalled();
  });

  it("rejects already-expired receipts before writing stock", async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    yesterday.setUTCHours(0, 0, 0, 0);
    await expect(
      service.recordMovement(context, {
        batchNumber: "LOT-001",
        catalogItemId: itemId,
        expiryDate: yesterday,
        idempotencyKey: "receipt-001",
        locationId: createOpaqueId(),
        pharmacyOrganizationId: organizationId,
        quantity: "10.000",
        reasonCode: "PURCHASE_RECEIPT",
        receivedAt: new Date(),
        type: "RECEIVE",
      }),
    ).rejects.toBeInstanceOf(PharmacyInventoryFlowError);
    expect(repository.recordMovement).not.toHaveBeenCalled();
  });

  it("adds the authenticated actor and request id to movement evidence", async () => {
    const movement = {
      id: createOpaqueId(),
      lotId: createOpaqueId(),
      occurredAt: new Date().toISOString(),
      onHandAfter: "10.000",
      quantity: "10.000",
      reasonCode: "PURCHASE_RECEIPT",
      referenceId: null,
      referenceType: "MANUAL" as const,
      reservedAfter: "0.000",
      type: "RECEIVE" as const,
    };
    vi.mocked(repository.recordMovement).mockResolvedValue(movement);

    await service.recordMovement(context, {
      batchNumber: "LOT-002",
      catalogItemId: itemId,
      expiryDate: new Date("2099-01-01T00:00:00.000Z"),
      idempotencyKey: "receipt-002",
      locationId: createOpaqueId(),
      pharmacyOrganizationId: organizationId,
      quantity: "10.000",
      reasonCode: "PURCHASE_RECEIPT",
      receivedAt: new Date(),
      type: "RECEIVE",
    });

    expect(repository.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ actorPrincipalId: principalId, requestId: context.requestId }),
    );
  });
});
