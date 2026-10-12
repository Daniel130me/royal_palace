import type { CurrentSession, ScannedPrescriptionDetail } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import type { AuthorizationAuditRepository } from "../src/authorization/domain/authorization.types.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import { ScannedPrescriptionService } from "../src/pharmacy/application/scanned-prescription.service.js";
import type { ScannedPrescriptionRepository } from "../src/pharmacy/domain/scanned-prescription.types.js";
import type { DocumentStorage } from "../src/platform/documents/document-storage.port.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

const checksumHex = "a".repeat(64);

function patientSession(principalId = createOpaqueId()): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: null,
    authenticatedAt: "2026-10-12T00:00:00.000Z",
    authenticationMethods: ["pwd"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId,
    roles: ["PATIENT"],
    sessionId: createOpaqueId(),
  };
}

function publicDetail(id = createOpaqueId()): ScannedPrescriptionDetail {
  return {
    createdAt: "2026-10-12T00:00:00.000Z",
    declaredContentType: "application/pdf",
    declaredSizeBytes: 128,
    history: [],
    id,
    originalFilename: "prescription.pdf",
    patientNote: null,
    pharmacyOrganizationId: null,
    prescriberFacility: null,
    prescriberName: null,
    status: "AWAITING_UPLOAD",
    statusReasonCode: null,
    updatedAt: "2026-10-12T00:00:00.000Z",
    uploadNumber: `RX-UPLOAD-${id.toUpperCase()}`,
    version: 1,
  };
}

function fixture(detail = publicDetail()) {
  const hiddenRecord = {
    ...detail,
    cleanObjectKey: null,
    cleanVersionId: null,
    declaredSha256: checksumHex,
    storageObjectKey: `scanned-prescriptions/${detail.id}`,
    uploadExpiresAt: new Date(Date.now() + 60_000),
  };
  const repository: ScannedPrescriptionRepository = {
    completeUpload: vi.fn(async () => true),
    createUpload: vi.fn(async () => ({
      prescription: detail,
      storageObjectKey: `scanned-prescriptions/${detail.id}`,
    })),
    findOwned: vi.fn(async () => hiddenRecord),
    listOwned: vi.fn(async () => ({
      data: [detail],
      pageInfo: { endCursor: null, hasNextPage: false },
    })),
    rejectUpload: vi.fn(async () => undefined),
  };
  const storage: DocumentStorage = {
    inspectQuarantined: vi.fn(async () => ({
      checksumSha256: Buffer.from(checksumHex, "hex").toString("base64"),
      contentType: "application/pdf",
      sizeBytes: 128,
      versionId: "quarantine-version-1",
    })),
    signCleanDownload: vi.fn(async () => "https://storage.invalid/clean"),
    signUpload: vi.fn(async () => ({
      headers: { "content-type": "application/pdf" },
      url: "https://storage.invalid/quarantine",
    })),
  };
  const append = vi.fn<AuthorizationAuditRepository["append"]>(async () => undefined);
  const service = new ScannedPrescriptionService(
    new AuthorizationService(new PolicyEngine(), { append }),
    repository,
    storage,
    testConfig,
  );
  return { append, hiddenRecord, repository, service, storage };
}

describe("ScannedPrescriptionService", () => {
  it("reserves an opaque private object and returns only a short-lived upload contract", async () => {
    const actor = patientSession();
    const { repository, service, storage } = fixture();

    const result = await service.createUploadIntent(
      { actor, requestId: "request-create" },
      {
        declaredContentType: "application/pdf",
        declaredSha256: checksumHex,
        declaredSizeBytes: 128,
        originalFilename: "prescription.pdf",
        patientNote: null,
        pharmacyOrganizationId: null,
        prescriberFacility: null,
        prescriberName: null,
      },
    );

    expect(repository.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({ patientPrincipalId: actor.principalId }),
    );
    expect(storage.signUpload).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringMatching(/^scanned-prescriptions\//) }),
    );
    expect(result.prescription).not.toHaveProperty("storageObjectKey");
    expect(result.upload.url).toBe("https://storage.invalid/quarantine");
  });

  it("rejects uploaded bytes when object-store evidence differs from the declaration", async () => {
    const actor = patientSession();
    const { repository, service, storage } = fixture();
    vi.mocked(storage.inspectQuarantined).mockResolvedValueOnce({
      checksumSha256: Buffer.from("b".repeat(64), "hex").toString("base64"),
      contentType: "application/pdf",
      sizeBytes: 128,
      versionId: "quarantine-version-1",
    });

    await expect(
      service.completeUpload({ actor, requestId: "request-complete" }, publicDetail().id),
    ).rejects.toMatchObject({
      code: "prescription_upload_invalid",
      status: 409,
    });
    expect(repository.rejectUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        patientPrincipalId: actor.principalId,
        reasonCode: "UPLOAD_EVIDENCE_MISMATCH",
      }),
    );
    expect(repository.completeUpload).not.toHaveBeenCalled();
  });

  it("never exposes internal storage coordinates in patient detail responses", async () => {
    const actor = patientSession();
    const detail = publicDetail();
    const { service } = fixture(detail);

    const result = await service.findOwned({ actor, requestId: "request-read" }, detail.id);

    expect(result).not.toHaveProperty("storageObjectKey");
    expect(result).not.toHaveProperty("cleanObjectKey");
    expect(result).not.toHaveProperty("cleanVersionId");
    expect(result).not.toHaveProperty("declaredSha256");
  });

  it("does not issue a download URL until the clean object is available", async () => {
    const actor = patientSession();
    const detail = publicDetail();
    const { service, storage } = fixture(detail);

    await expect(
      service.downloadOwned({ actor, requestId: "request-download" }, detail.id),
    ).rejects.toMatchObject({
      code: "prescription_document_not_available",
      status: 404,
    });
    expect(storage.signCleanDownload).not.toHaveBeenCalled();
  });
});
