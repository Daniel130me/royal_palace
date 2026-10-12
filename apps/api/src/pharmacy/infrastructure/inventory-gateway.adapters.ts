import { createHash, randomUUID } from "node:crypto";

import {
  PLATFORM_INVENTORY_PROVIDER_CODE,
  type InventoryGateway,
} from "../domain/pharmacy-commercial.types.js";

export class InventoryGatewayDisabledError extends Error {
  constructor() {
    super("Inventory reservation is not enabled in this environment");
    this.name = "InventoryGatewayDisabledError";
  }
}

export class DisabledInventoryGateway implements InventoryGateway {
  readonly providerCode = "DISABLED";

  reserve(): Promise<never> {
    return Promise.reject(new InventoryGatewayDisabledError());
  }

  release(): Promise<never> {
    return Promise.reject(new InventoryGatewayDisabledError());
  }
}

/**
 * Deterministic local/test adapter. It never represents real stock and is rejected
 * by protected-environment configuration validation.
 */
export class SyntheticInventoryGateway implements InventoryGateway {
  readonly providerCode = "SYNTHETIC_INVENTORY";

  async reserve(input: Parameters<InventoryGateway["reserve"]>[0]) {
    const canonical = JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      lines: [...input.lines].sort((left, right) =>
        left.prescriptionItemId.localeCompare(right.prescriptionItemId),
      ),
      pharmacyOrganizationId: input.pharmacyOrganizationId,
    });
    const reservationKeyHash = createHash("sha256").update(canonical).digest("hex");
    const evidenceHash = createHash("sha256")
      .update(`${canonical}:${input.expiresAt.toISOString()}`)
      .digest("hex");
    return {
      evidenceHash,
      expiresAt: input.expiresAt,
      providerCode: this.providerCode,
      providerReservationReference: `inventory_${reservationKeyHash}`,
    };
  }

  async release(): Promise<void> {
    // Synthetic reservations have no external state to release.
  }
}

/**
 * Produces an intent for the platform-owned ledger. The repository performs the
 * actual FEFO allocation in the same serializable transaction that creates the
 * quote, so a quote and its stock hold can never diverge.
 */
export class PlatformInventoryGateway implements InventoryGateway {
  readonly providerCode = PLATFORM_INVENTORY_PROVIDER_CODE;

  async reserve(input: Parameters<InventoryGateway["reserve"]>[0]) {
    if (input.lines.some((line) => line.catalogItemId === null)) {
      throw new Error("Platform inventory requires a catalog item for every quote line");
    }
    const providerReservationReference = randomUUID();
    const evidenceHash = createHash("sha256")
      .update(
        JSON.stringify({
          expiresAt: input.expiresAt.toISOString(),
          idempotencyKey: input.idempotencyKey,
          lines: [...input.lines].sort((left, right) =>
            left.prescriptionItemId.localeCompare(right.prescriptionItemId),
          ),
          pharmacyOrganizationId: input.pharmacyOrganizationId,
          providerReservationReference,
        }),
      )
      .digest("hex");
    return {
      evidenceHash,
      expiresAt: input.expiresAt,
      providerCode: this.providerCode,
      providerReservationReference,
    };
  }

  async release(): Promise<void> {
    // A platform hold is created atomically with its quote. A failed quote
    // transaction therefore has no inventory state to compensate.
  }
}
