import { describe, expect, it } from "vitest";

import { Prisma } from "../src/generated/prisma/client.js";
import { PharmacyCommercialConflictError } from "../src/pharmacy/domain/pharmacy-commercial.types.js";
import { buildFefoAllocationPlan } from "../src/pharmacy/infrastructure/platform-inventory-transactions.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const catalogItemId = createOpaqueId();

function lot(input: { available: string; expiryDate: string; id?: string; reserved?: string }) {
  const reservedQuantity = new Prisma.Decimal(input.reserved ?? "0");
  return {
    catalogItemId,
    expiryDate: new Date(input.expiryDate),
    id: input.id ?? createOpaqueId(),
    onHandQuantity: new Prisma.Decimal(input.available).add(reservedQuantity),
    reservedQuantity,
  };
}

describe("buildFefoAllocationPlan", () => {
  it("allocates earliest expiry first and carries the remainder to the next lot", () => {
    const later = lot({ available: "5", expiryDate: "2030-02-01", id: createOpaqueId() });
    const earlier = lot({ available: "2", expiryDate: "2030-01-01", id: createOpaqueId() });

    const plan = buildFefoAllocationPlan(
      [{ catalogItemId, quantity: "3", quoteLineId: createOpaqueId() }],
      [later, earlier],
    );

    expect(plan.map((allocation) => allocation.lotId)).toEqual([earlier.id, later.id]);
    expect(plan.map((allocation) => allocation.quantity.toString())).toEqual(["2", "1"]);
  });

  it("subtracts existing reservations before allocating available stock", () => {
    const reserved = lot({
      available: "1",
      expiryDate: "2030-01-01",
      reserved: "4",
    });

    expect(() =>
      buildFefoAllocationPlan(
        [{ catalogItemId, quantity: "2", quoteLineId: createOpaqueId() }],
        [reserved],
      ),
    ).toThrow(PharmacyCommercialConflictError);
  });

  it("does not allocate one lot twice across quote lines", () => {
    const sharedLot = lot({ available: "3", expiryDate: "2030-01-01" });

    expect(() =>
      buildFefoAllocationPlan(
        [
          { catalogItemId, quantity: "2", quoteLineId: createOpaqueId() },
          { catalogItemId, quantity: "2", quoteLineId: createOpaqueId() },
        ],
        [sharedLot],
      ),
    ).toThrow(PharmacyCommercialConflictError);
  });
});
