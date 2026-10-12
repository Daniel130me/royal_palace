import type {
  PharmacyOrderListResponse,
  PharmacyOrderResponse,
  PharmacyQuoteListResponse,
  PharmacyQuoteResponse,
  PatientPharmacyCatalogItemListResponse,
} from "@royal-palace/contracts";

export interface PharmacyQuoteLineInput {
  catalogItemId?: string;
  prescriptionItemId: string | null;
  quantity: string;
  substitutionProposalId?: string;
  unitPriceMinor: bigint;
}

export interface PharmacyQuoteChargeInput {
  amountMinor: bigint;
  code: string;
  label: string;
  type: "TAX" | "FEE";
}

export interface PharmacyQuoteResolvedLine extends PharmacyQuoteLineInput {
  lineNumber: number;
  lineSubtotalMinor: bigint;
  medicationCode: string | null;
  medicationCodeSystem: string | null;
  medicationName: string;
  quantityUnit: string;
  strength: string | null;
}

export interface PrescriptionPharmacyQuotePreparation {
  kind: "PRESCRIPTION";
  patientId: string;
  patientPrincipalId: string;
  prescriptionId: string;
  prescriptionStatus: "ACCEPTED" | "PARTIALLY_DISPENSED";
  prescriptionValidUntil: Date;
  prescriptionVersion: number;
  routeId: string;
  routeVersion: number;
  items: readonly {
    id: string;
    lineNumber: number;
    medicationCode: string | null;
    medicationCodeSystem: string | null;
    medicationName: string;
    quantityUnit: string;
    remainingQuantity: string;
    strength: string | null;
  }[];
  substitutions: readonly {
    fillNumber: number;
    id: string;
    medicationCode: string | null;
    medicationCodeSystem: string | null;
    medicationName: string;
    prescriptionItemId: string;
    strength: string | null;
  }[];
}

export interface DirectPharmacyQuotePreparation {
  kind: "DIRECT_OTC";
  patientId: string;
  patientPrincipalId: string;
  items: readonly {
    availableQuantity: string;
    brandName: string | null;
    catalogItemId: string;
    controlledMedication: boolean;
    currency: string;
    dosageFormName: string;
    genericName: string | null;
    medicationCode: string | null;
    medicationCodeSystem: string | null;
    medicationName: string;
    prescriptionRequired: boolean;
    strength: string | null;
    unitPriceMinor: bigint;
    version: number;
  }[];
}

/** Backwards-compatible name for the prescription quote preparation aggregate. */
export type PharmacyQuotePreparation = PrescriptionPharmacyQuotePreparation;
export type AnyPharmacyQuotePreparation = PharmacyQuotePreparation | DirectPharmacyQuotePreparation;

export interface InventoryReservationEvidence {
  evidenceHash: string;
  expiresAt: Date;
  providerCode: string;
  providerReservationReference: string;
}

export interface InventoryGateway {
  readonly providerCode: string;
  reserve(input: {
    expiresAt: Date;
    idempotencyKey: string;
    lines: readonly {
      catalogItemId: string | null;
      medicationCode: string | null;
      prescriptionItemId: string | null;
      quantity: string;
      substitutionProposalId: string | null;
    }[];
    pharmacyOrganizationId: string;
  }): Promise<InventoryReservationEvidence>;
  release(input: {
    providerReservationReference: string;
    reason: "QUOTE_PERSISTENCE_FAILED";
  }): Promise<void>;
}

export const PLATFORM_INVENTORY_PROVIDER_CODE = "PLATFORM_INVENTORY";

export class PharmacyCommercialConflictError extends Error {
  constructor(
    readonly reason:
      | "ACTIVE_QUOTE_EXISTS"
      | "IDEMPOTENCY_CONFLICT"
      | "INVALID_PRESCRIPTION_STATE"
      | "INVENTORY_RESERVATION_INVALID"
      | "ADMIN_DISPUTE_REQUIRED"
      | "DISPENSE_EVIDENCE_REQUIRED"
      | "ORDER_NOT_ACTIONABLE"
      | "QUOTE_NOT_ACCEPTABLE"
      | "VERSION_CONFLICT"
      | "INVARIANT_VIOLATION",
  ) {
    super(reason);
    this.name = "PharmacyCommercialConflictError";
  }
}

export interface PharmacyCommercialRepository {
  acceptQuote(input: {
    expectedVersion: number;
    idempotencyKey: string;
    patientPrincipalId: string;
    quoteId: string;
    requestHash: string;
  }): Promise<PharmacyOrderResponse | null>;
  createQuote(input: {
    charges: readonly PharmacyQuoteChargeInput[];
    currency: string;
    expiresAt: Date;
    fillNumber: number | null;
    idempotencyKey: string;
    inventoryReservation: InventoryReservationEvidence;
    lines: readonly PharmacyQuoteResolvedLine[];
    pharmacyOrganizationId: string;
    principalId: string;
    preparation: AnyPharmacyQuotePreparation;
    requestHash: string;
  }): Promise<PharmacyQuoteResponse | null>;
  expireDueQuotes(input: {
    actorPrincipalId: string;
    limit: number;
    now: Date;
  }): Promise<{ expired: number }>;
  cancelOrder(input: {
    expectedVersion: number;
    idempotencyKey: string;
    orderId: string;
    patientPrincipalId: string;
    reasonCode: string;
    requestHash: string;
  }): Promise<PharmacyOrderResponse | null>;
  completeHandoff(input: {
    expectedHandoffVersion: number;
    idempotencyKey: string;
    orderId: string;
    principalId: string;
    requestHash: string;
  }): Promise<PharmacyOrderResponse | null>;
  findOrder(orderId: string): Promise<
    | (PharmacyOrderResponse & {
        patientPrincipalId: string;
      })
    | null
  >;
  findQuoteByIdempotency(input: {
    idempotencyKey: string;
    principalId: string;
  }): Promise<{ quote: PharmacyQuoteResponse; requestHash: string } | null>;
  findPreparation(input: {
    fillNumber: number;
    pharmacyOrganizationId: string;
    prescriptionId: string;
  }): Promise<PharmacyQuotePreparation | null>;
  findDirectPreparation(input: {
    catalogItemIds: readonly string[];
    patientPrincipalId: string;
    pharmacyOrganizationId: string;
  }): Promise<DirectPharmacyQuotePreparation | null>;
  listPatientCatalogItems(input: {
    cursor?: { id: string; sortValue: string };
    limit: number;
    pharmacyOrganizationId: string;
    query?: string;
  }): Promise<PatientPharmacyCatalogItemListResponse>;
  findQuote(quoteId: string): Promise<
    | (PharmacyQuoteResponse & {
        patientPrincipalId: string;
      })
    | null
  >;
  listOrders(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    patientPrincipalId?: string;
    pharmacyOrganizationId?: string;
  }): Promise<PharmacyOrderListResponse>;
  listQuotes(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    patientPrincipalId?: string;
    pharmacyOrganizationId?: string;
  }): Promise<PharmacyQuoteListResponse>;
  prepareHandoff(input: {
    expectedOrderVersion: number;
    idempotencyKey: string;
    method: "PICKUP" | "DELIVERY";
    orderId: string;
    principalId: string;
    requestHash: string;
  }): Promise<PharmacyOrderResponse | null>;
  requestDispute(input: {
    expectedVersion: number;
    idempotencyKey: string;
    orderId: string;
    principalId: string;
    reasonCode: string;
    requestHash: string;
  }): Promise<PharmacyOrderResponse | null>;
}

export const PHARMACY_COMMERCIAL_REPOSITORY = Symbol("PHARMACY_COMMERCIAL_REPOSITORY");
export const INVENTORY_GATEWAY = Symbol("INVENTORY_GATEWAY");
