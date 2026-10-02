export interface StoredObjectEvidence {
  checksumSha256: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  versionId: string | null;
}

export interface DocumentStorage {
  signUpload(input: {
    contentType: string;
    expiresInSeconds: number;
    key: string;
    sha256Hex: string;
  }): Promise<{ headers: Readonly<Record<string, string>>; url: string }>;
  inspectQuarantined(key: string): Promise<StoredObjectEvidence | null>;
  signCleanDownload(input: {
    expiresInSeconds: number;
    key: string;
    versionId: string | null;
  }): Promise<string>;
}

export const DOCUMENT_STORAGE = Symbol("DOCUMENT_STORAGE");
