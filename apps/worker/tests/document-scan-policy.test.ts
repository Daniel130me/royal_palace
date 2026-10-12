import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  MAX_DOCUMENT_BYTES,
  retryDelayMs,
  verifyDocumentBytes,
} from "../src/document-scan/document-scan-policy.js";

const pdf = Buffer.from("%PDF-1.7\nsynthetic test content\n", "utf8");
const declaration = {
  contentType: "application/pdf",
  sha256Hex: createHash("sha256").update(pdf).digest("hex"),
  sizeBytes: pdf.length,
};

describe("document scan policy", () => {
  it("requires exact bytes, size, digest, and detected MIME before release", () => {
    expect(verifyDocumentBytes(pdf, declaration)).toBe(true);
    expect(verifyDocumentBytes(Buffer.from("<html>"), declaration)).toBe(false);
    expect(verifyDocumentBytes(pdf, { ...declaration, contentType: "image/png" })).toBe(false);
    expect(verifyDocumentBytes(pdf, { ...declaration, sizeBytes: MAX_DOCUMENT_BYTES + 1 })).toBe(
      false,
    );
  });

  it("bounds retries and dead letters after the configured attempt limit", () => {
    expect(retryDelayMs(1)).toBe(15_000);
    expect(retryDelayMs(2)).toBe(30_000);
    expect(retryDelayMs(10)).toBeNull();
  });

  it.each([
    ["image/heic", "heic"],
    ["image/heif", "mif1"],
  ])("recognizes an ISO base media declaration for %s", (contentType, brand) => {
    const bytes = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftyp", "ascii"),
      Buffer.from(brand, "ascii"),
      Buffer.alloc(12),
    ]);

    expect(
      verifyDocumentBytes(bytes, {
        contentType,
        sha256Hex: createHash("sha256").update(bytes).digest("hex"),
        sizeBytes: bytes.length,
      }),
    ).toBe(true);
  });
});
