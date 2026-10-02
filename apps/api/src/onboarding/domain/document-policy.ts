import type { OnboardingApplicationKind } from "@royal-palace/contracts";

export const MAX_APPLICATION_DOCUMENT_BYTES = 25 * 1024 * 1024;

const CONTENT_TYPES = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
} as const;

const PURPOSES: Readonly<Record<OnboardingApplicationKind, readonly string[]>> = {
  ORGANIZATION: ["REGISTRATION_EVIDENCE", "SUPPORTING_EVIDENCE"],
  PRACTITIONER: ["PROFESSIONAL_CREDENTIAL", "IDENTITY_EVIDENCE", "SUPPORTING_EVIDENCE"],
  PATIENT: ["IDENTITY_EVIDENCE"],
};

export class InvalidDocumentError extends Error {
  constructor(readonly code: string) {
    super("Document type, purpose, or size is not permitted");
    this.name = "InvalidDocumentError";
  }
}

export function validateDocumentDeclaration(input: {
  kind: OnboardingApplicationKind;
  purpose: string;
  originalFilename: string;
  declaredContentType: string;
  declaredSizeBytes: number;
}): void {
  if (!PURPOSES[input.kind].includes(input.purpose)) {
    throw new InvalidDocumentError("invalid_document_purpose");
  }
  const extensions = CONTENT_TYPES[input.declaredContentType as keyof typeof CONTENT_TYPES];
  const filename = input.originalFilename.normalize("NFC");
  if (
    extensions === undefined ||
    !extensions.some((extension) => filename.toLowerCase().endsWith(extension)) ||
    filename !== filename.trim() ||
    Array.from(filename).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || character === "/" || character === "\\";
    }) ||
    !Number.isSafeInteger(input.declaredSizeBytes) ||
    input.declaredSizeBytes < 1 ||
    input.declaredSizeBytes > MAX_APPLICATION_DOCUMENT_BYTES
  ) {
    throw new InvalidDocumentError("invalid_document_declaration");
  }
}
