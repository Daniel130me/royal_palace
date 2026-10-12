import { createHash } from "node:crypto";

import { Prisma } from "../../generated/prisma/client.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import {
  PLATFORM_INVENTORY_PROVIDER_CODE,
  PharmacyCommercialConflictError,
  type PharmacyQuoteResolvedLine,
} from "../domain/pharmacy-commercial.types.js";

type Transaction = Prisma.TransactionClient;

interface AllocationPlan {
  catalogItemId: string;
  lotId: string;
  quantity: Prisma.Decimal;
  quoteLineId: string;
}

interface FefoLot {
  catalogItemId: string;
  expiryDate: Date;
  id: string;
  onHandQuantity: Prisma.Decimal;
  reservedQuantity: Prisma.Decimal;
}

export async function reservePlatformInventory(
  transaction: Transaction,
  input: {
    actorPrincipalId: string;
    currency: string;
    lines: readonly (PharmacyQuoteResolvedLine & { quoteLineId: string })[];
    pharmacyOrganizationId: string;
    providerCode: string;
    reservationId: string;
    reservationReference: string;
  },
): Promise<void> {
  if (input.providerCode !== PLATFORM_INVENTORY_PROVIDER_CODE) return;
  if (input.lines.some((line) => line.catalogItemId === undefined)) {
    throw new PharmacyCommercialConflictError("INVENTORY_RESERVATION_INVALID");
  }

  const catalogItemIds = [...new Set(input.lines.map((line) => line.catalogItemId!))];
  const items = await transaction.pharmacyCatalogItem.findMany({
    where: {
      id: { in: catalogItemIds },
      pharmacyOrganizationId: input.pharmacyOrganizationId,
      status: "ACTIVE",
    },
  });
  if (items.length !== catalogItemIds.length) {
    throw new PharmacyCommercialConflictError("INVENTORY_RESERVATION_INVALID");
  }
  const itemById = new Map(items.map((item) => [item.id, item]));
  for (const line of input.lines) {
    const item = itemById.get(line.catalogItemId!);
    if (
      item === undefined ||
      item.currency !== input.currency ||
      item.unitPriceMinor !== line.unitPriceMinor ||
      !catalogMatchesMedication(item, line)
    ) {
      throw new PharmacyCommercialConflictError("INVENTORY_RESERVATION_INVALID");
    }
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const lots = await transaction.inventoryLot.findMany({
    orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
    where: {
      catalogItemId: { in: catalogItemIds },
      expiryDate: { gt: today },
      pharmacyOrganizationId: input.pharmacyOrganizationId,
      status: "AVAILABLE",
    },
  });
  const plans = buildFefoAllocationPlan(input.lines, lots);

  const quantityByLot = sumPlans(plans, (plan) => plan.lotId);
  const quantityByItem = sumPlans(plans, (plan) => plan.catalogItemId);
  for (const [lotId, quantity] of quantityByLot) {
    const lot = lots.find((candidate) => candidate.id === lotId)!;
    const reservedAfter = lot.reservedQuantity.add(quantity);
    const updated = await transaction.inventoryLot.updateMany({
      data: { reservedQuantity: reservedAfter, version: { increment: 1 } },
      where: { id: lot.id, status: "AVAILABLE", version: lot.version },
    });
    if (updated.count !== 1) throw new PharmacyCommercialConflictError("VERSION_CONFLICT");
    await transaction.inventoryMovement.create({
      data: {
        actorPrincipalId: input.actorPrincipalId,
        catalogItemId: lot.catalogItemId,
        id: createOpaqueId(),
        idempotencyKey: `reserve:${input.reservationId}:${lot.id}`,
        locationId: lot.locationId,
        lotId: lot.id,
        onHandAfter: lot.onHandQuantity,
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        quantity,
        reasonCode: "QUOTE_FEFO_RESERVATION",
        referenceId: input.reservationReference,
        referenceType: "RESERVATION",
        requestHash: movementHash("RESERVE", input.reservationId, lot.id, quantity),
        reservedAfter,
        type: "RESERVE",
      },
    });
  }
  for (const [catalogItemId, quantity] of quantityByItem) {
    const updated = await transaction.pharmacyCatalogItem.updateMany({
      data: { reservedQuantity: { increment: quantity } },
      where: { id: catalogItemId, pharmacyOrganizationId: input.pharmacyOrganizationId },
    });
    if (updated.count !== 1) throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
  }
  await transaction.inventoryReservationAllocation.createMany({
    data: plans.map((plan) => ({
      ...plan,
      id: createOpaqueId(),
      reservationId: input.reservationId,
    })),
  });
}

export function buildFefoAllocationPlan(
  lines: readonly {
    catalogItemId?: string;
    quantity: string;
    quoteLineId: string;
  }[],
  lots: readonly FefoLot[],
): AllocationPlan[] {
  const sortedLots = [...lots].sort(
    (left, right) =>
      left.expiryDate.getTime() - right.expiryDate.getTime() || left.id.localeCompare(right.id),
  );
  const remainingByLot = new Map(
    sortedLots.map((lot) => [lot.id, lot.onHandQuantity.sub(lot.reservedQuantity)]),
  );
  const plans: AllocationPlan[] = [];
  for (const line of lines) {
    if (line.catalogItemId === undefined) {
      throw new PharmacyCommercialConflictError("INVENTORY_RESERVATION_INVALID");
    }
    let remaining = new Prisma.Decimal(line.quantity);
    for (const lot of sortedLots.filter(
      (candidate) => candidate.catalogItemId === line.catalogItemId,
    )) {
      const available = remainingByLot.get(lot.id) ?? new Prisma.Decimal(0);
      if (available.lessThanOrEqualTo(0)) continue;
      const allocated = Prisma.Decimal.min(available, remaining);
      plans.push({
        catalogItemId: line.catalogItemId,
        lotId: lot.id,
        quantity: allocated,
        quoteLineId: line.quoteLineId,
      });
      remainingByLot.set(lot.id, available.sub(allocated));
      remaining = remaining.sub(allocated);
      if (remaining.equals(0)) break;
    }
    if (!remaining.equals(0)) {
      throw new PharmacyCommercialConflictError("INVENTORY_RESERVATION_INVALID");
    }
  }
  return plans;
}

export async function releasePlatformInventory(
  transaction: Transaction,
  input: { actorPrincipalId?: string; reservationId: string; reasonCode: string },
): Promise<void> {
  const reservation = await transaction.inventoryReservation.findUnique({
    include: {
      allocations: { include: { lot: true } },
      quote: { select: { createdByPrincipalId: true, pharmacyOrganizationId: true } },
    },
    where: { id: input.reservationId },
  });
  if (reservation === null || reservation.providerCode !== PLATFORM_INVENTORY_PROVIDER_CODE) return;

  const outstanding = reservation.allocations
    .map((allocation) => ({
      allocation,
      quantity: allocation.quantity
        .sub(allocation.releasedQuantity)
        .sub(allocation.consumedQuantity),
    }))
    .filter(({ quantity }) => quantity.greaterThan(0));
  if (outstanding.length === 0) return;

  const quantityByLot = sumPlans(
    outstanding.map(({ allocation, quantity }) => ({
      catalogItemId: allocation.catalogItemId,
      lotId: allocation.lotId,
      quantity,
      quoteLineId: allocation.quoteLineId,
    })),
    (plan) => plan.lotId,
  );
  const quantityByItem = sumPlans(
    outstanding.map(({ allocation, quantity }) => ({
      catalogItemId: allocation.catalogItemId,
      lotId: allocation.lotId,
      quantity,
      quoteLineId: allocation.quoteLineId,
    })),
    (plan) => plan.catalogItemId,
  );
  for (const [lotId, quantity] of quantityByLot) {
    const lot = outstanding.find(({ allocation }) => allocation.lotId === lotId)!.allocation.lot;
    const reservedAfter = lot.reservedQuantity.sub(quantity);
    if (reservedAfter.lessThan(0)) {
      throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
    }
    const updated = await transaction.inventoryLot.updateMany({
      data: { reservedQuantity: reservedAfter, version: { increment: 1 } },
      where: { id: lot.id, version: lot.version },
    });
    if (updated.count !== 1) throw new PharmacyCommercialConflictError("VERSION_CONFLICT");
    await transaction.inventoryMovement.create({
      data: {
        // Provider-originated payment events have no authenticated platform
        // principal. In that case the quote creator remains the accountable
        // business actor; worker/user initiated releases pass their real actor.
        actorPrincipalId: input.actorPrincipalId ?? reservation.quote.createdByPrincipalId,
        catalogItemId: lot.catalogItemId,
        id: createOpaqueId(),
        idempotencyKey: `release:${reservation.id}:${lot.id}`,
        locationId: lot.locationId,
        lotId: lot.id,
        onHandAfter: lot.onHandQuantity,
        pharmacyOrganizationId: reservation.quote.pharmacyOrganizationId,
        quantity,
        reasonCode: input.reasonCode,
        referenceId: reservation.providerReservationReference,
        referenceType: "RESERVATION",
        requestHash: movementHash("RELEASE", reservation.id, lot.id, quantity),
        reservedAfter,
        type: "RELEASE",
      },
    });
  }
  for (const [catalogItemId, quantity] of quantityByItem) {
    await transaction.pharmacyCatalogItem.update({
      data: { reservedQuantity: { decrement: quantity } },
      where: { id: catalogItemId },
    });
  }
  for (const { allocation, quantity } of outstanding) {
    await transaction.inventoryReservationAllocation.update({
      data: { releasedQuantity: { increment: quantity }, version: { increment: 1 } },
      where: { id: allocation.id },
    });
  }
}

export async function consumePlatformInventory(
  transaction: Transaction,
  input: {
    actorPrincipalId: string;
    dispenseEventId: string;
    lines: readonly { fillNumber: number; prescriptionItemId: string; quantity: string }[];
    pharmacyOrganizationId: string;
    prescriptionRouteId: string;
  },
): Promise<void> {
  const quotes = await transaction.pharmacyQuote.findMany({
    include: {
      inventoryReservation: {
        include: { allocations: { include: { lot: true, quoteLine: true } } },
      },
      order: true,
    },
    where: {
      fillNumber: { in: [...new Set(input.lines.map((line) => line.fillNumber))] },
      pharmacyOrganizationId: input.pharmacyOrganizationId,
      prescriptionRouteId: input.prescriptionRouteId,
      status: "ACCEPTED",
    },
  });
  const platformQuotes = quotes.filter(
    (quote) =>
      quote.order?.status === "CONFIRMED" &&
      quote.inventoryReservation?.providerCode === PLATFORM_INVENTORY_PROVIDER_CODE &&
      quote.inventoryReservation.status === "COMMITTED",
  );
  if (
    !quotes.some(
      (quote) => quote.inventoryReservation?.providerCode === PLATFORM_INVENTORY_PROVIDER_CODE,
    )
  ) {
    return;
  }
  const selected: {
    allocation: NonNullable<
      (typeof platformQuotes)[number]["inventoryReservation"]
    >["allocations"][number];
    quantity: Prisma.Decimal;
  }[] = [];
  for (const line of input.lines) {
    const quote = platformQuotes.find((candidate) => candidate.fillNumber === line.fillNumber);
    const reservation = quote?.inventoryReservation;
    const quoteLine = reservation?.allocations.find(
      (allocation) => allocation.quoteLine.prescriptionItemId === line.prescriptionItemId,
    )?.quoteLine;
    if (
      quote === undefined ||
      reservation === null ||
      reservation === undefined ||
      quoteLine === undefined ||
      !new Prisma.Decimal(line.quantity).equals(quoteLine.quantity)
    ) {
      throw new PharmacyCommercialConflictError("INVENTORY_RESERVATION_INVALID");
    }
    const allocations = reservation.allocations.filter(
      (allocation) => allocation.quoteLineId === quoteLine.id,
    );
    const outstanding = allocations.map((allocation) => ({
      allocation,
      quantity: allocation.quantity
        .sub(allocation.releasedQuantity)
        .sub(allocation.consumedQuantity),
    }));
    const totalOutstanding = outstanding.reduce(
      (total, current) => total.add(current.quantity),
      new Prisma.Decimal(0),
    );
    if (!totalOutstanding.equals(line.quantity)) {
      throw new PharmacyCommercialConflictError("INVENTORY_RESERVATION_INVALID");
    }
    selected.push(...outstanding.filter(({ quantity }) => quantity.greaterThan(0)));
  }

  const plans = selected.map(({ allocation, quantity }) => ({
    catalogItemId: allocation.catalogItemId,
    lotId: allocation.lotId,
    quantity,
    quoteLineId: allocation.quoteLineId,
  }));
  const quantityByLot = sumPlans(plans, (plan) => plan.lotId);
  const quantityByItem = sumPlans(plans, (plan) => plan.catalogItemId);
  for (const [lotId, quantity] of quantityByLot) {
    const lot = selected.find(({ allocation }) => allocation.lotId === lotId)!.allocation.lot;
    const onHandAfter = lot.onHandQuantity.sub(quantity);
    const reservedAfter = lot.reservedQuantity.sub(quantity);
    if (onHandAfter.lessThan(0) || reservedAfter.lessThan(0)) {
      throw new PharmacyCommercialConflictError("INVARIANT_VIOLATION");
    }
    const updated = await transaction.inventoryLot.updateMany({
      data: {
        onHandQuantity: onHandAfter,
        reservedQuantity: reservedAfter,
        status: onHandAfter.equals(0) ? "DEPLETED" : lot.status,
        version: { increment: 1 },
      },
      where: { id: lot.id, version: lot.version },
    });
    if (updated.count !== 1) throw new PharmacyCommercialConflictError("VERSION_CONFLICT");
    await transaction.inventoryMovement.create({
      data: {
        actorPrincipalId: input.actorPrincipalId,
        catalogItemId: lot.catalogItemId,
        id: createOpaqueId(),
        idempotencyKey: `dispense:${input.dispenseEventId}:${lot.id}`,
        locationId: lot.locationId,
        lotId: lot.id,
        onHandAfter,
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        quantity,
        reasonCode: "PRESCRIPTION_DISPENSED",
        referenceId: input.dispenseEventId,
        referenceType: "DISPENSE_EVENT",
        requestHash: movementHash("DISPENSE", input.dispenseEventId, lot.id, quantity),
        reservedAfter,
        type: "DISPENSE",
      },
    });
  }
  for (const [catalogItemId, quantity] of quantityByItem) {
    await transaction.pharmacyCatalogItem.update({
      data: {
        onHandQuantity: { decrement: quantity },
        reservedQuantity: { decrement: quantity },
      },
      where: { id: catalogItemId },
    });
  }
  for (const { allocation, quantity } of selected) {
    await transaction.inventoryReservationAllocation.update({
      data: { consumedQuantity: { increment: quantity }, version: { increment: 1 } },
      where: { id: allocation.id },
    });
  }
  for (const quote of platformQuotes) {
    const reservation = quote.inventoryReservation!;
    const allocations = await transaction.inventoryReservationAllocation.findMany({
      where: { reservationId: reservation.id },
    });
    if (
      allocations.every((allocation) =>
        allocation.consumedQuantity.add(allocation.releasedQuantity).equals(allocation.quantity),
      )
    ) {
      await transaction.inventoryReservation.update({
        data: { status: "CONSUMED", version: { increment: 1 } },
        where: { id: reservation.id },
      });
    }
  }
}

function catalogMatchesMedication(
  item: {
    brandName: string | null;
    genericName: string | null;
    medicationCode: string | null;
    medicationCodeSystem: string | null;
    name: string;
    strength: string | null;
  },
  line: PharmacyQuoteResolvedLine,
): boolean {
  if (line.medicationCode !== null || line.medicationCodeSystem !== null) {
    return (
      item.medicationCode === line.medicationCode &&
      item.medicationCodeSystem === line.medicationCodeSystem
    );
  }
  const names = [item.name, item.genericName, item.brandName]
    .filter((value): value is string => value !== null)
    .map(normalizeText);
  return (
    names.includes(normalizeText(line.medicationName)) &&
    normalizeText(item.strength ?? "") === normalizeText(line.strength ?? "")
  );
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function sumPlans(
  plans: readonly AllocationPlan[],
  key: (plan: AllocationPlan) => string,
): Map<string, Prisma.Decimal> {
  const totals = new Map<string, Prisma.Decimal>();
  for (const plan of plans) {
    totals.set(key(plan), (totals.get(key(plan)) ?? new Prisma.Decimal(0)).add(plan.quantity));
  }
  return totals;
}

function movementHash(
  type: "RESERVE" | "RELEASE" | "DISPENSE",
  referenceId: string,
  lotId: string,
  quantity: Prisma.Decimal,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ lotId, quantity: quantity.toFixed(3), referenceId, type }))
    .digest("hex");
}
