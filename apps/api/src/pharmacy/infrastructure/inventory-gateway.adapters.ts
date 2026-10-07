import { createHash } from "node:crypto";

import type { InventoryGateway } from "../domain/pharmacy-commercial.types.js";

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
