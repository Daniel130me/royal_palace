import { createHash } from "node:crypto";

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_SCAN_ATTEMPTS = 10;

const RETRY_BASE_MS = 15_000;
const RETRY_CAP_MS = 5 * 60_000;

export function retryDelayMs(attemptCount: number): number | null {
  if (attemptCount >= MAX_SCAN_ATTEMPTS) return null;
  return Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** Math.max(0, attemptCount - 1));
}

export function verifyDocumentBytes(
  bytes: Uint8Array,
  declaration: { contentType: string; sha256Hex: string; sizeBytes: number },
): boolean {
  return (
    bytes.byteLength === declaration.sizeBytes &&
    bytes.byteLength <= MAX_DOCUMENT_BYTES &&
    createHash("sha256").update(bytes).digest("hex") === declaration.sha256Hex &&
    detectContentType(bytes) === declaration.contentType
  );
}

function detectContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "image/png";
  }
  return null;
}
