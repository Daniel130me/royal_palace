import type { PublicFacilityLocation } from "@royal-palace/contracts";
import { describe, expect, it } from "vitest";

import { formatPublicLocation, publicLocationLabel } from "@/lib/public-location";

const location: PublicFacilityLocation = {
  addressLine1: "12 Example Street",
  addressLine2: null,
  administrativeArea: null,
  countryCode: "CH",
  id: "0199a18e-a400-7000-8000-000000000211",
  label: "Main facility",
  locality: "Zurich",
  postalCode: "8001",
  publicPhone: null,
};

describe("public location formatting", () => {
  it("formats a globally valid address without requiring a state", () => {
    expect(formatPublicLocation(location)).toBe("12 Example Street, Zurich, 8001, CH");
    expect(publicLocationLabel(location)).toBe("Zurich");
  });

  it("falls back to the country when locality and administrative area are absent", () => {
    expect(
      publicLocationLabel({
        ...location,
        administrativeArea: null,
        locality: null,
      }),
    ).toBe("CH");
  });
});
