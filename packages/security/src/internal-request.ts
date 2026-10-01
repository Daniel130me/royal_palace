import { createHmac } from "node:crypto";

import { sha256Hex, timingSafeStringEqual } from "./values.js";

const SIGNATURE_VERSION = "v3";
export const INTERNAL_TIMESTAMP_HEADER = "x-rp-internal-timestamp";
export const INTERNAL_SIGNATURE_HEADER = "x-rp-internal-signature";
export const INTERNAL_SESSION_REFERENCE_HEADER = "x-rp-session-reference";
const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 60;

export interface InternalRequestInput {
  body: string;
  idempotencyKey?: string;
  method: string;
  path: string;
  requestId: string;
  sessionReference?: string;
}

interface VerificationInput extends InternalRequestInput {
  signature: string | undefined;
  timestamp: string | undefined;
}

export function createInternalRequestHeaders(
  input: InternalRequestInput,
  secretBase64: string,
  now = new Date(),
): Record<string, string> {
  const timestamp = Math.floor(now.getTime() / 1000).toString();
  return {
    [INTERNAL_TIMESTAMP_HEADER]: timestamp,
    [INTERNAL_SIGNATURE_HEADER]: sign(input, secretBase64, timestamp),
    ...(input.sessionReference === undefined
      ? {}
      : { [INTERNAL_SESSION_REFERENCE_HEADER]: input.sessionReference }),
  };
}

export function verifyInternalRequest(
  input: VerificationInput,
  secretBase64: string,
  now = new Date(),
  maxClockSkewSeconds = DEFAULT_MAX_CLOCK_SKEW_SECONDS,
): boolean {
  if (input.timestamp === undefined || input.signature === undefined) return false;
  if (!/^\d{10}$/.test(input.timestamp)) return false;
  const requestSeconds = Number(input.timestamp);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (Math.abs(nowSeconds - requestSeconds) > maxClockSkewSeconds) return false;

  const expected = sign(input, secretBase64, input.timestamp);
  return timingSafeStringEqual(input.signature, expected);
}

function sign(input: InternalRequestInput, secretBase64: string, timestamp: string): string {
  const canonical = [
    SIGNATURE_VERSION,
    timestamp,
    input.method.toUpperCase(),
    input.path,
    input.requestId,
    input.sessionReference ?? "",
    input.idempotencyKey ?? "",
    sha256Hex(input.body),
  ].join("\n");
  return createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(canonical, "utf8")
    .digest("base64url");
}
