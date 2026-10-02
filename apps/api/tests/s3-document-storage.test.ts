import { describe, expect, it } from "vitest";

import { S3DocumentStorage } from "../src/onboarding/infrastructure/s3-document-storage.js";
import { testConfig } from "./test-config.js";

describe("S3 document upload signing", () => {
  it("pins the checksum, content type, and conditional single-write header", async () => {
    const adapter = new S3DocumentStorage(testConfig);
    const sha256Hex = "a".repeat(64);
    const signed = await adapter.signUpload({
      contentType: "application/pdf",
      expiresInSeconds: 300,
      key: "application-documents/0199f31d-6afb-77ca-8eb0-a08c5e9edfa7",
      sha256Hex,
    });
    const url = new URL(signed.url);
    const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];

    expect(url.pathname).toContain("test-quarantine/application-documents/");
    expect(signedHeaders).toContain("if-none-match");
    expect(signedHeaders).toContain("x-amz-checksum-sha256");
    expect(signed.headers["if-none-match"]).toBe("*");
    expect(signed.headers["x-amz-checksum-sha256"]).toBe(
      Buffer.from(sha256Hex, "hex").toString("base64"),
    );
  });
});
