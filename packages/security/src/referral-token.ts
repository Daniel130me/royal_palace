import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "rpr1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface ReferralTokenClaims {
  keyId: string;
  linkId: string;
  tokenVersion: number;
}

export function issueReferralToken(claims: ReferralTokenClaims, keyBase64: string): string {
  assertClaims(claims);
  const unsigned = `${TOKEN_PREFIX}.${claims.keyId}.${claims.linkId}.${claims.tokenVersion}`;
  return `${unsigned}.${signature(unsigned, keyBase64).toString("base64url")}`;
}

/** Returns null for every malformed, unknown-key, or tampered token. */
export function verifyReferralToken(
  token: string,
  signingKeys: Readonly<Record<string, string>>,
): ReferralTokenClaims | null {
  if (token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [prefix, keyId, linkId, rawVersion, rawSignature] = parts;
  if (
    prefix !== TOKEN_PREFIX ||
    keyId === undefined ||
    !KEY_ID_PATTERN.test(keyId) ||
    linkId === undefined ||
    !UUID_PATTERN.test(linkId) ||
    rawVersion === undefined ||
    !/^[1-9]\d{0,8}$/.test(rawVersion) ||
    rawSignature === undefined
  ) {
    return null;
  }
  const key = signingKeys[keyId];
  if (key === undefined) return null;
  const tokenVersion = Number(rawVersion);
  const unsigned = `${prefix}.${keyId}.${linkId}.${rawVersion}`;
  const expected = signature(unsigned, key);
  let provided: Buffer;
  try {
    provided = Buffer.from(rawSignature, "base64url");
  } catch {
    return null;
  }
  if (provided.byteLength !== expected.byteLength || !timingSafeEqual(provided, expected)) {
    return null;
  }
  return { keyId, linkId, tokenVersion };
}

function signature(unsigned: string, keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.byteLength !== 32) throw new Error("Referral signing key must contain 32 bytes");
  return createHmac("sha256", key).update(unsigned, "utf8").digest();
}

function assertClaims(claims: ReferralTokenClaims): void {
  if (!KEY_ID_PATTERN.test(claims.keyId)) throw new Error("Invalid referral key ID");
  if (!UUID_PATTERN.test(claims.linkId)) throw new Error("Invalid referral link ID");
  if (!Number.isSafeInteger(claims.tokenVersion) || claims.tokenVersion < 1) {
    throw new Error("Invalid referral token version");
  }
}
