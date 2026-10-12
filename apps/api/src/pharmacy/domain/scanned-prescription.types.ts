import type {
  ScannedPrescriptionDetail,
  ScannedPrescriptionListResponse,
} from "@royal-palace/contracts";

export interface ScannedPrescriptionRepository {
  completeUpload(input: {
    patientPrincipalId: string;
    prescriptionId: string;
    quarantineVersionId: string | null;
  }): Promise<boolean>;
  createUpload(input: {
    declaredContentType: string;
    declaredSha256: string;
    declaredSizeBytes: number;
    originalFilename: string;
    patientNote: string | null;
    patientPrincipalId: string;
    pharmacyOrganizationId: string | null;
    prescriberFacility: string | null;
    prescriberName: string | null;
    uploadExpiresAt: Date;
  }): Promise<{ prescription: ScannedPrescriptionDetail; storageObjectKey: string }>;
  findOwned(input: { patientPrincipalId: string; prescriptionId: string }): Promise<
    | (ScannedPrescriptionDetail & {
        cleanObjectKey: string | null;
        cleanVersionId: string | null;
        declaredSha256: string;
        storageObjectKey: string | null;
        uploadExpiresAt: Date | null;
      })
    | null
  >;
  listOwned(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    patientPrincipalId: string;
  }): Promise<ScannedPrescriptionListResponse>;
  rejectUpload(input: {
    patientPrincipalId: string;
    prescriptionId: string;
    reasonCode: string;
  }): Promise<void>;
}

export const SCANNED_PRESCRIPTION_REPOSITORY = Symbol("SCANNED_PRESCRIPTION_REPOSITORY");
