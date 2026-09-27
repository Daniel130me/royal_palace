import { describe, expect, it } from "vitest";

import { createOpaqueId, isOpaqueId } from "../src/platform/identifiers.js";

describe("opaque identifiers", () => {
  it("generates UUIDv7 identifiers that pass boundary validation", () => {
    const id = createOpaqueId();

    expect(isOpaqueId(id)).toBe(true);
  });

  it("rejects identifiers from another UUID version", () => {
    expect(isOpaqueId("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });
});
