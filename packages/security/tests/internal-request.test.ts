import { describe, expect, it } from "vitest";

import { createInternalRequestHeaders, verifyInternalRequest } from "../src/internal-request.js";

const secret = Buffer.alloc(32, 3).toString("base64");
const now = new Date("2026-09-28T12:00:00.000Z");
const input = {
  body: '{"sessionId":"test"}',
  method: "POST",
  path: "/v1/internal/auth/session",
  requestId: "request-1",
};

describe("internal request signatures", () => {
  it("accepts an intact request inside the clock window", () => {
    const headers = createInternalRequestHeaders(input, secret, now);
    expect(
      verifyInternalRequest(
        {
          ...input,
          signature: headers["x-rp-internal-signature"],
          timestamp: headers["x-rp-internal-timestamp"],
        },
        secret,
        now,
      ),
    ).toBe(true);
  });

  it("rejects body tampering and expired signatures", () => {
    const headers = createInternalRequestHeaders(input, secret, now);
    const signed = {
      ...input,
      signature: headers["x-rp-internal-signature"],
      timestamp: headers["x-rp-internal-timestamp"],
    };

    expect(verifyInternalRequest({ ...signed, body: "{}" }, secret, now)).toBe(false);
    expect(verifyInternalRequest(signed, secret, new Date(now.getTime() + 61_000))).toBe(false);
  });

  it("binds the optional session reference into the signature", () => {
    const sessionInput = { ...input, sessionReference: "session-a" };
    const headers = createInternalRequestHeaders(sessionInput, secret, now);
    expect(headers["x-rp-session-reference"]).toBe("session-a");
    expect(
      verifyInternalRequest(
        {
          ...sessionInput,
          sessionReference: "session-b",
          signature: headers["x-rp-internal-signature"],
          timestamp: headers["x-rp-internal-timestamp"],
        },
        secret,
        now,
      ),
    ).toBe(false);
  });

  it("binds the optional idempotency key into the signature", () => {
    const idempotentInput = { ...input, idempotencyKey: "booking-request-1" };
    const headers = createInternalRequestHeaders(idempotentInput, secret, now);
    expect(
      verifyInternalRequest(
        {
          ...idempotentInput,
          idempotencyKey: "booking-request-2",
          signature: headers["x-rp-internal-signature"],
          timestamp: headers["x-rp-internal-timestamp"],
        },
        secret,
        now,
      ),
    ).toBe(false);
  });
});
