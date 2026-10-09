import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type {
  InventoryLocationResponse,
  InventoryMovementResponse,
  PharmacyCatalogItemResponse,
  PharmacyProductClassificationResponse,
} from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import {
  PharmacyInventoryConflictError,
  type PharmacyInventoryRepository,
} from "../domain/pharmacy-inventory.types.js";

const catalogItemInclude = {
  category: true,
  dosageForm: true,
} satisfies Prisma.PharmacyCatalogItemInclude;

type CatalogItemRecord = Prisma.PharmacyCatalogItemGetPayload<{
  include: typeof catalogItemInclude;
}>;

@Injectable()
export class PrismaPharmacyInventoryRepository implements PharmacyInventoryRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async createCatalogItem(input: Parameters<PharmacyInventoryRepository["createCatalogItem"]>[0]) {
    return this.database.$transaction(async (transaction) => {
      await assertPharmacyOrganization(transaction, input.pharmacyOrganizationId);
      await assertClassifications(transaction, input.categoryId, input.dosageFormId);
      const record = await transaction.pharmacyCatalogItem.create({
        data: {
          brandName: input.brandName,
          categoryId: input.categoryId,
          controlledMedication: input.controlledMedication,
          createdByPrincipalId: input.principalId,
          currency: input.currency,
          dosageFormId: input.dosageFormId,
          genericName: input.genericName,
          id: createOpaqueId(),
          lowStockThreshold: input.lowStockThreshold,
          manufacturer: input.manufacturer,
          medicationCode: input.medicationCode,
          medicationCodeSystem: input.medicationCodeSystem,
          name: input.name,
          nearExpiryDays: input.nearExpiryDays,
          pharmacyOrganizationId: input.pharmacyOrganizationId,
          prescriptionRequired: input.prescriptionRequired,
          sku: input.sku,
          storageRequirements: input.storageRequirements,
          strength: input.strength,
          unitPriceMinor: input.unitPriceMinor,
        },
        include: catalogItemInclude,
      });
      return mapCatalogItem(record);
    });
  }

  async updateCatalogItem(input: Parameters<PharmacyInventoryRepository["updateCatalogItem"]>[0]) {
    const result = await this.database.pharmacyCatalogItem.updateMany({
      data: {
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.unitPriceMinor === undefined ? {} : { unitPriceMinor: input.unitPriceMinor }),
        version: { increment: 1 },
      },
      where: {
        id: input.catalogItemId,
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        version: input.expectedVersion,
      },
    });
    if (result.count !== 1) return null;
    return mapCatalogItem(
      await this.database.pharmacyCatalogItem.findUniqueOrThrow({
        include: catalogItemInclude,
        where: { id: input.catalogItemId },
      }),
    );
  }

  async findCatalogItem(input: Parameters<PharmacyInventoryRepository["findCatalogItem"]>[0]) {
    const record = await this.database.pharmacyCatalogItem.findFirst({
      include: catalogItemInclude,
      where: { id: input.catalogItemId, pharmacyOrganizationId: input.pharmacyOrganizationId },
    });
    return record === null ? null : mapCatalogItem(record);
  }

  async listCatalogItems(input: Parameters<PharmacyInventoryRepository["listCatalogItems"]>[0]) {
    const rows = await this.database.pharmacyCatalogItem.findMany({
      include: catalogItemInclude,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      where: {
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.query === undefined
          ? {}
          : {
              OR: [
                { name: { contains: input.query, mode: "insensitive" as const } },
                { genericName: { contains: input.query, mode: "insensitive" as const } },
                { brandName: { contains: input.query, mode: "insensitive" as const } },
                { sku: { contains: input.query, mode: "insensitive" as const } },
              ],
            }),
        ...nameAfter(input.cursor),
      },
    });
    const hasNextPage = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    return {
      data: visible.map(mapCatalogItem),
      pageInfo: { endCursor: nameCursor(visible.at(-1)), hasNextPage },
    };
  }

  async listClassifications(
    input: Parameters<PharmacyInventoryRepository["listClassifications"]>[0],
  ) {
    const rows = await this.database.pharmacyProductClassification.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: input.limit,
      where: { kind: input.kind, status: "ACTIVE" },
    });
    return rows.map(mapClassification);
  }

  async createLocation(input: Parameters<PharmacyInventoryRepository["createLocation"]>[0]) {
    await assertPharmacyOrganization(this.database, input.pharmacyOrganizationId);
    return mapLocation(
      await this.database.inventoryLocation.create({
        data: { ...input, id: createOpaqueId() },
      }),
    );
  }

  async listLocations(input: Parameters<PharmacyInventoryRepository["listLocations"]>[0]) {
    const rows = await this.database.inventoryLocation.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 200,
      where: {
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        ...(input.status === undefined ? {} : { status: input.status }),
      },
    });
    return rows.map(mapLocation);
  }

  async listLots(input: Parameters<PharmacyInventoryRepository["listLots"]>[0]) {
    const rows = await this.database.inventoryLot.findMany({
      include: { location: true },
      orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      where: {
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        ...(input.catalogItemId === undefined ? {} : { catalogItemId: input.catalogItemId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...expiryAfter(input.cursor),
      },
    });
    const hasNextPage = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    return {
      data: visible.map(mapLot),
      pageInfo: { endCursor: expiryCursor(visible.at(-1)), hasNextPage },
    };
  }

  async recordMovement(input: Parameters<PharmacyInventoryRepository["recordMovement"]>[0]) {
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          batchNumber: input.batchNumber ?? null,
          catalogItemId: input.catalogItemId,
          expectedLotVersion: input.expectedLotVersion ?? null,
          expiryDate: input.expiryDate?.toISOString() ?? null,
          locationId: input.locationId,
          lotId: input.lotId ?? null,
          pharmacyOrganizationId: input.pharmacyOrganizationId,
          quantity: input.quantity,
          reasonCode: input.reasonCode,
          receivedAt: input.receivedAt?.toISOString() ?? null,
          type: input.type,
        }),
      )
      .digest("hex");

    return this.database.$transaction(
      async (transaction) => {
        const replay = await transaction.inventoryMovement.findUnique({
          where: {
            actorPrincipalId_idempotencyKey: {
              actorPrincipalId: input.actorPrincipalId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (replay !== null) {
          if (replay.requestHash !== requestHash) {
            throw new PharmacyInventoryConflictError("IDEMPOTENCY_CONFLICT");
          }
          return mapMovement(replay);
        }

        const lot =
          input.type === "RECEIVE"
            ? await createReceivingLot(transaction, input)
            : await transaction.inventoryLot.findFirst({
                where: {
                  id: input.lotId,
                  catalogItemId: input.catalogItemId,
                  locationId: input.locationId,
                  pharmacyOrganizationId: input.pharmacyOrganizationId,
                },
              });
        if (lot === null) throw new PharmacyInventoryConflictError("INVALID_INVENTORY_SCOPE");
        if (!["AVAILABLE", "QUARANTINED"].includes(lot.status)) {
          throw new PharmacyInventoryConflictError("LOT_NOT_ACTIONABLE");
        }

        const quantity = new Prisma.Decimal(input.quantity);
        const addsStock = ["RECEIVE", "ADJUST_IN", "RETURN"].includes(input.type);
        const nextOnHand = addsStock
          ? lot.onHandQuantity.add(quantity)
          : lot.onHandQuantity.sub(quantity);
        if (nextOnHand.lessThan(lot.reservedQuantity)) {
          throw new PharmacyInventoryConflictError("INSUFFICIENT_STOCK");
        }
        const expectedVersion = input.type === "RECEIVE" ? lot.version : input.expectedLotVersion;
        const updated = await transaction.inventoryLot.updateMany({
          data: {
            onHandQuantity: nextOnHand,
            status: nextOnHand.equals(0) ? "DEPLETED" : lot.status,
            version: { increment: 1 },
          },
          where: { id: lot.id, version: expectedVersion },
        });
        if (updated.count !== 1) throw new PharmacyInventoryConflictError("VERSION_CONFLICT");
        const catalogUpdated = await transaction.pharmacyCatalogItem.updateMany({
          data: {
            onHandQuantity: addsStock ? { increment: quantity } : { decrement: quantity },
          },
          where: {
            id: lot.catalogItemId,
            pharmacyOrganizationId: lot.pharmacyOrganizationId,
          },
        });
        if (catalogUpdated.count !== 1) {
          throw new PharmacyInventoryConflictError("INSUFFICIENT_STOCK");
        }

        const movement = await transaction.inventoryMovement.create({
          data: {
            actorPrincipalId: input.actorPrincipalId,
            catalogItemId: lot.catalogItemId,
            id: createOpaqueId(),
            idempotencyKey: input.idempotencyKey,
            locationId: lot.locationId,
            lotId: lot.id,
            onHandAfter: nextOnHand,
            pharmacyOrganizationId: lot.pharmacyOrganizationId,
            quantity,
            reasonCode: input.reasonCode,
            referenceType: "MANUAL",
            requestHash,
            reservedAfter: lot.reservedQuantity,
            type: input.type,
          },
        });
        await transaction.auditEvent.create({
          data: {
            action: `inventory.${input.type.toLowerCase()}`,
            actorPrincipalId: input.actorPrincipalId,
            id: createOpaqueId(),
            metadata: { catalogItemId: lot.catalogItemId, lotId: lot.id },
            organizationId: lot.pharmacyOrganizationId,
            requestId: input.requestId,
            resourceId: movement.id,
            resourceType: "inventory_movement",
            result: "SUCCEEDED",
          },
        });
        return mapMovement(movement);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listMovements(input: Parameters<PharmacyInventoryRepository["listMovements"]>[0]) {
    const rows = await this.database.inventoryMovement.findMany({
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      where: {
        pharmacyOrganizationId: input.pharmacyOrganizationId,
        ...(input.catalogItemId === undefined ? {} : { catalogItemId: input.catalogItemId }),
        ...(input.lotId === undefined ? {} : { lotId: input.lotId }),
        ...occurredBefore(input.cursor),
      },
    });
    const hasNextPage = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    return {
      data: visible.map(mapMovement),
      pageInfo: { endCursor: occurredCursor(visible.at(-1)), hasNextPage },
    };
  }
}

async function assertPharmacyOrganization(
  transaction: Prisma.TransactionClient | PrismaService,
  organizationId: string,
) {
  const organization = await transaction.organization.findFirst({
    select: { id: true },
    where: {
      id: organizationId,
      status: "ACTIVE",
      type: "PHARMACY",
      verificationStatus: "VERIFIED",
    },
  });
  if (organization === null) {
    throw new PharmacyInventoryConflictError("INVALID_INVENTORY_SCOPE");
  }
}

async function assertClassifications(
  transaction: Prisma.TransactionClient,
  categoryId: string,
  dosageFormId: string,
) {
  const count = await transaction.pharmacyProductClassification.count({
    where: {
      OR: [
        { id: categoryId, kind: "CATEGORY", status: "ACTIVE" },
        { id: dosageFormId, kind: "DOSAGE_FORM", status: "ACTIVE" },
      ],
    },
  });
  if (count !== 2) throw new PharmacyInventoryConflictError("INVALID_CLASSIFICATION");
}

async function createReceivingLot(
  transaction: Prisma.TransactionClient,
  input: Parameters<PharmacyInventoryRepository["recordMovement"]>[0],
) {
  if (
    input.batchNumber === undefined ||
    input.expiryDate === undefined ||
    input.receivedAt === undefined
  ) {
    throw new PharmacyInventoryConflictError("INVALID_INVENTORY_SCOPE");
  }
  await assertPharmacyOrganization(transaction, input.pharmacyOrganizationId);
  const existing = await transaction.inventoryLot.findUnique({
    where: {
      catalogItemId_locationId_batchNumber: {
        batchNumber: input.batchNumber,
        catalogItemId: input.catalogItemId,
        locationId: input.locationId,
      },
    },
  });
  if (existing !== null) {
    if (
      existing.pharmacyOrganizationId !== input.pharmacyOrganizationId ||
      existing.expiryDate.getTime() !== input.expiryDate.getTime()
    ) {
      throw new PharmacyInventoryConflictError("INVALID_INVENTORY_SCOPE");
    }
    return existing;
  }
  return transaction.inventoryLot.create({
    data: {
      batchNumber: input.batchNumber,
      catalogItemId: input.catalogItemId,
      expiryDate: input.expiryDate,
      id: createOpaqueId(),
      locationId: input.locationId,
      pharmacyOrganizationId: input.pharmacyOrganizationId,
      receivedAt: input.receivedAt,
    },
  });
}

function mapClassification(row: {
  code: string;
  id: string;
  kind: "CATEGORY" | "DOSAGE_FORM";
  name: string;
  status: "ACTIVE" | "INACTIVE";
  version: number;
}): PharmacyProductClassificationResponse {
  return {
    code: row.code,
    id: row.id,
    kind: row.kind,
    name: row.name,
    status: row.status,
    version: row.version,
  };
}

function mapCatalogItem(row: CatalogItemRecord): PharmacyCatalogItemResponse {
  const available = row.onHandQuantity.sub(row.reservedQuantity);
  return {
    availableQuantity: available.toFixed(3),
    brandName: row.brandName,
    category: mapClassification(row.category),
    controlledMedication: row.controlledMedication,
    createdAt: row.createdAt.toISOString(),
    currency: row.currency,
    dosageForm: mapClassification(row.dosageForm),
    genericName: row.genericName,
    id: row.id,
    lowStock: available.lessThanOrEqualTo(row.lowStockThreshold),
    lowStockThreshold: row.lowStockThreshold.toFixed(3),
    manufacturer: row.manufacturer,
    medicationCode: row.medicationCode,
    medicationCodeSystem: row.medicationCodeSystem,
    name: row.name,
    nearExpiryDays: row.nearExpiryDays,
    onHandQuantity: row.onHandQuantity.toFixed(3),
    pharmacyOrganizationId: row.pharmacyOrganizationId,
    prescriptionRequired: row.prescriptionRequired,
    reservedQuantity: row.reservedQuantity.toFixed(3),
    sku: row.sku,
    status: row.status,
    storageRequirements: row.storageRequirements,
    strength: row.strength,
    unitPriceMinor: row.unitPriceMinor.toString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function mapLot(row: Prisma.InventoryLotGetPayload<{ include: { location: true } }>) {
  return {
    availableQuantity:
      row.status === "AVAILABLE"
        ? row.onHandQuantity.sub(row.reservedQuantity).toFixed(3)
        : "0.000",
    batchNumber: row.batchNumber,
    catalogItemId: row.catalogItemId,
    expiryDate: row.expiryDate.toISOString().slice(0, 10),
    id: row.id,
    location: mapLocation(row.location),
    onHandQuantity: row.onHandQuantity.toFixed(3),
    receivedAt: row.receivedAt.toISOString(),
    reservedQuantity: row.reservedQuantity.toFixed(3),
    status: row.status,
    version: row.version,
  };
}

function mapLocation(row: {
  code: string;
  id: string;
  name: string;
  pharmacyOrganizationId: string;
  status: "ACTIVE" | "INACTIVE";
  version: number;
}): InventoryLocationResponse {
  return {
    code: row.code,
    id: row.id,
    name: row.name,
    pharmacyOrganizationId: row.pharmacyOrganizationId,
    status: row.status,
    version: row.version,
  };
}

function mapMovement(row: {
  id: string;
  lotId: string;
  occurredAt: Date;
  onHandAfter: Prisma.Decimal;
  quantity: Prisma.Decimal;
  reasonCode: string;
  referenceId: string | null;
  referenceType: "MANUAL" | "RESERVATION" | "DISPENSE_EVENT" | "PHARMACY_ORDER";
  reservedAfter: Prisma.Decimal;
  type:
    | "RECEIVE"
    | "ADJUST_IN"
    | "ADJUST_OUT"
    | "RESERVE"
    | "RELEASE"
    | "DISPENSE"
    | "RETURN"
    | "WRITE_OFF";
}): InventoryMovementResponse {
  return {
    id: row.id,
    lotId: row.lotId,
    occurredAt: row.occurredAt.toISOString(),
    onHandAfter: row.onHandAfter.toFixed(3),
    quantity: row.quantity.toFixed(3),
    reasonCode: row.reasonCode,
    referenceId: row.referenceId,
    referenceType: row.referenceType,
    reservedAfter: row.reservedAfter.toFixed(3),
    type: row.type,
  };
}

function nameAfter(cursor: { id: string; sortValue: string } | undefined) {
  return cursor === undefined
    ? {}
    : {
        OR: [{ name: { gt: cursor.sortValue } }, { name: cursor.sortValue, id: { gt: cursor.id } }],
      };
}

function occurredBefore(cursor: { id: string; sortValue: string } | undefined) {
  if (cursor === undefined) return {};
  const occurredAt = new Date(cursor.sortValue);
  return { OR: [{ occurredAt: { lt: occurredAt } }, { occurredAt, id: { lt: cursor.id } }] };
}

function expiryAfter(cursor: { id: string; sortValue: string } | undefined) {
  if (cursor === undefined) return {};
  const expiryDate = new Date(cursor.sortValue);
  return { OR: [{ expiryDate: { gt: expiryDate } }, { expiryDate, id: { gt: cursor.id } }] };
}

function nameCursor(row: { id: string; name: string } | undefined) {
  return row === undefined
    ? null
    : Buffer.from(JSON.stringify({ id: row.id, sortValue: row.name }), "utf8").toString(
        "base64url",
      );
}

function occurredCursor(row: { id: string; occurredAt: Date } | undefined) {
  return row === undefined
    ? null
    : Buffer.from(
        JSON.stringify({ id: row.id, sortValue: row.occurredAt.toISOString() }),
        "utf8",
      ).toString("base64url");
}

function expiryCursor(row: { expiryDate: Date; id: string } | undefined) {
  return row === undefined
    ? null
    : Buffer.from(
        JSON.stringify({ id: row.id, sortValue: row.expiryDate.toISOString() }),
        "utf8",
      ).toString("base64url");
}
