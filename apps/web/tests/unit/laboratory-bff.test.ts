import { describe, expect, it } from "vitest";

import { exactLaboratoryUuid, laboratoryQueuePath } from "../../src/lib/auth/laboratory-bff.js";

describe("laboratory BFF allowlists", () => {
  it("accepts only exact opaque identifiers", () => {
    expect(exactLaboratoryUuid("0199a18e-a400-7000-8000-000000000203")).not.toBeNull();
    expect(exactLaboratoryUuid("../admin")).toBeNull();
    expect(exactLaboratoryUuid(undefined)).toBeNull();
  });

  it("copies only bounded, indexed queue filters", () => {
    expect(
      laboratoryQueuePath(
        new URL("http://local/api/laboratory/bookings?status=PROCESSING&limit=25"),
      ),
    ).toBe("/v1/laboratory/bookings?status=PROCESSING&limit=25");
    expect(
      laboratoryQueuePath(new URL("http://local/api/laboratory/bookings?patientId=private")),
    ).toBeNull();
    expect(
      laboratoryQueuePath(new URL("http://local/api/laboratory/bookings?limit=500")),
    ).toBeNull();
  });
});
