import { describe, expect, it } from "vitest";

import { resolvePaymentTransition } from "../src/scheduling/domain/payment-state-machine.js";

describe("payment state machine", () => {
  it("does not let delayed pending or failure events reopen a successful payment", () => {
    expect(resolvePaymentTransition("SUCCEEDED", "PENDING")).toEqual({
      apply: false,
      target: "PENDING",
    });
    expect(resolvePaymentTransition("SUCCEEDED", "FAILED")).toEqual({
      apply: false,
      target: "FAILED",
    });
  });

  it("allows multiple uniquely identified partial refunds and a final refund", () => {
    expect(resolvePaymentTransition("SUCCEEDED", "PARTIALLY_REFUNDED")).toEqual({
      apply: true,
      target: "PARTIALLY_REFUNDED",
    });
    expect(resolvePaymentTransition("PARTIALLY_REFUNDED", "PARTIALLY_REFUNDED")).toEqual({
      apply: true,
      target: "PARTIALLY_REFUNDED",
    });
    expect(resolvePaymentTransition("PARTIALLY_REFUNDED", "REFUNDED")).toEqual({
      apply: true,
      target: "REFUNDED",
    });
  });

  it("accepts a delayed success after a failure but not after a final refund", () => {
    expect(resolvePaymentTransition("FAILED", "SUCCEEDED").apply).toBe(true);
    expect(resolvePaymentTransition("REFUNDED", "SUCCEEDED").apply).toBe(false);
  });

  it("keeps reversal, dispute, cancellation, and expiry transitions monotonic", () => {
    expect(resolvePaymentTransition("PENDING", "EXPIRED")).toEqual({
      apply: true,
      target: "EXPIRED",
    });
    expect(resolvePaymentTransition("EXPIRED", "CANCELLED")).toEqual({
      apply: true,
      target: "CANCELLED",
    });
    expect(resolvePaymentTransition("SUCCEEDED", "REVERSED")).toEqual({
      apply: true,
      target: "REVERSED",
    });
    expect(resolvePaymentTransition("SUCCEEDED", "DISPUTED")).toEqual({
      apply: true,
      target: "DISPUTED",
    });
    expect(resolvePaymentTransition("DISPUTED", "REFUNDED")).toEqual({
      apply: true,
      target: "REFUNDED",
    });
  });
});
