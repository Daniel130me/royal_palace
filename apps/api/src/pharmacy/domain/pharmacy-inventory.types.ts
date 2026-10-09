import type {
  InventoryLocationResponse,
  InventoryLotListResponse,
  InventoryMovementListResponse,
  InventoryMovementResponse,
  InventoryMovementType,
  PharmacyCatalogItemListResponse,
  PharmacyCatalogItemResponse,
  PharmacyProductClassificationResponse,
} from "@royal-palace/contracts";

export interface PharmacyInventoryListInput {
  cursor?: { id: string; sortValue: string };
  limit: number;
  pharmacyOrganizationId: string;
}

export interface PharmacyInventoryRepository {
  createCatalogItem(input: {
    brandName?: string;
    categoryId: string;
    controlledMedication: boolean;
    currency: string;
    dosageFormId: string;
    genericName?: string;
    lowStockThreshold: string;
    manufacturer?: string;
    medicationCode?: string;
    medicationCodeSystem?: string;
    name: string;
    nearExpiryDays: number;
    pharmacyOrganizationId: string;
    prescriptionRequired: boolean;
    principalId: string;
    sku: string;
    storageRequirements?: string;
    strength?: string;
    unitPriceMinor: bigint;
  }): Promise<PharmacyCatalogItemResponse>;
  createLocation(input: {
    code: string;
    name: string;
    pharmacyOrganizationId: string;
  }): Promise<InventoryLocationResponse>;
  findCatalogItem(input: {
    catalogItemId: string;
    pharmacyOrganizationId: string;
  }): Promise<PharmacyCatalogItemResponse | null>;
  listCatalogItems(
    input: PharmacyInventoryListInput & {
      categoryId?: string;
      query?: string;
      status?: "ACTIVE" | "INACTIVE";
    },
  ): Promise<PharmacyCatalogItemListResponse>;
  listClassifications(input: {
    kind: "CATEGORY" | "DOSAGE_FORM";
    limit: number;
  }): Promise<readonly PharmacyProductClassificationResponse[]>;
  listLocations(input: {
    pharmacyOrganizationId: string;
    status?: "ACTIVE" | "INACTIVE";
  }): Promise<readonly InventoryLocationResponse[]>;
  listLots(
    input: PharmacyInventoryListInput & {
      catalogItemId?: string;
      status?: "AVAILABLE" | "QUARANTINED" | "DEPLETED" | "EXPIRED" | "RECALLED";
    },
  ): Promise<InventoryLotListResponse>;
  listMovements(
    input: PharmacyInventoryListInput & { catalogItemId?: string; lotId?: string },
  ): Promise<InventoryMovementListResponse>;
  recordMovement(input: {
    actorPrincipalId: string;
    batchNumber?: string;
    catalogItemId: string;
    expectedLotVersion?: number;
    expiryDate?: Date;
    idempotencyKey: string;
    locationId: string;
    lotId?: string;
    pharmacyOrganizationId: string;
    quantity: string;
    reasonCode: string;
    receivedAt?: Date;
    requestId: string;
    type: Extract<
      InventoryMovementType,
      "RECEIVE" | "ADJUST_IN" | "ADJUST_OUT" | "RETURN" | "WRITE_OFF"
    >;
  }): Promise<InventoryMovementResponse | null>;
  updateCatalogItem(input: {
    catalogItemId: string;
    expectedVersion: number;
    pharmacyOrganizationId: string;
    status?: "ACTIVE" | "INACTIVE";
    unitPriceMinor?: bigint;
  }): Promise<PharmacyCatalogItemResponse | null>;
}

export class PharmacyInventoryConflictError extends Error {
  constructor(
    readonly reason:
      | "IDEMPOTENCY_CONFLICT"
      | "INSUFFICIENT_STOCK"
      | "INVALID_CLASSIFICATION"
      | "INVALID_INVENTORY_SCOPE"
      | "LOT_NOT_ACTIONABLE"
      | "VERSION_CONFLICT",
  ) {
    super(reason);
    this.name = "PharmacyInventoryConflictError";
  }
}

export const PHARMACY_INVENTORY_REPOSITORY = Symbol("PHARMACY_INVENTORY_REPOSITORY");
