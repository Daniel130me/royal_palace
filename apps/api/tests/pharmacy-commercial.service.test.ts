import type {
  CurrentSession,
  PharmacyOrderResponse,
  PharmacyQuoteResponse,
} from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import { PharmacyCommercialService } from "../src/pharmacy/application/pharmacy-commercial.service.js";
import type {
  InventoryGateway,
  PharmacyCommercialRepository,
  PharmacyQuotePreparation,
} from "../src/pharmacy/domain/pharmacy-commercial.types.js";
import { SyntheticInventoryGateway } from "../src/pharmacy/infrastructure/inventory-gateway.adapters.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

function session(
  role: CurrentSession["roles"][number],
  options: { organizationId?: string; principalId?: string } = {},
): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: testConfig.identity.privilegedAssuranceContext,
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships:
      options.organizationId === undefined
        ? []
        : [{ organizationId: options.organizationId, roles: [role] }],
    principalId: options.principalId ?? createOpaqueId(),
    roles: [role],
    sessionId: createOpaqueId(),
  };
}

function preparation(overrides: Partial<PharmacyQuotePreparation> = {}): PharmacyQuotePreparation {
  return {
    items: [
      {
        id: createOpaqueId(),
        lineNumber: 1,
        medicationCode: "med-1",
        medicationCodeSystem: "https://example.test/medicines",
        medicationName: "Synthetic medicine",
        quantityUnit: "tablet",
        remainingQuantity: "10.000",
        strength: "10 mg",
      },
    ],
    patientId: createOpaqueId(),
    patientPrincipalId: createOpaqueId(),
    prescriptionId: createOpaqueId(),
    prescriptionStatus: "ACCEPTED",
    prescriptionValidUntil: new Date(Date.now() + 60 * 60 * 1000),
    prescriptionVersion: 3,
    routeId: createOpaqueId(),
    routeVersion: 1,
    substitutions: [],
    ...overrides,
  };
}

function quoteFrom(prepared: PharmacyQuotePreparation): PharmacyQuoteResponse {
  const now = new Date();
  return {
    charges: [],
    createdAt: now.toISOString(),
    currency: "USD",
    expiresAt: new Date(now.getTime() + 600_000).toISOString(),
    feeMinor: "0",
    fillNumber: 0,
    id: createOpaqueId(),
    inventoryReservation: {
      expiresAt: new Date(now.getTime() + 600_000).toISOString(),
      status: "HELD",
    },
    lines: [],
    orderId: null,
    patientId: prepared.patientId,
    pharmacyOrganizationId: createOpaqueId(),
    prescriptionId: prepared.prescriptionId,
    prescriptionRouteId: prepared.routeId,
    quoteNumber: `QUOTE-${createOpaqueId()}`,
    status: "ACTIVE",
    subtotalMinor: "1000",
    taxMinor: "0",
    totalMinor: "1000",
    updatedAt: now.toISOString(),
    version: 1,
  };
}

function orderFrom(
  prepared: PharmacyQuotePreparation,
  overrides: Partial<PharmacyOrderResponse> = {},
): PharmacyOrderResponse {
  const now = new Date().toISOString();
  return {
    acceptedAt: now,
    createdAt: now,
    handoff: null,
    id: createOpaqueId(),
    latestResolution: null,
    orderNumber: `ORDER-${createOpaqueId()}`,
    patientId: prepared.patientId,
    paymentId: createOpaqueId(),
    pharmacyOrganizationId: createOpaqueId(),
    prescriptionId: prepared.prescriptionId,
    prescriptionRouteId: prepared.routeId,
    quote: quoteFrom(prepared),
    status: "CONFIRMED",
    updatedAt: now,
    version: 1,
    ...overrides,
  };
}

function createService(
  repository: Partial<PharmacyCommercialRepository>,
  inventory: InventoryGateway = new SyntheticInventoryGateway(),
  enabled = true,
) {
  return new PharmacyCommercialService(
    {
      findQuoteByIdempotency: vi.fn(async () => null),
      ...repository,
    } as PharmacyCommercialRepository,
    inventory,
    new AuthorizationService(new PolicyEngine(), { append: vi.fn(async () => undefined) }),
    {
      ...testConfig,
      inventoryGateway: {
        mode: enabled ? ("synthetic" as const) : ("disabled" as const),
        reservationTtlSeconds: 900,
      },
    },
  );
}

describe("PharmacyCommercialService", () => {
  it("fails closed when inventory qualification is disabled", async () => {
    await expect(
      createService({}, new SyntheticInventoryGateway(), false).getQuote(
        { actor: session("PATIENT"), requestId: "request-disabled" },
        createOpaqueId(),
      ),
    ).rejects.toMatchObject({ code: "pharmacy_commercial_workflow_disabled", status: 503 });
  });

  it("derives immutable clinical snapshots and exact minor-unit totals server-side", async () => {
    const organizationId = createOpaqueId();
    const prepared = preparation();
    const expectedQuote = quoteFrom(prepared);
    const createQuote = vi.fn<PharmacyCommercialRepository["createQuote"]>(async (input) => {
      expect(input.lines[0]).toMatchObject({
        lineSubtotalMinor: 2500n,
        medicationName: "Synthetic medicine",
        quantityUnit: "tablet",
      });
      return expectedQuote;
    });
    const repository = {
      createQuote,
      findPreparation: vi.fn(async () => prepared),
    };

    await expect(
      createService(repository).createQuote(
        {
          actor: session("ORGANIZATION_STAFF", { organizationId }),
          requestId: "request-create-quote",
        },
        {
          charges: [{ amountMinor: 125n, code: "SALES_TAX", label: "Sales tax", type: "TAX" }],
          currency: "USD",
          expectedPrescriptionVersion: prepared.prescriptionVersion,
          fillNumber: 0,
          idempotencyKey: "quote-key-123",
          lines: [
            {
              prescriptionItemId: prepared.items[0]!.id,
              quantity: "2.500",
              unitPriceMinor: 1000n,
            },
          ],
          pharmacyOrganizationId: organizationId,
          prescriptionId: prepared.prescriptionId,
          validForSeconds: 600,
        },
      ),
    ).resolves.toEqual(expectedQuote);
    expect(createQuote).toHaveBeenCalledOnce();
  });

  it("replays an identical quote request without reserving inventory twice", async () => {
    const organizationId = createOpaqueId();
    const principalId = createOpaqueId();
    const prepared = preparation();
    const expectedQuote = quoteFrom(prepared);
    let completedRequest: Awaited<
      ReturnType<PharmacyCommercialRepository["findQuoteByIdempotency"]>
    > = null;
    const repository: Partial<PharmacyCommercialRepository> = {
      createQuote: vi.fn(async (input) => {
        completedRequest = { quote: expectedQuote, requestHash: input.requestHash };
        return expectedQuote;
      }),
      findPreparation: vi.fn(async () => prepared),
      findQuoteByIdempotency: vi.fn(async () => completedRequest),
    };
    const reserve = vi.fn<InventoryGateway["reserve"]>(async (input) => ({
      evidenceHash: "a".repeat(64),
      expiresAt: input.expiresAt,
      providerCode: "TEST",
      providerReservationReference: `reservation-${createOpaqueId()}`,
    }));
    const release = vi.fn<InventoryGateway["release"]>(async () => undefined);
    const service = createService(repository, { providerCode: "TEST", release, reserve });
    const context = {
      actor: session("ORGANIZATION_STAFF", { organizationId, principalId }),
      requestId: "request-idempotent-quote",
    };
    const input = {
      charges: [] as const,
      currency: "USD",
      expectedPrescriptionVersion: prepared.prescriptionVersion,
      fillNumber: 0,
      idempotencyKey: "quote-key-idempotent",
      lines: [
        {
          prescriptionItemId: prepared.items[0]!.id,
          quantity: "1.000",
          unitPriceMinor: 1000n,
        },
      ],
      pharmacyOrganizationId: organizationId,
      prescriptionId: prepared.prescriptionId,
      validForSeconds: 600,
    };

    await expect(service.createQuote(context, input)).resolves.toEqual(expectedQuote);
    await expect(service.createQuote(context, input)).resolves.toEqual(expectedQuote);
    await expect(
      service.createQuote(context, {
        ...input,
        lines: [{ ...input.lines[0]!, unitPriceMinor: 1001n }],
      }),
    ).rejects.toMatchObject({ reason: "IDEMPOTENCY_CONFLICT" });

    expect(reserve).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
  });

  it("rejects a quote quantity above the remaining fill balance before reserving stock", async () => {
    const organizationId = createOpaqueId();
    const prepared = preparation();
    const reserve = vi.fn<InventoryGateway["reserve"]>();
    const inventory: InventoryGateway = {
      providerCode: "TEST",
      release: vi.fn(async () => undefined),
      reserve,
    };
    await expect(
      createService({ findPreparation: vi.fn(async () => prepared) }, inventory).createQuote(
        {
          actor: session("ORGANIZATION_STAFF", { organizationId }),
          requestId: "request-overfill",
        },
        {
          charges: [],
          currency: "USD",
          expectedPrescriptionVersion: prepared.prescriptionVersion,
          fillNumber: 0,
          idempotencyKey: "quote-key-456",
          lines: [
            {
              prescriptionItemId: prepared.items[0]!.id,
              quantity: "10.001",
              unitPriceMinor: 100n,
            },
          ],
          pharmacyOrganizationId: organizationId,
          prescriptionId: prepared.prescriptionId,
          validForSeconds: 600,
        },
      ),
    ).rejects.toMatchObject({ code: "quote_quantity_exceeds_balance", status: 400 });
    expect(reserve).not.toHaveBeenCalled();
  });

  it("allows only the owning patient to accept a quote", async () => {
    const prepared = preparation();
    const quote = {
      ...quoteFrom(prepared),
      patientPrincipalId: prepared.patientPrincipalId,
    };
    const repository = { findQuote: vi.fn(async () => quote) };
    await expect(
      createService(repository).acceptQuote(
        { actor: session("PATIENT"), requestId: "request-wrong-patient" },
        quote.id,
        quote.version,
        "accept-key-123",
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
  });

  it("authorizes the owning patient before initiating cancellation", async () => {
    const prepared = preparation();
    const order = orderFrom(prepared);
    const response = { ...order, status: "REFUND_PENDING" as const, version: 2 };
    const cancelOrder = vi.fn<PharmacyCommercialRepository["cancelOrder"]>(async () => response);
    const service = createService({
      cancelOrder,
      findOrder: vi.fn(async () => ({
        ...order,
        patientPrincipalId: prepared.patientPrincipalId,
      })),
    });

    await expect(
      service.cancelOrder(
        {
          actor: session("PATIENT", { principalId: prepared.patientPrincipalId }),
          requestId: "request-cancel-order",
        },
        order.id,
        order.version,
        "PATIENT_REQUEST",
        "cancel-order-key",
      ),
    ).resolves.toEqual(response);
    expect(cancelOrder).toHaveBeenCalledOnce();
  });

  it("restricts fulfilment handoff to the order pharmacy membership", async () => {
    const prepared = preparation();
    const order = orderFrom(prepared);
    const service = createService({
      findOrder: vi.fn(async () => ({
        ...order,
        patientPrincipalId: prepared.patientPrincipalId,
      })),
      prepareHandoff: vi.fn(async () => order),
    });

    await expect(
      service.prepareHandoff(
        {
          actor: session("ORGANIZATION_STAFF", { organizationId: createOpaqueId() }),
          requestId: "request-wrong-pharmacy-handoff",
        },
        order.id,
        order.version,
        "PICKUP",
        "prepare-handoff-key",
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
  });

  it("allows only platform administration to initiate a post-dispense dispute", async () => {
    const prepared = preparation();
    const order = orderFrom(prepared);
    const requestDispute = vi.fn<PharmacyCommercialRepository["requestDispute"]>(async () => ({
      ...order,
      status: "DISPUTE_PENDING",
      version: 2,
    }));
    const service = createService({ requestDispute });

    await expect(
      service.requestDispute(
        { actor: session("SUPPORT"), requestId: "request-support-dispute" },
        order.id,
        order.version,
        "POST_DISPENSE_REVIEW",
        "request-dispute-key",
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
    await expect(
      service.requestDispute(
        { actor: session("ADMINISTRATOR"), requestId: "request-admin-dispute" },
        order.id,
        order.version,
        "POST_DISPENSE_REVIEW",
        "request-dispute-key",
      ),
    ).resolves.toMatchObject({ status: "DISPUTE_PENDING", version: 2 });
    expect(requestDispute).toHaveBeenCalledOnce();
  });
});

describe("SyntheticInventoryGateway", () => {
  it("returns deterministic, opaque reservation evidence for idempotent retries", async () => {
    const gateway = new SyntheticInventoryGateway();
    const input = {
      expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      idempotencyKey: "principal:quote-key",
      lines: [
        {
          medicationCode: "med-1",
          prescriptionItemId: createOpaqueId(),
          quantity: "1.000",
          substitutionProposalId: null,
        },
      ],
      pharmacyOrganizationId: createOpaqueId(),
    };
    await expect(gateway.reserve(input)).resolves.toEqual(await gateway.reserve(input));
  });
});
