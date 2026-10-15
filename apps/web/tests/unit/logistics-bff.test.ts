import { describe, expect, it } from "vitest";

import {
  exactLogisticsUuid,
  logisticsHistoryPath,
  logisticsListPath,
} from "../../src/lib/auth/logistics-bff";

describe("logistics BFF allowlists", () => {
  it("accepts only exact UUID path identifiers", () => {
    expect(exactLogisticsUuid("0199a18e-a400-7000-8000-000000000203")).toBe(
      "0199a18e-a400-7000-8000-000000000203",
    );
    expect(exactLogisticsUuid("../admin")).toBeNull();
    expect(exactLogisticsUuid(undefined)).toBeNull();
  });

  it("forwards only bounded delivery filters", () => {
    expect(
      logisticsListPath(
        new URL("http://local.test?status=IN_TRANSIT&limit=25&cursor=opaque"),
        "/v1/logistics/deliveries",
      ),
    ).toBe("/v1/logistics/deliveries?status=IN_TRANSIT&limit=25&cursor=opaque");
    expect(
      logisticsListPath(
        new URL("http://local.test?patientId=0199a18e-a400-7000-8000-000000000203"),
        "/v1/logistics/deliveries",
      ),
    ).toBeNull();
    expect(
      logisticsListPath(new URL("http://local.test?limit=500"), "/v1/logistics/deliveries"),
    ).toBeNull();
  });

  it("keeps history bounded and rejects unrelated query keys", () => {
    expect(
      logisticsHistoryPath(
        new URL("http://local.test?limit=100"),
        "/v1/logistics/deliveries/id/history",
      ),
    ).toBe("/v1/logistics/deliveries/id/history?limit=100");
    expect(
      logisticsHistoryPath(
        new URL("http://local.test?includeActor=true"),
        "/v1/logistics/deliveries/id/history",
      ),
    ).toBeNull();
  });
});
