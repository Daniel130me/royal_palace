import { Inject, Injectable } from "@nestjs/common";
import type { PharmacyOrderResponse, PharmacyQuoteResponse } from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import {
  PharmacyCommercialConflictError,
  type PharmacyCommercialRepository,
} from "../domain/pharmacy-commercial.types.js";

const CREATE_QUOTE_OPERATION = "CREATE_PHARMACY_QUOTE";
const ACCEPT_QUOTE_OPERATION = "ACCEPT_PHARMACY_QUOTE";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const quoteInclude = {
  charges: { orderBy: [{ type: "asc" }, { code: "asc" }] },
  inventoryReservation: true,
  lines: { orderBy: { lineNumber: "asc" } },
  order: { select: { id: true } },
  patient: { select: { principalId: true } },
} satisfies Prisma.PharmacyQuoteInclude;

const orderInclude = {
  payment: { select: { id: true } },
  patient: { select: { principalId: true } },
  quote: { include: quoteInclude },
} satisfies Prisma.PharmacyOrderInclude;

type QuoteRecord = Prisma.PharmacyQuoteGetPayload<{ include: typeof quoteInclude }>;
type OrderRecord = Prisma.PharmacyOrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class PrismaPharmacyCommercialRepository implements PharmacyCommercialRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async findPreparation(input: {
    fillNumber: number;
    pharmacyOrganizationId: string;
    prescriptionId: string;
  }) {
    const route = await this.database.prescriptionRoute.findFirst({
      select: {
        id: true,
        prescription: {
          select: {
            id: true,
            items: {
              orderBy: { lineNumber: "asc" },
              select: {
                id: true,
                lineNumber: true,
                medicationCode: true,
                medicationCodeSystem: true,
                medicationName: true,
                quantity: true,
                quantityUnit: true,
                refillsAuthorized: true,
                strength: true,
              },
            },
            patient: { select: { id: true, principalId: true } },
            status: true,
            validUntil: true,
            version: true,
          },
        },
        version: true,
      },
      where: {
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        prescriptionId: input.prescriptionId,
        status: "ACCEPTED",
      },
    });
    if (
      route === null ||
      !["ACCEPTED", "PARTIALLY_DISPENSED"].includes(route.prescription.status) ||
      route.prescription.validUntil === null
    ) {
      return null;
    }

    const eligibleItems = route.prescription.items.filter(
      (item) => input.fillNumber <= item.refillsAuthorized,
    );
    const [dispensed, substitutions] = await Promise.all([
      this.database.prescriptionDispenseLine.groupBy({
        _sum: { quantity: true },
        by: ["prescriptionItemId"],
        where: {
          fillNumber: input.fillNumber,
          prescriptionItemId: { in: eligibleItems.map((item) => item.id) },
        },
      }),
      this.database.prescriptionSubstitutionProposal.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          fillNumber: true,
          id: true,
          prescriptionItemId: true,
          proposedMedicationCode: true,
          proposedMedicationCodeSystem: true,
          proposedMedicationName: true,
          proposedStrength: true,
        },
        where: { fillNumber: input.fillNumber, routeId: route.id, status: "APPROVED" },
      }),
    ]);
    const dispensedByItem = new Map(
      dispensed.map((row) => [row.prescriptionItemId, row._sum.quantity ?? new Prisma.Decimal(0)]),
    );

    return {
      items: eligibleItems.map((item) => ({
        id: item.id,
        lineNumber: item.lineNumber,
        medicationCode: item.medicationCode,
        medicationCodeSystem: item.medicationCodeSystem,
        medicationName: item.medicationName,
        quantityUnit: item.quantityUnit,
        remainingQuantity: item.quantity
          .minus(dispensedByItem.get(item.id) ?? new Prisma.Decimal(0))
          .toFixed(3),
        strength: item.strength,
      })),
      patientId: route.prescription.patient.id,
      patientPrincipalId: route.prescription.patient.principalId,
      prescriptionId: route.prescription.id,
      prescriptionStatus: route.prescription.status as "ACCEPTED" | "PARTIALLY_DISPENSED",
      prescriptionValidUntil: route.prescription.validUntil,
      prescriptionVersion: route.prescription.version,
      routeId: route.id,
      routeVersion: route.version,
      substitutions: substitutions.map((proposal) => ({
        fillNumber: proposal.fillNumber,
        id: proposal.id,
        medicationCode: proposal.proposedMedicationCode,
        medicationCodeSystem: proposal.proposedMedicationCodeSystem,
        medicationName: proposal.proposedMedicationName,
        prescriptionItemId: proposal.prescriptionItemId,
        strength: proposal.proposedStrength,
      })),
    };
  }

  async createQuote(input: Parameters<PharmacyCommercialRepository["createQuote"]>[0]) {
    try {
      return await this.database.$transaction(
        async (transaction) => {
          const existing = await transaction.idempotencyKey.findUnique({
            where: {
              principalId_operation_key: {
                key: input.idempotencyKey,
                operation: CREATE_QUOTE_OPERATION,
                principalId: input.principalId,
              },
            },
          });
          if (existing !== null) {
            if (existing.requestHash !== input.requestHash) {
              throw new PharmacyCommercialConflictError("IDEMPOTENCY_CONFLICT");
            }
            if (existing.status === "COMPLETED" && existing.resourceId !== null) {
              const quote = await transaction.pharmacyQuote.findUnique({
                include: quoteInclude,
                where: { id: existing.resourceId },
              });
              if (quote !== null) return mapQuote(quote);
            }
            throw new PharmacyCommercialConflictError("IDEMPOTENCY_CONFLICT");
          }

          const now = new Date();
          if (
            input.expiresAt <= now ||
            input.inventoryReservation.expiresAt.getTime() !== input.expiresAt.getTime()
          ) {
            throw new PharmacyCommercialConflictError("INVENTORY_RESERVATION_INVALID");
          }
          const route = await transaction.prescriptionRoute.findFirst({
            select: {
              prescription: { select: { status: true, validUntil: true, version: true } },
              version: true,
            },
            where: {
              id: input.preparation.routeId,
              pharmacyOrganizationId: input.pharmacyOrganizationId,
              prescriptionId: input.preparation.prescriptionId,
              status: "ACCEPTED",
            },
          });
          if (
            route === null ||
            route.version !== input.preparation.routeVersion ||
            route.prescription.version !== input.preparation.prescriptionVersion
          ) {
            throw new PharmacyCommercialConflictError("VERSION_CONFLICT");
          }
          if (
            !["ACCEPTED", "PARTIALLY_DISPENSED"].includes(route.prescription.status) ||
            route.prescription.validUntil === null ||
            route.prescription.validUntil <= now ||
            input.expiresAt > route.prescription.validUntil
          ) {
            throw new PharmacyCommercialConflictError("INVALID_PRESCRIPTION_STATE");
          }

          const expiredQuotes = await transaction.pharmacyQuote.findMany({
            select: { id: true },
            where: {
              expiresAt: { lte: now },
              fillNumber: input.fillNumber,
              prescriptionRouteId: input.preparation.routeId,
              status: "ACTIVE",
            },
          });
          if (expiredQuotes.length > 0) {
            const expiredIds = expiredQuotes.map((quote) => quote.id);
            await transaction.pharmacyQuote.updateMany({
              data: { status: "EXPIRED", updatedAt: now, version: { increment: 1 } },
              where: { id: { in: expiredIds }, status: "ACTIVE" },
            });
            await transaction.inventoryReservation.updateMany({
              data: { status: "EXPIRED", updatedAt: now, version: { increment: 1 } },
              where: { quoteId: { in: expiredIds }, status: "HELD" },
            });
          }
          const activeQuote = await transaction.pharmacyQuote.findFirst({
            select: { id: true },
            where: {
              fillNumber: input.fillNumber,
              prescriptionRouteId: input.preparation.routeId,
              status: { in: ["ACTIVE", "ACCEPTED"] },
            },
          });
          if (activeQuote !== null) {
            throw new PharmacyCommercialConflictError("ACTIVE_QUOTE_EXISTS");
          }

          const idempotencyId = createOpaqueId();
          await transaction.idempotencyKey.create({
            data: {
              expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
              id: idempotencyId,
              key: input.idempotencyKey,
              operation: CREATE_QUOTE_OPERATION,
              principalId: input.principalId,
              requestHash: input.requestHash,
              updatedAt: now,
            },
          });

          const quoteId = createOpaqueId();
          const subtotalMinor = input.lines.reduce(
            (total, line) => total + line.lineSubtotalMinor,
            0n,
          );
          const taxMinor = sumCharges(input.charges, "TAX");
          const feeMinor = sumCharges(input.charges, "FEE");
          await transaction.pharmacyQuote.create({
            data: {
              charges: {
                create: input.charges.map((charge) => ({ ...charge, id: createOpaqueId() })),
              },
              createdByPrincipalId: input.principalId,
              currency: input.currency,
              expiresAt: input.expiresAt,
              feeMinor,
              fillNumber: input.fillNumber,
              id: quoteId,
              inventoryReservation: {
                create: {
                  evidenceHash: input.inventoryReservation.evidenceHash,
                  expiresAt: input.inventoryReservation.expiresAt,
                  id: createOpaqueId(),
                  providerCode: input.inventoryReservation.providerCode,
                  providerReservationReference:
                    input.inventoryReservation.providerReservationReference,
                  updatedAt: now,
                },
              },
              lines: {
                create: input.lines.map((line) => ({
                  id: createOpaqueId(),
                  lineNumber: line.lineNumber,
                  lineSubtotalMinor: line.lineSubtotalMinor,
                  medicationCode: line.medicationCode,
                  medicationCodeSystem: line.medicationCodeSystem,
                  medicationName: line.medicationName,
                  prescriptionItemId: line.prescriptionItemId,
                  quantity: line.quantity,
                  quantityUnit: line.quantityUnit,
                  strength: line.strength,
                  substitutionProposalId: line.substitutionProposalId,
                  unitPriceMinor: line.unitPriceMinor,
                })),
              },
              patientId: input.preparation.patientId,
              pharmacyOrganizationId: input.pharmacyOrganizationId,
              prescriptionId: input.preparation.prescriptionId,
              prescriptionRouteId: input.preparation.routeId,
              quoteNumber: `QUOTE-${quoteId.toUpperCase()}`,
              subtotalMinor,
              taxMinor,
              totalMinor: subtotalMinor + taxMinor + feeMinor,
              updatedAt: now,
            },
          });
          await transaction.idempotencyKey.update({
            data: {
              resourceId: quoteId,
              resourceType: "pharmacy_quote",
              responseStatusCode: 201,
              status: "COMPLETED",
              updatedAt: now,
            },
            where: { id: idempotencyId },
          });
          return mapQuote(
            await transaction.pharmacyQuote.findUniqueOrThrow({
              include: quoteInclude,
              where: { id: quoteId },
            }),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof PharmacyCommercialConflictError) throw error;
      if (isSerializationOrConstraintConflict(error)) return null;
      throw error;
    }
  }

  async acceptQuote(input: Parameters<PharmacyCommercialRepository["acceptQuote"]>[0]) {
    try {
      return await this.database.$transaction(
        async (transaction) => {
          const existing = await transaction.idempotencyKey.findUnique({
            where: {
              principalId_operation_key: {
                key: input.idempotencyKey,
                operation: ACCEPT_QUOTE_OPERATION,
                principalId: input.patientPrincipalId,
              },
            },
          });
          if (existing !== null) {
            if (existing.requestHash !== input.requestHash) {
              throw new PharmacyCommercialConflictError("IDEMPOTENCY_CONFLICT");
            }
            if (existing.status === "COMPLETED" && existing.resourceId !== null) {
              const order = await transaction.pharmacyOrder.findUnique({
                include: orderInclude,
                where: { id: existing.resourceId },
              });
              if (order !== null) return mapOrder(order);
            }
            throw new PharmacyCommercialConflictError("IDEMPOTENCY_CONFLICT");
          }

          const now = new Date();
          const quote = await transaction.pharmacyQuote.findUnique({
            include: { inventoryReservation: true, patient: { select: { principalId: true } } },
            where: { id: input.quoteId },
          });
          if (quote === null) return null;
          if (quote.patient.principalId !== input.patientPrincipalId) {
            throw new PharmacyCommercialConflictError("QUOTE_NOT_ACCEPTABLE");
          }
          if (
            quote.status !== "ACTIVE" ||
            quote.version !== input.expectedVersion ||
            quote.expiresAt <= now ||
            quote.inventoryReservation?.status !== "HELD" ||
            quote.inventoryReservation.expiresAt <= now
          ) {
            throw new PharmacyCommercialConflictError("QUOTE_NOT_ACCEPTABLE");
          }

          const idempotencyId = createOpaqueId();
          await transaction.idempotencyKey.create({
            data: {
              expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
              id: idempotencyId,
              key: input.idempotencyKey,
              operation: ACCEPT_QUOTE_OPERATION,
              principalId: input.patientPrincipalId,
              requestHash: input.requestHash,
              updatedAt: now,
            },
          });
          const accepted = await transaction.pharmacyQuote.updateMany({
            data: {
              acceptedAt: now,
              status: "ACCEPTED",
              updatedAt: now,
              version: { increment: 1 },
            },
            where: {
              expiresAt: { gt: now },
              id: quote.id,
              status: "ACTIVE",
              version: input.expectedVersion,
            },
          });
          if (accepted.count !== 1) {
            throw new PharmacyCommercialConflictError("VERSION_CONFLICT");
          }

          const orderId = createOpaqueId();
          const paymentId = createOpaqueId();
          await transaction.pharmacyOrder.create({
            data: {
              acceptedAt: now,
              acceptedByPrincipalId: input.patientPrincipalId,
              id: orderId,
              orderNumber: `ORDER-${orderId.toUpperCase()}`,
              patientId: quote.patientId,
              pharmacyOrganizationId: quote.pharmacyOrganizationId,
              prescriptionId: quote.prescriptionId,
              prescriptionRouteId: quote.prescriptionRouteId,
              quoteId: quote.id,
              updatedAt: now,
            },
          });
          await transaction.payment.create({
            data: {
              amountMinor: quote.totalMinor,
              currency: quote.currency,
              id: paymentId,
              patientId: quote.patientId,
              payableUntil: quote.expiresAt,
              pharmacyOrderId: orderId,
              providerCode: "UNASSIGNED",
              purpose: "PHARMACY_ORDER",
              reference: `payment_${paymentId}`,
              updatedAt: now,
            },
          });
          await transaction.paymentStatusHistory.create({
            data: {
              id: createOpaqueId(),
              occurredAt: now,
              paymentId,
              reasonCode: "PHARMACY_QUOTE_ACCEPTED",
              toStatus: "CREATED",
            },
          });
          await transaction.idempotencyKey.update({
            data: {
              resourceId: orderId,
              resourceType: "pharmacy_order",
              responseStatusCode: 201,
              status: "COMPLETED",
              updatedAt: now,
            },
            where: { id: idempotencyId },
          });
          return mapOrder(
            await transaction.pharmacyOrder.findUniqueOrThrow({
              include: orderInclude,
              where: { id: orderId },
            }),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof PharmacyCommercialConflictError) throw error;
      if (isSerializationOrConstraintConflict(error)) return null;
      throw error;
    }
  }

  async findQuote(quoteId: string) {
    const quote = await this.database.pharmacyQuote.findUnique({
      include: quoteInclude,
      where: { id: quoteId },
    });
    return quote === null
      ? null
      : { ...mapQuote(quote), patientPrincipalId: quote.patient.principalId };
  }

  async findQuoteByIdempotency(input: { idempotencyKey: string; principalId: string }) {
    const record = await this.database.idempotencyKey.findUnique({
      select: { requestHash: true, resourceId: true, status: true },
      where: {
        principalId_operation_key: {
          key: input.idempotencyKey,
          operation: CREATE_QUOTE_OPERATION,
          principalId: input.principalId,
        },
      },
    });
    if (record?.status !== "COMPLETED" || record.resourceId === null) return null;
    const quote = await this.database.pharmacyQuote.findUnique({
      include: quoteInclude,
      where: { id: record.resourceId },
    });
    if (quote === null) {
      throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
    }
    return { quote: mapQuote(quote), requestHash: record.requestHash };
  }

  async findOrder(orderId: string) {
    const order = await this.database.pharmacyOrder.findUnique({
      include: orderInclude,
      where: { id: orderId },
    });
    return order === null
      ? null
      : { ...mapOrder(order), patientPrincipalId: order.patient.principalId };
  }
}

function mapQuote(row: QuoteRecord): PharmacyQuoteResponse {
  if (row.inventoryReservation === null) {
    throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
  }
  return {
    charges: row.charges.map((charge) => ({
      amountMinor: charge.amountMinor.toString(),
      code: charge.code,
      id: charge.id,
      label: charge.label,
      type: charge.type,
    })),
    createdAt: row.createdAt.toISOString(),
    currency: row.currency,
    expiresAt: row.expiresAt.toISOString(),
    feeMinor: row.feeMinor.toString(),
    fillNumber: row.fillNumber,
    id: row.id,
    inventoryReservation: {
      expiresAt: row.inventoryReservation.expiresAt.toISOString(),
      status: row.inventoryReservation.status,
    },
    lines: row.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      lineSubtotalMinor: line.lineSubtotalMinor.toString(),
      medicationCode: line.medicationCode,
      medicationCodeSystem: line.medicationCodeSystem,
      medicationName: line.medicationName,
      prescriptionItemId: line.prescriptionItemId,
      quantity: line.quantity.toFixed(3),
      quantityUnit: line.quantityUnit,
      strength: line.strength,
      substitutionProposalId: line.substitutionProposalId,
      unitPriceMinor: line.unitPriceMinor.toString(),
    })),
    orderId: row.order?.id ?? null,
    patientId: row.patientId,
    pharmacyOrganizationId: row.pharmacyOrganizationId,
    prescriptionId: row.prescriptionId,
    prescriptionRouteId: row.prescriptionRouteId,
    quoteNumber: row.quoteNumber,
    status: row.status,
    subtotalMinor: row.subtotalMinor.toString(),
    taxMinor: row.taxMinor.toString(),
    totalMinor: row.totalMinor.toString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function mapOrder(row: OrderRecord): PharmacyOrderResponse {
  if (row.payment === null) {
    throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
  }
  return {
    acceptedAt: row.acceptedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    orderNumber: row.orderNumber,
    patientId: row.patientId,
    paymentId: row.payment.id,
    pharmacyOrganizationId: row.pharmacyOrganizationId,
    prescriptionId: row.prescriptionId,
    prescriptionRouteId: row.prescriptionRouteId,
    quote: mapQuote(row.quote),
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function sumCharges(
  charges: Parameters<PharmacyCommercialRepository["createQuote"]>[0]["charges"],
  type: "TAX" | "FEE",
): bigint {
  return charges
    .filter((charge) => charge.type === type)
    .reduce((total, charge) => total + charge.amountMinor, 0n);
}

function isSerializationOrConstraintConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}
