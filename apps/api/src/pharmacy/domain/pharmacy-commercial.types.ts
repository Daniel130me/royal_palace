import type { PharmacyOrderResponse, PharmacyQuoteResponse } from "@royal-palace/contracts";

export interface PharmacyQuoteLineInput {
  prescriptionItemId: string;
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

export interface PharmacyQuotePreparation {
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
      medicationCode: string | null;
      prescriptionItemId: string;
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
    fillNumber: number;
    idempotencyKey: string;
    inventoryReservation: InventoryReservationEvidence;
    lines: readonly PharmacyQuoteResolvedLine[];
    pharmacyOrganizationId: string;
    principalId: string;
    preparation: PharmacyQuotePreparation;
    requestHash: string;
  }): Promise<PharmacyQuoteResponse | null>;
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
  findQuote(quoteId: string): Promise<
    | (PharmacyQuoteResponse & {
        patientPrincipalId: string;
      })
    | null
  >;
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
