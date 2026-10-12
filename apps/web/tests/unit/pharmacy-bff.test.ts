import { describe, expect, it } from "vitest";

import {
  adminPharmacyOrderListPath,
  pharmacyDeliveryListPath,
} from "../../src/lib/auth/pharmacy-bff.js";

describe("pharmacy BFF list allowlists", () => {
  it("copies only valid delivery filters", () => {
    expect(
      pharmacyDeliveryListPath(
        new URL("http://local/api/pharmacy/deliveries?status=READY&limit=25"),
        "/v1/pharmacy/deliveries",
      ),
    ).toBe("/v1/pharmacy/deliveries?status=READY&limit=25");
    expect(
      pharmacyDeliveryListPath(
        new URL("http://local/api/pharmacy/deliveries?status=IN_TRANSIT"),
        "/v1/pharmacy/deliveries",
      ),
    ).toBeNull();
  });

  it("accepts bounded index-friendly admin filters and rejects arbitrary input", () => {
    const organizationId = "0199a18e-a400-7000-8000-000000000203";
    expect(
      adminPharmacyOrderListPath(
        new URL(
          `http://local/api/admin/pharmacy/orders?orderNumberPrefix=ORDER-20&pharmacyOrganizationId=${organizationId}`,
        ),
        "/v1/admin/pharmacy/orders",
      ),
    ).toContain("orderNumberPrefix=ORDER-20");
    expect(
      adminPharmacyOrderListPath(
        new URL("http://local/api/admin/pharmacy/orders?patientId=private"),
        "/v1/admin/pharmacy/orders",
      ),
    ).toBeNull();
  });
});
