import { Inject, Injectable } from "@nestjs/common";
import type { CurrentSession } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import {
  PHARMACY_INVENTORY_REPOSITORY,
  type PharmacyInventoryRepository,
} from "../domain/pharmacy-inventory.types.js";

export interface PharmacyInventoryRequestContext {
  actor: CurrentSession;
  requestId: string;
}

export class PharmacyInventoryFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PharmacyInventoryFlowError";
  }
}

@Injectable()
export class PharmacyInventoryService {
  constructor(
    @Inject(PHARMACY_INVENTORY_REPOSITORY)
    private readonly repository: PharmacyInventoryRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  async createCatalogItem(
    context: PharmacyInventoryRequestContext,
    input: Omit<Parameters<PharmacyInventoryRepository["createCatalogItem"]>[0], "principalId">,
  ) {
    await this.authorize(context, input.pharmacyOrganizationId, "new-catalog-item");
    return this.repository.createCatalogItem({
      ...input,
      principalId: context.actor.principalId,
    });
  }

  async updateCatalogItem(
    context: PharmacyInventoryRequestContext,
    input: Parameters<PharmacyInventoryRepository["updateCatalogItem"]>[0],
  ) {
    await this.authorize(context, input.pharmacyOrganizationId, input.catalogItemId);
    const item = await this.repository.updateCatalogItem(input);
    if (item === null) {
      throw new PharmacyInventoryFlowError(
        "inventory_version_conflict",
        409,
        "Inventory catalogue item changed before this update",
      );
    }
    return item;
  }

  async getCatalogItem(
    context: PharmacyInventoryRequestContext,
    pharmacyOrganizationId: string,
    catalogItemId: string,
  ) {
    await this.authorize(context, pharmacyOrganizationId, catalogItemId);
    const item = await this.repository.findCatalogItem({
      catalogItemId,
      pharmacyOrganizationId,
    });
    if (item === null) {
      throw new PharmacyInventoryFlowError(
        "catalog_item_not_found",
        404,
        "Catalogue item was not found",
      );
    }
    return item;
  }

  async listCatalogItems(
    context: PharmacyInventoryRequestContext,
    input: Omit<Parameters<PharmacyInventoryRepository["listCatalogItems"]>[0], "cursor"> & {
      cursor?: string;
    },
  ) {
    await this.authorize(context, input.pharmacyOrganizationId, "catalogue");
    return this.repository.listCatalogItems({ ...input, cursor: decodeCursor(input.cursor) });
  }

  async listClassifications(
    context: PharmacyInventoryRequestContext,
    pharmacyOrganizationId: string,
    kind: "CATEGORY" | "DOSAGE_FORM",
  ) {
    await this.authorize(context, pharmacyOrganizationId, `classification-${kind.toLowerCase()}`);
    return this.repository.listClassifications({ kind, limit: 200 });
  }

  async createLocation(
    context: PharmacyInventoryRequestContext,
    input: Parameters<PharmacyInventoryRepository["createLocation"]>[0],
  ) {
    await this.authorize(context, input.pharmacyOrganizationId, "new-inventory-location");
    return this.repository.createLocation(input);
  }

  async listLocations(
    context: PharmacyInventoryRequestContext,
    input: Parameters<PharmacyInventoryRepository["listLocations"]>[0],
  ) {
    await this.authorize(context, input.pharmacyOrganizationId, "inventory-locations");
    return this.repository.listLocations(input);
  }

  async listLots(
    context: PharmacyInventoryRequestContext,
    input: Omit<Parameters<PharmacyInventoryRepository["listLots"]>[0], "cursor"> & {
      cursor?: string;
    },
  ) {
    await this.authorize(context, input.pharmacyOrganizationId, input.catalogItemId ?? "lots");
    return this.repository.listLots({ ...input, cursor: decodeCursor(input.cursor) });
  }

  async recordMovement(
    context: PharmacyInventoryRequestContext,
    input: Omit<
      Parameters<PharmacyInventoryRepository["recordMovement"]>[0],
      "actorPrincipalId" | "requestId"
    >,
  ) {
    await this.authorize(context, input.pharmacyOrganizationId, input.lotId ?? "new-lot");
    if (input.type === "RECEIVE" && input.expiryDate !== undefined) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (input.expiryDate <= today) {
        throw new PharmacyInventoryFlowError(
          "expired_inventory_lot",
          400,
          "Expired inventory cannot be received as available stock",
        );
      }
    }
    const movement = await this.repository.recordMovement({
      ...input,
      actorPrincipalId: context.actor.principalId,
      requestId: context.requestId,
    });
    if (movement === null) {
      throw new PharmacyInventoryFlowError(
        "inventory_version_conflict",
        409,
        "Inventory changed before this movement was recorded",
      );
    }
    return movement;
  }

  async listMovements(
    context: PharmacyInventoryRequestContext,
    input: Omit<Parameters<PharmacyInventoryRepository["listMovements"]>[0], "cursor"> & {
      cursor?: string;
    },
  ) {
    await this.authorize(context, input.pharmacyOrganizationId, input.lotId ?? "movements");
    return this.repository.listMovements({ ...input, cursor: decodeCursor(input.cursor) });
  }

  private authorize(
    context: PharmacyInventoryRequestContext,
    organizationId: string,
    resourceId: string,
  ) {
    return this.authorization.authorize({
      actor: context.actor,
      context: {
        organizationId,
        resourceId,
        resourceType: "pharmacy_inventory",
      },
      policy: AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY,
      requestId: context.requestId,
    });
  }
}

function decodeCursor(value: string | undefined) {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("id" in parsed) ||
      !("sortValue" in parsed) ||
      typeof parsed.id !== "string" ||
      typeof parsed.sortValue !== "string"
    ) {
      throw new Error("invalid cursor shape");
    }
    return { id: parsed.id, sortValue: parsed.sortValue };
  } catch {
    throw new PharmacyInventoryFlowError("invalid_cursor", 400, "Cursor is invalid");
  }
}
