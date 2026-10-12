export const MAX_SCANNED_PRESCRIPTION_BYTES = 8 * 1024 * 1024;

const CONTENT_TYPES: Readonly<Record<string, readonly string[]>> = {
  "application/pdf": [".pdf"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

export class InvalidScannedPrescriptionError extends Error {
  constructor(readonly code: string) {
    super("Prescription image type, name, size, or digest is not permitted");
    this.name = "InvalidScannedPrescriptionError";
  }
}

export function validateScannedPrescriptionDeclaration(input: {
  declaredContentType: string;
  declaredSha256: string;
  declaredSizeBytes: number;
  originalFilename: string;
}): void {
  const extensions = CONTENT_TYPES[input.declaredContentType];
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
    input.declaredSizeBytes > MAX_SCANNED_PRESCRIPTION_BYTES ||
    !/^[0-9a-f]{64}$/.test(input.declaredSha256)
  ) {
    throw new InvalidScannedPrescriptionError("invalid_scanned_prescription_declaration");
  }
}
