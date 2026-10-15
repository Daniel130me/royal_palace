import { describe, expect, it } from "vitest";

import { exactClinicalUuid } from "../../src/lib/auth/clinical-bff.js";

describe("clinical BFF route validation", () => {
  it("accepts only exact UUID path segments", () => {
    expect(exactClinicalUuid("0199a18e-a400-7000-8000-000000000203")).not.toBeNull();
    expect(exactClinicalUuid("../admin")).toBeNull();
    expect(exactClinicalUuid("0199a18e-a400-7000-8000-000000000203/sign")).toBeNull();
    expect(exactClinicalUuid(undefined)).toBeNull();
  });
});
