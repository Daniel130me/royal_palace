import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { CurrentSession } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import {
  INVENTORY_GATEWAY,
  PHARMACY_COMMERCIAL_REPOSITORY,
  PharmacyCommercialConflictError,
  type InventoryGateway,
  type PharmacyCommercialRepository,
  type PharmacyQuoteChargeInput,
  type PharmacyQuoteLineInput,
  type PharmacyQuoteResolvedLine,
} from "../domain/pharmacy-commercial.types.js";
import { InventoryGatewayDisabledError } from "../infrastructure/inventory-gateway.adapters.js";

const QUANTITY_SCALE = 1_000n;

export interface PharmacyCommercialRequestContext {
  actor: CurrentSession;
  requestId: string;
}

export class PharmacyCommercialFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PharmacyCommercialFlowError";
  }
}

@Injectable()
export class PharmacyCommercialService {
  constructor(
    @Inject(PHARMACY_COMMERCIAL_REPOSITORY)
    private readonly repository: PharmacyCommercialRepository,
    @Inject(INVENTORY_GATEWAY) private readonly inventory: InventoryGateway,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async createQuote(
    context: PharmacyCommercialRequestContext,
    input: {
      charges: readonly PharmacyQuoteChargeInput[];
      currency: string;
      expectedPrescriptionVersion: number;
      fillNumber: number;
      idempotencyKey: string;
      lines: readonly PharmacyQuoteLineInput[];
      pharmacyOrganizationId: string;
      prescriptionId: string;
      validForSeconds: number;
    },
  ) {
    this.assertCommercialWorkflowEnabled();
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        organizationId: input.pharmacyOrganizationId,
        resourceId: input.prescriptionId,
        resourceType: "pharmacy_quote",
      },
      policy: AUTHORIZATION_POLICY.MANAGE_PHARMACY_QUOTE,
      requestId: context.requestId,
    });
    if (input.validForSeconds > this.config.inventoryGateway.reservationTtlSeconds) {
      throw new PharmacyCommercialFlowError(
        "quote_duration_exceeds_inventory_hold",
        400,
        "Quote duration exceeds the configured inventory hold",
      );
    }

    const preparation = await this.repository.findPreparation({
      fillNumber: input.fillNumber,
      pharmacyOrganizationId: input.pharmacyOrganizationId,
      prescriptionId: input.prescriptionId,
    });
    if (preparation === null) {
      throw new PharmacyCommercialFlowError(
        "prescription_not_quotable",
        409,
        "Prescription cannot be quoted by this pharmacy",
      );
    }
    if (preparation.prescriptionVersion !== input.expectedPrescriptionVersion) {
      throw new PharmacyCommercialFlowError(
        "prescription_version_conflict",
        409,
        "Prescription changed before the quote was created",
      );
    }
    const expiresAt = new Date(Date.now() + input.validForSeconds * 1000);
    if (expiresAt > preparation.prescriptionValidUntil) {
      throw new PharmacyCommercialFlowError(
        "quote_exceeds_prescription_validity",
        409,
        "Quote cannot outlive the prescription",
      );
    }

    const lines = resolveQuoteLines(preparation, input.lines, input.fillNumber);
    assertCharges(input.charges);
    const totalMinor =
      lines.reduce((total, line) => total + line.lineSubtotalMinor, 0n) +
      input.charges.reduce((total, charge) => total + charge.amountMinor, 0n);
    if (totalMinor <= 0n) {
      throw invalidLine("invalid_quote_total", "Quote total must be greater than zero");
    }
    const requestHash = hashRequest({
      charges: input.charges.map((charge) => ({
        ...charge,
        amountMinor: charge.amountMinor.toString(),
      })),
      currency: input.currency,
      expectedPrescriptionVersion: input.expectedPrescriptionVersion,
      fillNumber: input.fillNumber,
      lines: input.lines.map((line) => ({
        ...line,
        substitutionProposalId: line.substitutionProposalId ?? null,
        unitPriceMinor: line.unitPriceMinor.toString(),
      })),
      pharmacyOrganizationId: input.pharmacyOrganizationId,
      prescriptionId: input.prescriptionId,
      validForSeconds: input.validForSeconds,
    });
    const existing = await this.repository.findQuoteByIdempotency({
      idempotencyKey: input.idempotencyKey,
      principalId: context.actor.principalId,
    });
    if (existing !== null) {
      if (existing.requestHash !== requestHash) {
        throw new PharmacyCommercialConflictError("IDEMPOTENCY_CONFLICT");
      }
      return existing.quote;
    }
    let reservation;
    try {
      reservation = await this.inventory.reserve({
        expiresAt,
        idempotencyKey: `${context.actor.principalId}:${input.idempotencyKey}`,
        lines: lines.map((line) => ({
          medicationCode: line.medicationCode,
          prescriptionItemId: line.prescriptionItemId,
          quantity: line.quantity,
          substitutionProposalId: line.substitutionProposalId ?? null,
        })),
        pharmacyOrganizationId: input.pharmacyOrganizationId,
      });
    } catch (error) {
      if (error instanceof InventoryGatewayDisabledError) {
        throw new PharmacyCommercialFlowError(
          "inventory_gateway_disabled",
          503,
          "Inventory reservation is not enabled",
        );
      }
      throw error;
    }

    try {
      const quote = await this.repository.createQuote({
        charges: input.charges,
        currency: input.currency,
        expiresAt,
        fillNumber: input.fillNumber,
        idempotencyKey: input.idempotencyKey,
        inventoryReservation: reservation,
        lines,
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        preparation,
        principalId: context.actor.principalId,
        requestHash,
      });
      if (quote === null) {
        throw new PharmacyCommercialConflictError("VERSION_CONFLICT");
      }
      return quote;
    } catch (error) {
      const concurrentWinner = await this.repository.findQuoteByIdempotency({
        idempotencyKey: input.idempotencyKey,
        principalId: context.actor.principalId,
      });
      if (concurrentWinner !== null) {
        if (concurrentWinner.requestHash !== requestHash) {
          throw new PharmacyCommercialConflictError("IDEMPOTENCY_CONFLICT");
        }
        return concurrentWinner.quote;
      }
      try {
        await this.inventory.release({
          providerReservationReference: reservation.providerReservationReference,
          reason: "QUOTE_PERSISTENCE_FAILED",
        });
      } catch (releaseError) {
        throw new PharmacyCommercialFlowError(
          "inventory_compensation_failed",
          503,
          "Inventory reservation could not be compensated",
          { cause: releaseError },
        );
      }
      throw error;
    }
  }

  async getQuote(context: PharmacyCommercialRequestContext, quoteId: string) {
    this.assertCommercialWorkflowEnabled();
    const quote = await this.repository.findQuote(quoteId);
    if (quote === null) {
      throw new PharmacyCommercialFlowError("quote_not_found", 404, "Quote was not found");
    }
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        organizationId: quote.pharmacyOrganizationId,
        patientPrincipalId: quote.patientPrincipalId,
        resourceId: quote.id,
        resourceType: "pharmacy_quote",
      },
      policy: AUTHORIZATION_POLICY.VIEW_PHARMACY_QUOTE,
      requestId: context.requestId,
    });
    const { patientPrincipalId: _privatePatientPrincipalId, ...response } = quote;
    return response;
  }

  async acceptQuote(
    context: PharmacyCommercialRequestContext,
    quoteId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    this.assertCommercialWorkflowEnabled();
    const quote = await this.repository.findQuote(quoteId);
    if (quote === null) {
      throw new PharmacyCommercialFlowError("quote_not_found", 404, "Quote was not found");
    }
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: quote.patientPrincipalId,
        resourceId: quote.id,
        resourceType: "pharmacy_quote",
      },
      policy: AUTHORIZATION_POLICY.ACCEPT_PHARMACY_QUOTE,
      requestId: context.requestId,
    });
    const order = await this.repository.acceptQuote({
      expectedVersion,
      idempotencyKey,
      patientPrincipalId: context.actor.principalId,
      quoteId,
      requestHash: hashRequest({ expectedVersion, quoteId }),
    });
    if (order === null) {
      throw new PharmacyCommercialFlowError(
        "quote_acceptance_conflict",
        409,
        "Quote could not be accepted",
      );
    }
    return order;
  }

  async getOrder(context: PharmacyCommercialRequestContext, orderId: string) {
    this.assertCommercialWorkflowEnabled();
    const order = await this.repository.findOrder(orderId);
    if (order === null) {
      throw new PharmacyCommercialFlowError("order_not_found", 404, "Order was not found");
    }
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        organizationId: order.pharmacyOrganizationId,
        patientPrincipalId: order.patientPrincipalId,
        resourceId: order.id,
        resourceType: "pharmacy_order",
      },
      policy: AUTHORIZATION_POLICY.VIEW_PHARMACY_ORDER,
      requestId: context.requestId,
    });
    const { patientPrincipalId: _privatePatientPrincipalId, ...response } = order;
    return response;
  }

  private assertCommercialWorkflowEnabled(): void {
    if (
      this.config.clinicalWorkflow.mode !== "synthetic" ||
      this.config.inventoryGateway.mode !== "synthetic"
    ) {
      throw new PharmacyCommercialFlowError(
        "pharmacy_commercial_workflow_disabled",
        503,
        "Pharmacy commercial workflows are not enabled in this environment",
      );
    }
  }
}

function resolveQuoteLines(
  preparation: NonNullable<Awaited<ReturnType<PharmacyCommercialRepository["findPreparation"]>>>,
  inputLines: readonly PharmacyQuoteLineInput[],
  fillNumber: number,
): PharmacyQuoteResolvedLine[] {
  const items = new Map(preparation.items.map((item) => [item.id, item]));
  const substitutions = new Map(preparation.substitutions.map((item) => [item.id, item]));
  return inputLines.map((line) => {
    const item = items.get(line.prescriptionItemId);
    if (item === undefined) {
      throw invalidLine(
        "quote_item_not_eligible",
        "Quote contains an ineligible prescription item",
      );
    }
    const quantity = parseThousandths(line.quantity);
    const remaining = parseThousandths(item.remainingQuantity);
    if (quantity <= 0n || quantity > remaining) {
      throw invalidLine("quote_quantity_exceeds_balance", "Quote quantity exceeds fill balance");
    }
    if (line.unitPriceMinor < 0n) {
      throw invalidLine("invalid_quote_price", "Quote price cannot be negative");
    }
    const scaledSubtotal = line.unitPriceMinor * quantity;
    if (scaledSubtotal % QUANTITY_SCALE !== 0n) {
      throw invalidLine(
        "fractional_minor_amount",
        "Line price and quantity produce a fractional currency minor unit",
      );
    }
    const substitution =
      line.substitutionProposalId === undefined
        ? undefined
        : substitutions.get(line.substitutionProposalId);
    if (
      line.substitutionProposalId !== undefined &&
      (substitution === undefined ||
        substitution.prescriptionItemId !== item.id ||
        substitution.fillNumber !== fillNumber)
    ) {
      throw invalidLine("substitution_not_approved", "Quote references an unapproved substitution");
    }
    return {
      ...line,
      lineNumber: item.lineNumber,
      lineSubtotalMinor: scaledSubtotal / QUANTITY_SCALE,
      medicationCode: substitution?.medicationCode ?? item.medicationCode,
      medicationCodeSystem: substitution?.medicationCodeSystem ?? item.medicationCodeSystem,
      medicationName: substitution?.medicationName ?? item.medicationName,
      quantityUnit: item.quantityUnit,
      strength: substitution?.strength ?? item.strength,
    };
  });
}

function assertCharges(charges: readonly PharmacyQuoteChargeInput[]): void {
  const unique = new Set<string>();
  for (const charge of charges) {
    if (charge.amountMinor < 0n) {
      throw invalidLine("invalid_quote_charge", "Quote charge cannot be negative");
    }
    const key = `${charge.type}:${charge.code}`;
    if (unique.has(key)) {
      throw invalidLine("duplicate_quote_charge", "Quote charge codes must be unique by type");
    }
    unique.add(key);
  }
}

function parseThousandths(value: string): bigint {
  const match = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(value);
  if (match === null) {
    throw invalidLine("invalid_quote_quantity", "Quote quantity is invalid");
  }
  return BigInt(match[1]!) * QUANTITY_SCALE + BigInt((match[2] ?? "").padEnd(3, "0") || "0");
}

function invalidLine(code: string, message: string): PharmacyCommercialFlowError {
  return new PharmacyCommercialFlowError(code, 400, message);
}

function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
