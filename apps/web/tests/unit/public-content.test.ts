import type { PublicServicePrice } from "@royal-palace/contracts";
import { describe, expect, it } from "vitest";

import { groupPublicPrices } from "@/lib/public-content";

function price(category: string, name: string): PublicServicePrice {
  return {
    currency: "CAD",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    patientPriceMinor: "1000",
    service: {
      category,
      code: name.toLowerCase().replaceAll(" ", "-"),
      id: `service-${category}-${name}`,
      name,
    },
  };
}

describe("public content helpers", () => {
  it("groups and sorts governed public prices without assuming categories", () => {
    const groups = groupPublicPrices([
      price("Laboratory", "Zinc Panel"),
      price("Consultation", "Video Consultation"),
      price("Laboratory", "Blood Count"),
    ]);

    expect(groups.map((group) => group.category)).toEqual(["Consultation", "Laboratory"]);
    expect(groups[1]?.prices.map((item) => item.service.name)).toEqual([
      "Blood Count",
      "Zinc Panel",
    ]);
  });
});
