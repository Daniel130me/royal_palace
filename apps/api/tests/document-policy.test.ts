import { describe, expect, it } from "vitest";

import {
  InvalidDocumentError,
  MAX_APPLICATION_DOCUMENT_BYTES,
  validateDocumentDeclaration,
} from "../src/onboarding/domain/document-policy.js";

const valid = {
  kind: "PRACTITIONER" as const,
  purpose: "PROFESSIONAL_CREDENTIAL",
  originalFilename: "licence.pdf",
  declaredContentType: "application/pdf",
  declaredSizeBytes: 1024,
};

describe("application document declaration", () => {
  it("accepts a controlled purpose with a matching file extension and MIME", () => {
    expect(() => validateDocumentDeclaration(valid)).not.toThrow();
  });

  it.each([
    { ...valid, kind: "PATIENT" as const },
    { ...valid, originalFilename: "../licence.pdf" },
    { ...valid, originalFilename: "licence.pdf\u0000.png" },
    { ...valid, originalFilename: "licence.exe" },
    { ...valid, declaredContentType: "text/html" },
    { ...valid, declaredSizeBytes: MAX_APPLICATION_DOCUMENT_BYTES + 1 },
  ])("rejects an unsafe or mismatched declaration", (input) => {
    expect(() => validateDocumentDeclaration(input)).toThrow(InvalidDocumentError);
  });
});
