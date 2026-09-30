import { describe, expect, it } from "vitest";

import {
  decodeCatalogueCursor,
  encodeCatalogueCursor,
  InvalidCatalogueCursorError,
} from "../src/onboarding/application/catalogue-cursor.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

describe("clinical catalogue cursor", () => {
  it("round-trips a specialty cursor only with matching filters", () => {
    const cursor = {
      category: "Medicine",
      id: createOpaqueId(),
      kind: "SPECIALTY" as const,
      name: "Cardiology",
    };
    const encoded = encodeCatalogueCursor(cursor, "ACTIVE");

    expect(decodeCatalogueCursor(encoded, "SPECIALTY", "ACTIVE")).toEqual(cursor);
    expect(() => decodeCatalogueCursor(encoded, "SPECIALTY", "INACTIVE")).toThrow(
      InvalidCatalogueCursorError,
    );
    expect(() => decodeCatalogueCursor(encoded, "PROFESSION", "ACTIVE")).toThrow(
      InvalidCatalogueCursorError,
    );
  });

  it("rejects malformed and non-canonical cursor values", () => {
    expect(() => decodeCatalogueCursor("not-a-cursor", "PROFESSION", undefined)).toThrow(
      InvalidCatalogueCursorError,
    );
  });
});
