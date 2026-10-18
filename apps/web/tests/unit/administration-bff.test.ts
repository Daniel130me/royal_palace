import { describe, expect, it } from "vitest";

import {
  adminComplaintListPath,
  adminDashboardPath,
  adminDeliveryListPath,
} from "../../src/lib/auth/administration-bff";

describe("administration BFF allowlists", () => {
  it("requires valid UTC day boundaries for the dashboard", () => {
    expect(
      adminDashboardPath(
        new URL(
          "http://local.test?dayFrom=2026-10-17T00%3A00%3A00.000Z&dayTo=2026-10-18T00%3A00%3A00.000Z",
        ),
      ),
    ).toBe(
      "/v1/admin/dashboard?dayFrom=2026-10-17T00%3A00%3A00.000Z&dayTo=2026-10-18T00%3A00%3A00.000Z",
    );
    expect(() => adminDashboardPath(new URL("http://local.test?dayFrom=tomorrow"))).toThrow();
  });

  it("forwards only bounded complaint filters", () => {
    expect(
      adminComplaintListPath(
        new URL("http://local.test?scope=OPEN&priority=URGENT&limit=25&q=delay"),
      ),
    ).toBe("/v1/admin/complaints?priority=URGENT&scope=OPEN&limit=25&q=delay");
    expect(() =>
      adminComplaintListPath(new URL("http://local.test?scope=OPEN&includeInternalNotes=true")),
    ).toThrow();
    expect(() =>
      adminComplaintListPath(new URL("http://local.test?scope=OPEN&limit=500")),
    ).toThrow();
  });

  it("rejects delivery data-expansion parameters", () => {
    expect(adminDeliveryListPath(new URL("http://local.test?scope=EXCEPTION&cursor=opaque"))).toBe(
      "/v1/admin/deliveries?scope=EXCEPTION&cursor=opaque",
    );
    expect(() =>
      adminDeliveryListPath(new URL("http://local.test?scope=ALL&includeRecipient=true")),
    ).toThrow();
  });
});
