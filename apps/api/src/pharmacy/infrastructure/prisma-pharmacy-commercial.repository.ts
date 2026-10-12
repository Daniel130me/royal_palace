import { Inject, Injectable } from "@nestjs/common";
import {
  NOTIFICATION_TEMPLATE,
  type PharmacyOrderResponse,
  type PharmacyQuoteResponse,
} from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import { enqueueOrganizationInboxNotification } from "../../notification/infrastructure/enqueue-notification.js";
import {
  PharmacyCommercialConflictError,
  type PharmacyCommercialRepository,
} from "../domain/pharmacy-commercial.types.js";
import {
  consumeDirectPlatformInventory,
  releasePlatformInventory,
  reservePlatformInventory,
} from "./platform-inventory-transactions.js";

const CREATE_QUOTE_OPERATION = "CREATE_PHARMACY_QUOTE";
const ACCEPT_QUOTE_OPERATION = "ACCEPT_PHARMACY_QUOTE";
const CANCEL_ORDER_OPERATION = "CANCEL_PHARMACY_ORDER";
const PREPARE_HANDOFF_OPERATION = "PREPARE_PHARMACY_HANDOFF";
const COMPLETE_HANDOFF_OPERATION = "COMPLETE_PHARMACY_HANDOFF";
const REQUEST_DISPUTE_OPERATION = "REQUEST_PHARMACY_ORDER_DISPUTE";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const quoteInclude = {
  charges: { orderBy: [{ type: "asc" }, { code: "asc" }] },
  inventoryReservation: true,
  lines: { orderBy: { lineNumber: "asc" } },
  order: { select: { id: true } },
  patient: { select: { principalId: true } },
} satisfies Prisma.PharmacyQuoteInclude;

const orderInclude = {
  handoff: true,
  payment: {
    select: {
      amountMinor: true,
      currency: true,
      id: true,
      refundedAmountMinor: true,
      status: true,
    },
  },
  patient: { select: { principalId: true } },
  quote: { include: quoteInclude },
  resolutions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
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
      kind: "PRESCRIPTION" as const,
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

  async findDirectPreparation(input: {
    catalogItemIds: readonly string[];
    patientPrincipalId: string;
    pharmacyOrganizationId: string;
  }) {
    const [patient, organization, items] = await Promise.all([
      this.database.patient.findUnique({
        select: { id: true, principalId: true },
        where: { principalId: input.patientPrincipalId },
      }),
      this.database.organization.findFirst({
        select: { id: true },
        where: {
          id: input.pharmacyOrganizationId,
          status: "ACTIVE",
          type: "PHARMACY",
          verificationStatus: "VERIFIED",
        },
      }),
      this.database.pharmacyCatalogItem.findMany({
        include: { dosageForm: { select: { name: true } } },
        where: {
          id: { in: [...input.catalogItemIds] },
          pharmacyOrganizationId: input.pharmacyOrganizationId,
          status: "ACTIVE",
        },
      }),
    ]);
    if (patient === null || organization === null || items.length !== input.catalogItemIds.length) {
      return null;
    }
    return {
      items: items.map((item) => ({
        availableQuantity: item.onHandQuantity.sub(item.reservedQuantity).toFixed(3),
        brandName: item.brandName,
        catalogItemId: item.id,
        controlledMedication: item.controlledMedication,
        currency: item.currency,
        dosageFormName: item.dosageForm.name,
        genericName: item.genericName,
        medicationCode: item.medicationCode,
        medicationCodeSystem: item.medicationCodeSystem,
        medicationName: item.name,
        prescriptionRequired: item.prescriptionRequired,
        strength: item.strength,
        unitPriceMinor: item.unitPriceMinor,
        version: item.version,
      })),
      kind: "DIRECT_OTC" as const,
      patientId: patient.id,
      patientPrincipalId: patient.principalId,
    };
  }

  async findScannedPreparation(
    input: Parameters<PharmacyCommercialRepository["findScannedPreparation"]>[0],
  ) {
    const scanned = await this.database.scannedPrescription.findFirst({
      include: {
        patient: { select: { id: true, principalId: true } },
      },
      where: {
        id: input.scannedPrescriptionId,
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        status: "APPROVED",
      },
    });
    if (scanned === null) return null;
    const items = await this.database.pharmacyCatalogItem.findMany({
      include: { dosageForm: { select: { name: true } } },
      where: {
        id: { in: [...input.catalogItemIds] },
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        status: "ACTIVE",
      },
    });
    if (items.length !== input.catalogItemIds.length) return null;
    return {
      items: items.map((item) => ({
        availableQuantity: item.onHandQuantity.sub(item.reservedQuantity).toFixed(3),
        brandName: item.brandName,
        catalogItemId: item.id,
        controlledMedication: item.controlledMedication,
        currency: item.currency,
        dosageFormName: item.dosageForm.name,
        genericName: item.genericName,
        medicationCode: item.medicationCode,
        medicationCodeSystem: item.medicationCodeSystem,
        medicationName: item.name,
        prescriptionRequired: item.prescriptionRequired,
        strength: item.strength,
        unitPriceMinor: item.unitPriceMinor,
        version: item.version,
      })),
      kind: "SCANNED_PRESCRIPTION" as const,
      patientId: scanned.patient.id,
      patientPrincipalId: scanned.patient.principalId,
      scannedPrescriptionId: scanned.id,
      scannedPrescriptionVersion: scanned.version,
    };
  }

  async listPatientCatalogItems(input: {
    cursor?: { id: string; sortValue: string };
    limit: number;
    pharmacyOrganizationId: string;
    query?: string;
  }) {
    const organization = await this.database.organization.findFirst({
      select: { id: true },
      where: {
        id: input.pharmacyOrganizationId,
        status: "ACTIVE",
        type: "PHARMACY",
        verificationStatus: "VERIFIED",
      },
    });
    if (organization === null)
      return { data: [], pageInfo: { endCursor: null, hasNextPage: false } };
    const rows = await this.database.pharmacyCatalogItem.findMany({
      include: { category: true, dosageForm: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      where: {
        AND: [
          ...(input.query === undefined
            ? []
            : [
                {
                  OR: [
                    { name: { contains: input.query, mode: "insensitive" as const } },
                    { genericName: { contains: input.query, mode: "insensitive" as const } },
                    { brandName: { contains: input.query, mode: "insensitive" as const } },
                  ],
                },
              ]),
          ...(input.cursor === undefined
            ? []
            : [
                {
                  OR: [
                    { name: { gt: input.cursor.sortValue } },
                    { id: { gt: input.cursor.id }, name: input.cursor.sortValue },
                  ],
                },
              ]),
        ],
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        status: "ACTIVE",
      },
    });
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      data: visible.map((item) => {
        const available = item.onHandQuantity.sub(item.reservedQuantity).greaterThan(0);
        return {
          available,
          brandName: item.brandName,
          category: mapClassification(item.category),
          controlledMedication: item.controlledMedication,
          currency: item.currency,
          directOrderEligible:
            available && !item.prescriptionRequired && !item.controlledMedication,
          dosageForm: mapClassification(item.dosageForm),
          genericName: item.genericName,
          id: item.id,
          manufacturer: item.manufacturer,
          name: item.name,
          pharmacyOrganizationId: item.pharmacyOrganizationId,
          prescriptionRequired: item.prescriptionRequired,
          strength: item.strength,
          unitPriceMinor: item.unitPriceMinor.toString(),
          version: item.version,
        };
      }),
      pageInfo: {
        endCursor:
          last === undefined
            ? null
            : Buffer.from(JSON.stringify({ id: last.id, sortValue: last.name }), "utf8").toString(
                "base64url",
              ),
        hasNextPage: rows.length > input.limit,
      },
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
          const route =
            input.preparation.kind === "PRESCRIPTION"
              ? await transaction.prescriptionRoute.findFirst({
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
                })
              : null;
          const scannedPrescription =
            input.preparation.kind === "SCANNED_PRESCRIPTION"
              ? await transaction.scannedPrescription.findFirst({
                  select: { version: true },
                  where: {
                    id: input.preparation.scannedPrescriptionId,
                    pharmacyOrganizationId: input.pharmacyOrganizationId,
                    status: "APPROVED",
                  },
                })
              : null;
          if (
            input.preparation.kind === "PRESCRIPTION" &&
            (route === null ||
              route.version !== input.preparation.routeVersion ||
              route.prescription.version !== input.preparation.prescriptionVersion)
          ) {
            throw new PharmacyCommercialConflictError("VERSION_CONFLICT");
          }
          if (
            input.preparation.kind === "PRESCRIPTION" &&
            (route === null ||
              !["ACCEPTED", "PARTIALLY_DISPENSED"].includes(route.prescription.status) ||
              route.prescription.validUntil === null ||
              route.prescription.validUntil <= now ||
              input.expiresAt > route.prescription.validUntil)
          ) {
            throw new PharmacyCommercialConflictError("INVALID_PRESCRIPTION_STATE");
          }

          if (
            input.preparation.kind === "SCANNED_PRESCRIPTION" &&
            (scannedPrescription === null ||
              scannedPrescription.version !== input.preparation.scannedPrescriptionVersion)
          ) {
            throw new PharmacyCommercialConflictError("VERSION_CONFLICT");
          }

          if (input.preparation.kind !== "PRESCRIPTION") {
            const currentItems = await transaction.pharmacyCatalogItem.findMany({
              select: {
                controlledMedication: true,
                currency: true,
                id: true,
                prescriptionRequired: true,
                status: true,
                unitPriceMinor: true,
                version: true,
              },
              where: {
                id: { in: input.preparation.items.map((item) => item.catalogItemId) },
                pharmacyOrganizationId: input.pharmacyOrganizationId,
              },
            });
            const expected = new Map(
              input.preparation.items.map((item) => [item.catalogItemId, item]),
            );
            if (
              currentItems.length !== expected.size ||
              currentItems.some((item) => {
                const snapshot = expected.get(item.id);
                return (
                  snapshot === undefined ||
                  item.status !== "ACTIVE" ||
                  (input.preparation.kind === "DIRECT_OTC" && item.prescriptionRequired) ||
                  item.controlledMedication ||
                  item.version !== snapshot.version ||
                  item.currency !== snapshot.currency ||
                  item.unitPriceMinor !== snapshot.unitPriceMinor
                );
              })
            ) {
              throw new PharmacyCommercialConflictError("VERSION_CONFLICT");
            }
          }

          const expiredQuotes =
            input.preparation.kind === "PRESCRIPTION"
              ? await transaction.pharmacyQuote.findMany({
                  select: { id: true, inventoryReservation: { select: { id: true } } },
                  where: {
                    expiresAt: { lte: now },
                    fillNumber: input.fillNumber,
                    prescriptionRouteId: input.preparation.routeId,
                    status: "ACTIVE",
                  },
                })
              : input.preparation.kind === "SCANNED_PRESCRIPTION"
                ? await transaction.pharmacyQuote.findMany({
                    select: { id: true, inventoryReservation: { select: { id: true } } },
                    where: {
                      expiresAt: { lte: now },
                      scannedPrescriptionId: input.preparation.scannedPrescriptionId,
                      status: "ACTIVE",
                    },
                  })
                : [];
          if (expiredQuotes.length > 0) {
            const expiredIds = expiredQuotes.map((quote) => quote.id);
            for (const quote of expiredQuotes) {
              if (quote.inventoryReservation !== null) {
                await releasePlatformInventory(transaction, {
                  actorPrincipalId: input.principalId,
                  reasonCode: "QUOTE_EXPIRED",
                  reservationId: quote.inventoryReservation.id,
                });
              }
            }
            await transaction.pharmacyQuote.updateMany({
              data: { status: "EXPIRED", updatedAt: now, version: { increment: 1 } },
              where: { id: { in: expiredIds }, status: "ACTIVE" },
            });
            await transaction.inventoryReservation.updateMany({
              data: { status: "EXPIRED", updatedAt: now, version: { increment: 1 } },
              where: { quoteId: { in: expiredIds }, status: "HELD" },
            });
          }
          const activeQuote =
            input.preparation.kind === "PRESCRIPTION"
              ? await transaction.pharmacyQuote.findFirst({
                  select: { id: true },
                  where: {
                    fillNumber: input.fillNumber,
                    prescriptionRouteId: input.preparation.routeId,
                    status: { in: ["ACTIVE", "ACCEPTED"] },
                  },
                })
              : input.preparation.kind === "SCANNED_PRESCRIPTION"
                ? await transaction.pharmacyQuote.findFirst({
                    select: { id: true },
                    where: {
                      scannedPrescriptionId: input.preparation.scannedPrescriptionId,
                      status: { in: ["ACTIVE", "ACCEPTED"] },
                    },
                  })
                : null;
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
          const reservationId = createOpaqueId();
          const quoteLines = input.lines.map((line) => ({
            ...line,
            quoteLineId: createOpaqueId(),
          }));
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
              kind: input.preparation.kind,
              inventoryReservation: {
                create: {
                  evidenceHash: input.inventoryReservation.evidenceHash,
                  expiresAt: input.inventoryReservation.expiresAt,
                  id: reservationId,
                  providerCode: input.inventoryReservation.providerCode,
                  providerReservationReference:
                    input.inventoryReservation.providerReservationReference,
                  updatedAt: now,
                },
              },
              lines: {
                create: quoteLines.map((line) => ({
                  catalogItemId: line.catalogItemId,
                  id: line.quoteLineId,
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
              prescriptionId:
                input.preparation.kind === "PRESCRIPTION" ? input.preparation.prescriptionId : null,
              prescriptionRouteId:
                input.preparation.kind === "PRESCRIPTION" ? input.preparation.routeId : null,
              scannedPrescriptionId:
                input.preparation.kind === "SCANNED_PRESCRIPTION"
                  ? input.preparation.scannedPrescriptionId
                  : null,
              quoteNumber: `QUOTE-${quoteId.toUpperCase()}`,
              subtotalMinor,
              taxMinor,
              totalMinor: subtotalMinor + taxMinor + feeMinor,
              updatedAt: now,
            },
          });
          await reservePlatformInventory(transaction, {
            actorPrincipalId: input.principalId,
            currency: input.currency,
            lines: quoteLines,
            pharmacyOrganizationId: input.pharmacyOrganizationId,
            providerCode: input.inventoryReservation.providerCode,
            reservationId,
            reservationReference: input.inventoryReservation.providerReservationReference,
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

  async expireDueQuotes(input: Parameters<PharmacyCommercialRepository["expireDueQuotes"]>[0]) {
    const dueQuotes = await this.database.pharmacyQuote.findMany({
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take: input.limit,
      where: { expiresAt: { lte: input.now }, status: "ACTIVE" },
    });
    let expired = 0;
    for (const dueQuote of dueQuotes) {
      try {
        const changed = await this.database.$transaction(
          async (transaction) => {
            // Claim the quote with a conditional transition. Concurrent workers
            // can discover the same bounded batch, but only one may release it.
            const claimed = await transaction.pharmacyQuote.updateMany({
              data: { status: "EXPIRED", updatedAt: input.now, version: { increment: 1 } },
              where: { id: dueQuote.id, expiresAt: { lte: input.now }, status: "ACTIVE" },
            });
            if (claimed.count === 0) return false;

            const reservation = await transaction.inventoryReservation.findUnique({
              select: { id: true },
              where: { quoteId: dueQuote.id },
            });
            if (reservation === null) {
              throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
            }
            const transitioned = await transaction.inventoryReservation.updateMany({
              data: { status: "EXPIRED", updatedAt: input.now, version: { increment: 1 } },
              where: { id: reservation.id, status: "HELD" },
            });
            if (transitioned.count !== 1) {
              throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
            }
            await releasePlatformInventory(transaction, {
              actorPrincipalId: input.actorPrincipalId,
              reasonCode: "QUOTE_EXPIRED",
              reservationId: reservation.id,
            });
            return true;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        if (changed) expired += 1;
      } catch (error) {
        // A concurrent worker winner is safe to skip; every other failure is a
        // real invariant/operational fault and must remain visible to operators.
        if (isSerializationConflict(error)) continue;
        throw error;
      }
    }
    return { expired };
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
          const orderNumber = `ORDER-${orderId.toUpperCase()}`;
          await transaction.pharmacyOrder.create({
            data: {
              acceptedAt: now,
              acceptedByPrincipalId: input.patientPrincipalId,
              id: orderId,
              orderNumber,
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
          await enqueueOrganizationInboxNotification(transaction, {
            deduplicationKey: `pharmacy-order:${orderId}:accepted`,
            organizationId: quote.pharmacyOrganizationId,
            reference: orderNumber,
            resourceId: orderId,
            resourceType: "PHARMACY_ORDER",
            templateKey: NOTIFICATION_TEMPLATE.PHARMACY_ORDER_ACTION_REQUIRED,
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

  async cancelOrder(input: Parameters<PharmacyCommercialRepository["cancelOrder"]>[0]) {
    return this.runOrderMutation(input, CANCEL_ORDER_OPERATION, async (transaction, order, now) => {
      if (order.patient.principalId !== input.patientPrincipalId) {
        throw new PharmacyCommercialConflictError("ORDER_NOT_ACTIONABLE");
      }
      if (order.version !== input.expectedVersion) return false;
      if (await hasDispenseEvidence(transaction, order)) {
        throw new PharmacyCommercialConflictError("ADMIN_DISPUTE_REQUIRED");
      }
      const payment = order.payment;
      if (payment === null) throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
      const remainingAmount = payment.amountMinor - payment.refundedAmountMinor;
      if (remainingAmount <= 0n) {
        throw new PharmacyCommercialConflictError("ORDER_NOT_ACTIONABLE");
      }

      if (order.status === "PENDING_PAYMENT") {
        if (!["CREATED", "PENDING", "FAILED"].includes(payment.status)) {
          throw new PharmacyCommercialConflictError("ORDER_NOT_ACTIONABLE");
        }
        await transaction.payment.update({
          data: {
            status: "CANCELLED",
            terminalAt: now,
            updatedAt: now,
            version: { increment: 1 },
          },
          where: { id: payment.id },
        });
        await transaction.paymentStatusHistory.create({
          data: {
            fromStatus: payment.status,
            id: createOpaqueId(),
            occurredAt: now,
            paymentId: payment.id,
            reasonCode: "PATIENT_CANCELLED_PHARMACY_ORDER",
            toStatus: "CANCELLED",
          },
        });
        const updated = await transaction.pharmacyOrder.updateMany({
          data: {
            cancelledAt: now,
            status: "CANCELLED",
            updatedAt: now,
            version: { increment: 1 },
          },
          where: { id: order.id, status: "PENDING_PAYMENT", version: input.expectedVersion },
        });
        if (updated.count !== 1) return false;
        const reservation = await transaction.inventoryReservation.findUnique({
          select: { id: true },
          where: { quoteId: order.quoteId },
        });
        if (reservation !== null) {
          await releasePlatformInventory(transaction, {
            actorPrincipalId: input.patientPrincipalId,
            reasonCode: "ORDER_CANCELLED_BEFORE_PAYMENT",
            reservationId: reservation.id,
          });
        }
        await transaction.inventoryReservation.updateMany({
          data: { status: "RELEASED", updatedAt: now, version: { increment: 1 } },
          where: { quoteId: order.quoteId, status: "HELD" },
        });
        await transaction.paymentCheckoutSession.updateMany({
          data: { status: "ABANDONED" },
          where: { paymentId: payment.id, status: "ACTIVE" },
        });
        await transaction.pharmacyOrderResolution.create({
          data: {
            amountMinor: remainingAmount,
            completedAt: now,
            currency: payment.currency,
            id: createOpaqueId(),
            orderId: order.id,
            reasonCode: input.reasonCode,
            requestedByPrincipalId: input.patientPrincipalId,
            status: "COMPLETED",
            type: "CANCELLATION",
            updatedAt: now,
          },
        });
        return true;
      }

      if (!["CONFIRMED", "PARTIALLY_REFUNDED"].includes(order.status)) {
        throw new PharmacyCommercialConflictError("ORDER_NOT_ACTIONABLE");
      }
      const resolutionId = createOpaqueId();
      await transaction.pharmacyOrderResolution.create({
        data: {
          amountMinor: remainingAmount,
          currency: payment.currency,
          id: resolutionId,
          orderId: order.id,
          reasonCode: input.reasonCode,
          requestedByPrincipalId: input.patientPrincipalId,
          type: "REFUND",
          updatedAt: now,
        },
      });
      const updated = await transaction.pharmacyOrder.updateMany({
        data: { status: "REFUND_PENDING", updatedAt: now, version: { increment: 1 } },
        where: {
          id: order.id,
          status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] },
          version: input.expectedVersion,
        },
      });
      if (updated.count !== 1) return false;
      await cancelReadyHandoff(transaction, order.id, now);
      await createResolutionOutboxEvent(transaction, {
        amountMinor: remainingAmount,
        currency: payment.currency,
        eventType: "payment.refund.requested.v1",
        orderId: order.id,
        paymentId: payment.id,
        resolutionId,
      });
      return true;
    });
  }

  async prepareHandoff(input: Parameters<PharmacyCommercialRepository["prepareHandoff"]>[0]) {
    return this.runOrderMutation(
      input,
      PREPARE_HANDOFF_OPERATION,
      async (transaction, order, now) => {
        if (order.status !== "CONFIRMED" || order.version !== input.expectedOrderVersion)
          return false;
        if (order.handoff !== null) {
          throw new PharmacyCommercialConflictError("ORDER_NOT_ACTIONABLE");
        }
        const handoffId = createOpaqueId();
        await transaction.pharmacyOrderHandoff.create({
          data: {
            handoffReference: `HANDOFF-${handoffId.toUpperCase()}`,
            id: handoffId,
            method: input.method,
            orderId: order.id,
            preparedAt: now,
            preparedByPrincipalId: input.principalId,
            updatedAt: now,
          },
        });
        return true;
      },
    );
  }

  async completeHandoff(input: Parameters<PharmacyCommercialRepository["completeHandoff"]>[0]) {
    return this.runOrderMutation(
      input,
      COMPLETE_HANDOFF_OPERATION,
      async (transaction, order, now) => {
        if (order.status !== "CONFIRMED" || order.handoff?.status !== "READY") return false;
        if (order.handoff.version !== input.expectedHandoffVersion) return false;
        if (order.quote.kind !== "PRESCRIPTION") {
          await consumeDirectPlatformInventory(transaction, {
            actorPrincipalId: input.principalId,
            orderId: order.id,
          });
        } else if (!(await hasCompleteDispenseEvidence(transaction, order))) {
          throw new PharmacyCommercialConflictError("DISPENSE_EVIDENCE_REQUIRED");
        }
        const updated = await transaction.pharmacyOrderHandoff.updateMany({
          data: {
            handedOffAt: now,
            handedOffByPrincipalId: input.principalId,
            status: "HANDED_OFF",
            updatedAt: now,
            version: { increment: 1 },
          },
          where: { id: order.handoff.id, status: "READY", version: input.expectedHandoffVersion },
        });
        return updated.count === 1;
      },
    );
  }

  async requestDispute(input: Parameters<PharmacyCommercialRepository["requestDispute"]>[0]) {
    return this.runOrderMutation(
      input,
      REQUEST_DISPUTE_OPERATION,
      async (transaction, order, now) => {
        if (order.version !== input.expectedVersion) return false;
        const hasFulfillmentEvidence =
          order.quote.kind !== "PRESCRIPTION"
            ? order.handoff?.status === "HANDED_OFF"
            : await hasDispenseEvidence(transaction, order);
        if (!hasFulfillmentEvidence) {
          throw new PharmacyCommercialConflictError("ORDER_NOT_ACTIONABLE");
        }
        if (!["CONFIRMED", "PARTIALLY_REFUNDED", "REFUND_PENDING"].includes(order.status)) {
          throw new PharmacyCommercialConflictError("ORDER_NOT_ACTIONABLE");
        }
        const payment = order.payment;
        if (payment === null) throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
        const remainingAmount = payment.amountMinor - payment.refundedAmountMinor;
        if (remainingAmount <= 0n) {
          throw new PharmacyCommercialConflictError("ORDER_NOT_ACTIONABLE");
        }
        await transaction.pharmacyOrderResolution.updateMany({
          data: { rejectedAt: now, status: "REJECTED", updatedAt: now, version: { increment: 1 } },
          where: { orderId: order.id, status: "PENDING", type: "REFUND" },
        });
        const resolutionId = createOpaqueId();
        await transaction.pharmacyOrderResolution.create({
          data: {
            amountMinor: remainingAmount,
            currency: payment.currency,
            id: resolutionId,
            orderId: order.id,
            reasonCode: input.reasonCode,
            requestedByPrincipalId: input.principalId,
            type: "DISPUTE",
            updatedAt: now,
          },
        });
        const updated = await transaction.pharmacyOrder.updateMany({
          data: { status: "DISPUTE_PENDING", updatedAt: now, version: { increment: 1 } },
          where: {
            id: order.id,
            status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUND_PENDING"] },
            version: input.expectedVersion,
          },
        });
        if (updated.count !== 1) return false;
        await cancelReadyHandoff(transaction, order.id, now);
        await createResolutionOutboxEvent(transaction, {
          amountMinor: remainingAmount,
          currency: payment.currency,
          eventType: "payment.dispute.requested.v1",
          orderId: order.id,
          paymentId: payment.id,
          resolutionId,
        });
        return true;
      },
    );
  }

  private async runOrderMutation(
    input: {
      idempotencyKey: string;
      orderId: string;
      requestHash: string;
      principalId?: string;
      patientPrincipalId?: string;
    },
    operation: string,
    mutate: (
      transaction: Prisma.TransactionClient,
      order: OrderRecord,
      now: Date,
    ) => Promise<boolean>,
  ): Promise<PharmacyOrderResponse | null> {
    const principalId = input.principalId ?? input.patientPrincipalId;
    if (principalId === undefined) {
      throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
    }
    try {
      return await this.database.$transaction(
        async (transaction) => {
          const replay = await findOrderIdempotencyReplay(transaction, {
            key: input.idempotencyKey,
            operation,
            principalId,
            requestHash: input.requestHash,
          });
          if (replay !== null) return replay;
          const order = await transaction.pharmacyOrder.findUnique({
            include: orderInclude,
            where: { id: input.orderId },
          });
          if (order === null) return null;
          const now = new Date();
          const idempotencyId = await startOrderIdempotency(transaction, {
            key: input.idempotencyKey,
            operation,
            principalId,
            requestHash: input.requestHash,
          });
          if (!(await mutate(transaction, order, now))) {
            throw new PharmacyCommercialConflictError("VERSION_CONFLICT");
          }
          await completeOrderIdempotency(transaction, idempotencyId, order.id, now);
          return mapOrder(
            await transaction.pharmacyOrder.findUniqueOrThrow({
              include: orderInclude,
              where: { id: order.id },
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

  async listOrders(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    patientPrincipalId?: string;
    pharmacyOrganizationId?: string;
  }) {
    const rows = await this.database.pharmacyOrder.findMany({
      include: orderInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      relationLoadStrategy: "join",
      take: input.limit + 1,
      where: {
        ...(input.patientPrincipalId === undefined
          ? {}
          : { patient: { principalId: input.patientPrincipalId } }),
        ...(input.pharmacyOrganizationId === undefined
          ? {}
          : { pharmacyOrganizationId: input.pharmacyOrganizationId }),
        ...createdBefore(input.cursor),
      },
    });
    const hasNextPage = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    return {
      data: visible.map(mapOrder),
      pageInfo: { endCursor: createdCursor(visible.at(-1)), hasNextPage },
    };
  }

  async listQuotes(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    patientPrincipalId?: string;
    pharmacyOrganizationId?: string;
  }) {
    const rows = await this.database.pharmacyQuote.findMany({
      include: quoteInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      relationLoadStrategy: "join",
      take: input.limit + 1,
      where: {
        ...(input.patientPrincipalId === undefined
          ? {}
          : { patient: { principalId: input.patientPrincipalId } }),
        ...(input.pharmacyOrganizationId === undefined
          ? {}
          : { pharmacyOrganizationId: input.pharmacyOrganizationId }),
        ...createdBefore(input.cursor),
      },
    });
    const hasNextPage = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    return {
      data: visible.map(mapQuote),
      pageInfo: { endCursor: createdCursor(visible.at(-1)), hasNextPage },
    };
  }
}

function createdBefore(cursor: { createdAt: Date; id: string } | undefined) {
  return cursor === undefined
    ? {}
    : {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
}

function createdCursor(row: { createdAt: Date; id: string } | undefined): string | null {
  return row === undefined
    ? null
    : Buffer.from(
        JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
        "utf8",
      ).toString("base64url");
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
    kind: row.kind,
    inventoryReservation: {
      expiresAt: row.inventoryReservation.expiresAt.toISOString(),
      status: row.inventoryReservation.status,
    },
    lines: row.lines.map((line) => ({
      catalogItemId: line.catalogItemId,
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
    scannedPrescriptionId: row.scannedPrescriptionId,
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
    handoff:
      row.handoff === null
        ? null
        : {
            handedOffAt: row.handoff.handedOffAt?.toISOString() ?? null,
            handoffReference: row.handoff.handoffReference,
            id: row.handoff.id,
            method: row.handoff.method,
            preparedAt: row.handoff.preparedAt.toISOString(),
            status: row.handoff.status,
            version: row.handoff.version,
          },
    id: row.id,
    latestResolution:
      row.resolutions[0] === undefined
        ? null
        : {
            amountMinor: row.resolutions[0].amountMinor.toString(),
            completedAt: row.resolutions[0].completedAt?.toISOString() ?? null,
            createdAt: row.resolutions[0].createdAt.toISOString(),
            currency: row.resolutions[0].currency,
            id: row.resolutions[0].id,
            reasonCode: row.resolutions[0].reasonCode,
            rejectedAt: row.resolutions[0].rejectedAt?.toISOString() ?? null,
            status: row.resolutions[0].status,
            type: row.resolutions[0].type,
            version: row.resolutions[0].version,
          },
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

async function hasDispenseEvidence(
  transaction: Prisma.TransactionClient,
  order: OrderRecord,
): Promise<boolean> {
  if (order.prescriptionRouteId === null || order.quote.fillNumber === null) return false;
  const prescriptionItemIds = order.quote.lines.flatMap((line) =>
    line.prescriptionItemId === null ? [] : [line.prescriptionItemId],
  );
  if (prescriptionItemIds.length === 0) return false;
  return (
    (await transaction.prescriptionDispenseLine.count({
      where: {
        dispenseEvent: { routeId: order.prescriptionRouteId },
        fillNumber: order.quote.fillNumber,
        prescriptionItemId: { in: prescriptionItemIds },
      },
    })) > 0
  );
}

async function hasCompleteDispenseEvidence(
  transaction: Prisma.TransactionClient,
  order: OrderRecord,
): Promise<boolean> {
  if (order.prescriptionRouteId === null || order.quote.fillNumber === null) return false;
  const prescriptionLines = order.quote.lines.filter(
    (line): line is typeof line & { prescriptionItemId: string } =>
      line.prescriptionItemId !== null,
  );
  if (prescriptionLines.length !== order.quote.lines.length) return false;
  const totals = await transaction.prescriptionDispenseLine.groupBy({
    _sum: { quantity: true },
    by: ["prescriptionItemId"],
    where: {
      dispenseEvent: { routeId: order.prescriptionRouteId },
      fillNumber: order.quote.fillNumber,
      prescriptionItemId: { in: prescriptionLines.map((line) => line.prescriptionItemId) },
    },
  });
  const byItem = new Map(
    totals.map((total) => [
      total.prescriptionItemId,
      total._sum?.quantity ?? new Prisma.Decimal(0),
    ]),
  );
  return prescriptionLines.every((line) =>
    (byItem.get(line.prescriptionItemId) ?? new Prisma.Decimal(0)).gte(line.quantity),
  );
}

function mapClassification(row: {
  code: string;
  id: string;
  kind: "CATEGORY" | "DOSAGE_FORM";
  name: string;
  status: "ACTIVE" | "INACTIVE";
  version: number;
}) {
  return {
    code: row.code,
    id: row.id,
    kind: row.kind,
    name: row.name,
    status: row.status,
    version: row.version,
  };
}

async function findOrderIdempotencyReplay(
  transaction: Prisma.TransactionClient,
  input: { key: string; operation: string; principalId: string; requestHash: string },
): Promise<PharmacyOrderResponse | null> {
  const existing = await transaction.idempotencyKey.findUnique({
    where: {
      principalId_operation_key: {
        key: input.key,
        operation: input.operation,
        principalId: input.principalId,
      },
    },
  });
  if (existing === null) return null;
  if (
    existing.requestHash !== input.requestHash ||
    existing.status !== "COMPLETED" ||
    existing.resourceId === null
  ) {
    throw new PharmacyCommercialConflictError("IDEMPOTENCY_CONFLICT");
  }
  const order = await transaction.pharmacyOrder.findUnique({
    include: orderInclude,
    where: { id: existing.resourceId },
  });
  if (order === null) throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
  return mapOrder(order);
}

async function startOrderIdempotency(
  transaction: Prisma.TransactionClient,
  input: { key: string; operation: string; principalId: string; requestHash: string },
): Promise<string> {
  const id = createOpaqueId();
  await transaction.idempotencyKey.create({
    data: {
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      id,
      key: input.key,
      operation: input.operation,
      principalId: input.principalId,
      requestHash: input.requestHash,
      updatedAt: new Date(),
    },
  });
  return id;
}

async function completeOrderIdempotency(
  transaction: Prisma.TransactionClient,
  idempotencyId: string,
  orderId: string,
  now: Date,
): Promise<void> {
  await transaction.idempotencyKey.update({
    data: {
      resourceId: orderId,
      resourceType: "pharmacy_order",
      responseStatusCode: 200,
      status: "COMPLETED",
      updatedAt: now,
    },
    where: { id: idempotencyId },
  });
}

async function cancelReadyHandoff(
  transaction: Prisma.TransactionClient,
  orderId: string,
  cancelledAt: Date,
): Promise<void> {
  await transaction.pharmacyOrderHandoff.updateMany({
    data: {
      cancelledAt,
      status: "CANCELLED",
      updatedAt: new Date(),
      version: { increment: 1 },
    },
    where: { orderId, status: "READY" },
  });
}

async function createResolutionOutboxEvent(
  transaction: Prisma.TransactionClient,
  input: {
    amountMinor: bigint;
    currency: string;
    eventType: "payment.refund.requested.v1" | "payment.dispute.requested.v1";
    orderId: string;
    paymentId: string;
    resolutionId: string;
  },
): Promise<void> {
  await transaction.outboxEvent.create({
    data: {
      aggregateId: input.paymentId,
      aggregateType: "payment",
      eventType: input.eventType,
      id: createOpaqueId(),
      payload: {
        amountMinor: input.amountMinor.toString(),
        currency: input.currency,
        orderId: input.orderId,
        paymentId: input.paymentId,
        resolutionId: input.resolutionId,
      },
    },
  });
}

function isSerializationOrConstraintConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2004" || error.code === "P2034")
  );
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
