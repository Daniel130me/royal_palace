// Unit tests for the pure helpers in manager-constants.ts and
// manager-access.ts (plan §10 — basis-point math, event keys, redaction).

import { describe, expect, it } from "vitest";
import {
  BPS_PER_HUNDRED_PERCENT,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  calculateEarningAmount,
  clampPageSize,
  earningEventKey,
  formatRateBps,
  maturityDate,
  rateBpsToPercent,
  reversalEventKey,
} from "@/lib/manager-constants";
import { maskAccountNumber } from "@/lib/manager-access";

describe("calculateEarningAmount", () => {
  it("computes the exact basis-point share", () => {
    expect(calculateEarningAmount(120_000, 300)).toBe(3_600); // 3% of ₦120,000
    expect(calculateEarningAmount(150_000, 250)).toBe(3_750); // 2.5%
    expect(calculateEarningAmount(80_000, 500)).toBe(4_000); // 5%
    expect(calculateEarningAmount(10_000, 10_000)).toBe(10_000); // 100%
  });

  it("rounds exactly once to the nearest naira", () => {
    // 33,333 * 250 / 10000 = 833.325 -> 833
    expect(calculateEarningAmount(33_333, 250)).toBe(833);
    // 66,670 * 250 / 10000 = 1666.75 -> 1667
    expect(calculateEarningAmount(66_670, 250)).toBe(1_667);
  });

  it("returns zero for zero amounts or zero rates", () => {
    expect(calculateEarningAmount(0, 300)).toBe(0);
    expect(calculateEarningAmount(50_000, 0)).toBe(0);
  });
});

describe("rate conversion", () => {
  it("converts basis points to percent", () => {
    expect(rateBpsToPercent(300)).toBe(3);
    expect(rateBpsToPercent(1_250)).toBe(12.5);
    expect(rateBpsToPercent(10_000)).toBe(100);
  });

  it("formats basis points as a human-readable percentage", () => {
    expect(formatRateBps(300)).toBe("3%");
    expect(formatRateBps(1_250)).toBe("12.5%");
    expect(formatRateBps(10_000)).toBe("100%");
  });

  it("keeps the basis-points constant honest", () => {
    expect(BPS_PER_HUNDRED_PERCENT).toBe(10_000);
  });
});

describe("idempotency event keys", () => {
  it("builds a stable earning key per payment", () => {
    expect(earningEventKey("ORGP-001")).toBe("orgpay:ORGP-001:earning");
  });

  it("numbers reversal keys so partial refunds never collide", () => {
    expect(reversalEventKey("ORGP-009", 1)).toBe("orgpay:ORGP-009:reversal:1");
    expect(reversalEventKey("ORGP-009", 2)).toBe("orgpay:ORGP-009:reversal:2");
  });
});

describe("clampPageSize", () => {
  it("falls back to the default for invalid input", () => {
    expect(clampPageSize(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize("abc")).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(-5)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("caps oversized values at the maximum", () => {
    expect(clampPageSize(5_000)).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize("5000")).toBe(MAX_PAGE_SIZE);
  });

  it("passes through sane values", () => {
    expect(clampPageSize(10)).toBe(10);
    expect(clampPageSize("50")).toBe(50);
  });
});

describe("maturityDate", () => {
  it("adds the earning maturity period to the occurrence date", () => {
    const occurred = new Date("2026-01-01T00:00:00.000Z");
    const expected = new Date(occurred);
    expected.setDate(expected.getDate() + 7);
    expect(maturityDate(occurred).getTime()).toBe(expected.getTime());
  });
});

describe("maskAccountNumber", () => {
  it("shows only the last four digits", () => {
    expect(maskAccountNumber("0123456789")).toBe("****6789");
  });

  it("masks very short numbers completely", () => {
    expect(maskAccountNumber("123")).toBe("****");
    expect(maskAccountNumber("")).toBe("****");
  });
});
