import { describe, expect, it } from "vitest";

import { issueReferralToken, verifyReferralToken } from "../src/referral-token.js";

const key = Buffer.alloc(32, 4).toString("base64");
const claims = {
  keyId: "referral-key-1",
  linkId: "018f3f5a-7b2f-7c3d-8e4f-1234567890ab",
  tokenVersion: 3,
} as const;

describe("referral tokens", () => {
  it("round-trips authenticated claims", () => {
    const token = issueReferralToken(claims, key);
    expect(verifyReferralToken(token, { [claims.keyId]: key })).toEqual(claims);
  });

  it("fails closed for tampering, unknown keys, and malformed values", () => {
    const token = issueReferralToken(claims, key);
    expect(verifyReferralToken(`${token.slice(0, -1)}x`, { [claims.keyId]: key })).toBeNull();
    expect(verifyReferralToken(token, {})).toBeNull();
    expect(verifyReferralToken("not-a-referral-token", { [claims.keyId]: key })).toBeNull();
  });
});
