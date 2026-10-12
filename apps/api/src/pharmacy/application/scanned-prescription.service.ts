import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { CurrentSession } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import {
  DOCUMENT_STORAGE,
  type DocumentStorage,
} from "../../platform/documents/document-storage.port.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import {
  SCANNED_PRESCRIPTION_REPOSITORY,
  type ScannedPrescriptionRepository,
} from "../domain/scanned-prescription.types.js";
import { validateScannedPrescriptionDeclaration } from "../domain/scanned-prescription-policy.js";
import { ScannedPrescriptionPersistenceError } from "../infrastructure/prisma-scanned-prescription.repository.js";

const MAX_LIST_LIMIT = 50;

export interface ScannedPrescriptionRequestContext {
  actor: CurrentSession;
  requestId: string;
}

export class ScannedPrescriptionFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ScannedPrescriptionFlowError";
  }
}

@Injectable()
export class ScannedPrescriptionService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(SCANNED_PRESCRIPTION_REPOSITORY)
    private readonly repository: ScannedPrescriptionRepository,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async createUploadIntent(
    context: ScannedPrescriptionRequestContext,
    input: {
      declaredContentType: string;
      declaredSha256: string;
      declaredSizeBytes: number;
      originalFilename: string;
      patientNote: string | null;
      pharmacyOrganizationId: string | null;
      prescriberFacility: string | null;
      prescriberName: string | null;
    },
  ) {
    await this.authorizeOwner(context, "new");
    validateScannedPrescriptionDeclaration(input);
    const expiresAt = new Date(Date.now() + this.config.objectStorage.uploadTtlSeconds * 1000);
    try {
      const reserved = await this.repository.createUpload({
        ...input,
        patientPrincipalId: context.actor.principalId,
        uploadExpiresAt: expiresAt,
      });
      const signed = await this.storage.signUpload({
        contentType: input.declaredContentType,
        expiresInSeconds: this.config.objectStorage.uploadTtlSeconds,
        key: reserved.storageObjectKey,
        sha256Hex: input.declaredSha256,
      });
      return {
        prescription: reserved.prescription,
        upload: {
          expiresAt: expiresAt.toISOString(),
          headers: signed.headers,
          method: "PUT" as const,
          url: signed.url,
        },
      };
    } catch (error) {
      if (error instanceof ScannedPrescriptionPersistenceError) {
        if (error.reason === "PHARMACY_NOT_AVAILABLE") {
          throw new ScannedPrescriptionFlowError(
            "pharmacy_not_available",
            404,
            "The selected pharmacy is unavailable",
          );
        }
        if (error.reason === "ACTIVE_UPLOAD_LIMIT") {
          throw new ScannedPrescriptionFlowError(
            "active_upload_limit",
            409,
            "Wait for an existing prescription upload to finish before adding another",
          );
        }
        throw new ScannedPrescriptionFlowError("patient_not_found", 404, "Patient not found");
      }
      throw error;
    }
  }

  async completeUpload(context: ScannedPrescriptionRequestContext, prescriptionId: string) {
    await this.authorizeOwner(context, prescriptionId);
    const prescription = await this.requireOwned(context, prescriptionId);
    if (
      prescription.status !== "AWAITING_UPLOAD" ||
      prescription.storageObjectKey === null ||
      prescription.uploadExpiresAt === null ||
      prescription.uploadExpiresAt.getTime() <= Date.now()
    ) {
      throw conflict("prescription_not_uploadable", "Prescription upload is unavailable");
    }
    const evidence = await this.storage.inspectQuarantined(prescription.storageObjectKey);
    if (evidence === null) {
      throw conflict("prescription_upload_missing", "Prescription upload is incomplete");
    }
    const expectedChecksum = Buffer.from(prescription.declaredSha256, "hex").toString("base64");
    if (
      evidence.checksumSha256 !== expectedChecksum ||
      evidence.sizeBytes !== prescription.declaredSizeBytes ||
      evidence.contentType !== prescription.declaredContentType ||
      ((this.config.appEnvironment === "staging" || this.config.appEnvironment === "production") &&
        evidence.versionId === null)
    ) {
      await this.repository.rejectUpload({
        patientPrincipalId: context.actor.principalId,
        prescriptionId,
        reasonCode: "UPLOAD_EVIDENCE_MISMATCH",
      });
      throw conflict("prescription_upload_invalid", "Prescription upload failed verification");
    }
    const changed = await this.repository.completeUpload({
      patientPrincipalId: context.actor.principalId,
      prescriptionId,
      quarantineVersionId: evidence.versionId,
    });
    if (!changed) {
      throw conflict("prescription_not_uploadable", "Prescription upload is unavailable");
    }
    return { status: "QUARANTINED" as const };
  }

  async findOwned(context: ScannedPrescriptionRequestContext, prescriptionId: string) {
    await this.authorizeOwner(context, prescriptionId);
    const record = await this.requireOwned(context, prescriptionId);
    return toPublicDetail(record);
  }

  async listOwned(context: ScannedPrescriptionRequestContext, limit: number, cursor?: string) {
    await this.authorizeOwner(context, "list");
    return this.repository.listOwned({
      ...(cursor === undefined ? {} : { cursor: decodeCursor(cursor) }),
      limit: Math.min(Math.max(limit, 1), MAX_LIST_LIMIT),
      patientPrincipalId: context.actor.principalId,
    });
  }

  async downloadOwned(context: ScannedPrescriptionRequestContext, prescriptionId: string) {
    await this.authorizeOwner(context, prescriptionId);
    const record = await this.requireOwned(context, prescriptionId);
    if (record.cleanObjectKey === null) {
      throw new ScannedPrescriptionFlowError(
        "prescription_document_not_available",
        404,
        "Prescription document is unavailable",
      );
    }
    return this.signDownload(record.cleanObjectKey, record.cleanVersionId);
  }

  async listForPharmacy(
    context: ScannedPrescriptionRequestContext,
    pharmacyOrganizationId: string,
    limit: number,
    cursor?: string,
  ) {
    await this.authorizePharmacy(context, pharmacyOrganizationId, "list");
    return this.repository.listForPharmacy({
      ...(cursor === undefined ? {} : { cursor: decodeCursor(cursor) }),
      limit: Math.min(Math.max(limit, 1), MAX_LIST_LIMIT),
      pharmacyOrganizationId,
    });
  }

  async findForPharmacy(
    context: ScannedPrescriptionRequestContext,
    pharmacyOrganizationId: string,
    prescriptionId: string,
  ) {
    await this.authorizePharmacy(context, pharmacyOrganizationId, prescriptionId);
    return stripPharmacyStorage(
      await this.requireForPharmacy(pharmacyOrganizationId, prescriptionId),
    );
  }

  async downloadForPharmacy(
    context: ScannedPrescriptionRequestContext,
    pharmacyOrganizationId: string,
    prescriptionId: string,
  ) {
    await this.authorizePharmacy(context, pharmacyOrganizationId, prescriptionId);
    const record = await this.requireForPharmacy(pharmacyOrganizationId, prescriptionId);
    if (record.cleanObjectKey === null) {
      throw new ScannedPrescriptionFlowError(
        "prescription_document_not_available",
        404,
        "Prescription document is unavailable",
      );
    }
    return this.signDownload(record.cleanObjectKey, record.cleanVersionId);
  }

  async transitionReview(
    context: ScannedPrescriptionRequestContext,
    input: {
      expectedVersion: number;
      patientVisibleNote: string | null;
      pharmacyOrganizationId: string;
      prescriptionId: string;
      toStatus: "UNDER_REVIEW" | "MORE_INFORMATION_REQUIRED" | "APPROVED" | "REJECTED";
    },
  ) {
    await this.authorizePharmacy(context, input.pharmacyOrganizationId, input.prescriptionId);
    const current = await this.requireForPharmacy(
      input.pharmacyOrganizationId,
      input.prescriptionId,
    );
    const allowedFrom: Record<typeof input.toStatus, readonly string[]> = {
      APPROVED: ["UNDER_REVIEW"],
      MORE_INFORMATION_REQUIRED: ["UNDER_REVIEW"],
      REJECTED: ["UNDER_REVIEW"],
      UNDER_REVIEW: ["CLEAN", "MORE_INFORMATION_REQUIRED"],
    };
    if (!allowedFrom[input.toStatus].includes(current.status)) {
      throw conflict("invalid_review_transition", "Review status cannot be changed this way");
    }
    if (
      ["MORE_INFORMATION_REQUIRED", "REJECTED"].includes(input.toStatus) &&
      (input.patientVisibleNote === null || input.patientVisibleNote.length < 2)
    ) {
      throw new ScannedPrescriptionFlowError(
        "patient_note_required",
        400,
        "A patient-visible explanation is required",
      );
    }
    const result = await this.repository.transitionReview({
      actorPrincipalId: context.actor.principalId,
      expectedVersion: input.expectedVersion,
      patientVisibleNote: input.patientVisibleNote,
      pharmacyOrganizationId: input.pharmacyOrganizationId,
      prescriptionId: input.prescriptionId,
      reasonCode: reviewReason(input.toStatus),
      toStatus: input.toStatus,
    });
    if (result === null) {
      throw conflict("review_version_conflict", "Review changed; reload and retry");
    }
    return result;
  }

  private async signDownload(cleanObjectKey: string, cleanVersionId: string | null) {
    if (
      (this.config.appEnvironment === "staging" || this.config.appEnvironment === "production") &&
      cleanVersionId === null
    ) {
      throw new ScannedPrescriptionFlowError(
        "prescription_document_not_available",
        404,
        "Prescription document is unavailable",
      );
    }
    const expiresAt = new Date(Date.now() + this.config.objectStorage.downloadTtlSeconds * 1000);
    const url = await this.storage.signCleanDownload({
      expiresInSeconds: this.config.objectStorage.downloadTtlSeconds,
      key: cleanObjectKey,
      versionId: cleanVersionId,
    });
    return { expiresAt: expiresAt.toISOString(), url };
  }

  private authorizeOwner(context: ScannedPrescriptionRequestContext, resourceId: string) {
    return this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: context.actor.principalId,
        resourceId,
        resourceType: "scanned_prescription",
      },
      policy: AUTHORIZATION_POLICY.MANAGE_OWN_SCANNED_PRESCRIPTION,
      requestId: context.requestId,
    });
  }

  private authorizePharmacy(
    context: ScannedPrescriptionRequestContext,
    organizationId: string,
    resourceId: string,
  ) {
    return this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId, resourceType: "pharmacy_scanned_prescription" },
      policy: AUTHORIZATION_POLICY.MANAGE_PHARMACY_SCANNED_PRESCRIPTION,
      requestId: context.requestId,
    });
  }

  private async requireOwned(context: ScannedPrescriptionRequestContext, prescriptionId: string) {
    const record = await this.repository.findOwned({
      patientPrincipalId: context.actor.principalId,
      prescriptionId,
    });
    if (record === null) {
      throw new ScannedPrescriptionFlowError(
        "scanned_prescription_not_found",
        404,
        "Scanned prescription not found",
      );
    }
    return record;
  }

  private async requireForPharmacy(pharmacyOrganizationId: string, prescriptionId: string) {
    const record = await this.repository.findForPharmacy({
      pharmacyOrganizationId,
      prescriptionId,
    });
    if (record === null) {
      throw new ScannedPrescriptionFlowError(
        "scanned_prescription_not_found",
        404,
        "Scanned prescription not found",
      );
    }
    return record;
  }
}

function toPublicDetail(record: Awaited<ReturnType<ScannedPrescriptionRepository["findOwned"]>>) {
  if (record === null) throw new Error("Scanned prescription is required");
  const {
    cleanObjectKey: _clean,
    cleanVersionId: _version,
    declaredSha256: _sha,
    storageObjectKey: _storage,
    uploadExpiresAt: _expiry,
    ...detail
  } = record;
  return detail;
}

function stripPharmacyStorage(
  record: NonNullable<Awaited<ReturnType<ScannedPrescriptionRepository["findForPharmacy"]>>>,
) {
  const { cleanObjectKey: _clean, cleanVersionId: _version, ...detail } = record;
  return detail;
}

function reviewReason(
  status: "UNDER_REVIEW" | "MORE_INFORMATION_REQUIRED" | "APPROVED" | "REJECTED",
) {
  return {
    APPROVED: "PHARMACY_REVIEW_APPROVED",
    MORE_INFORMATION_REQUIRED: "PHARMACY_REQUESTED_INFORMATION",
    REJECTED: "PHARMACY_REVIEW_REJECTED",
    UNDER_REVIEW: "PHARMACY_REVIEW_STARTED",
  }[status];
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (typeof value !== "object" || value === null) throw new Error("invalid");
    const createdAt = "createdAt" in value ? new Date(String(value.createdAt)) : new Date(NaN);
    const id = "id" in value ? String(value.id) : "";
    if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id))
      throw new Error("invalid");
    return { createdAt, id };
  } catch {
    throw new ScannedPrescriptionFlowError("invalid_cursor", 400, "Cursor is invalid");
  }
}

function conflict(code: string, message: string) {
  return new ScannedPrescriptionFlowError(code, 409, message);
}
