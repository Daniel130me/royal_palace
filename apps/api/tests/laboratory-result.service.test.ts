import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { CurrentSession } from "@royal-palace/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { LaboratoryResultService } from "../src/laboratory/application/laboratory-result.service.js";
import type {
  LaboratoryResultAccessRecord,
  LaboratoryResultRepository,
} from "../src/laboratory/domain/laboratory-result.types.js";

const patientPrincipalId = "0199a18e-a400-7000-8000-000000000101";
const practitionerPrincipalId = "0199a18e-a400-7000-8000-000000000102";
const organizationId = "0199a18e-a400-7000-8000-000000000103";
const resultId = "0199a18e-a400-7000-8000-000000000104";
const attachmentId = "0199a18e-a400-7000-8000-000000000108";
const patientId = "0199a18e-a400-7000-8000-000000000109";

function session(role: "PATIENT" | "PROVIDER" | "ORGANIZATION_STAFF"): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: "urn:test:mfa",
    authenticatedAt: "2026-10-13T00:00:00.000Z",
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships:
      role === "ORGANIZATION_STAFF"
        ? [{ organizationId, organizationType: "LABORATORY", roles: [role] }]
        : [],
    principalId: role === "PATIENT" ? patientPrincipalId : practitionerPrincipalId,
    roles: [role],
    sessionId: "0199a18e-a400-7000-8000-000000000105",
  };
}

function result(status: LaboratoryResultAccessRecord["status"]): LaboratoryResultAccessRecord {
  return {
    attachments: [],
    bookingId: "0199a18e-a400-7000-8000-000000000106",
    components: [],
    createdAt: "2026-10-13T00:00:00.000Z",
    criticalResults: [],
    id: resultId,
    interpretation: null,
    laboratory: { displayName: "Synthetic Laboratory", id: organizationId },
    laboratoryOrganizationId: organizationId,
    patient: { displayName: "Synthetic Patient", id: patientPrincipalId },
    patientPrincipalId,
    practitioner: { displayName: "Synthetic Practitioner", id: practitionerPrincipalId },
    practitionerPrincipalId,
    previousResultId: null,
    publishedAt: status === "PUBLISHED" ? "2026-10-13T01:00:00.000Z" : null,
    resultNumber: "LABRES-TEST",
    service: { code: "LAB-CBC", id: "0199a18e-a400-7000-8000-000000000107", name: "CBC" },
    status,
    summaryFlag: "NORMAL",
    updatedAt: "2026-10-13T00:00:00.000Z",
    verifiedAt: status === "PUBLISHED" ? "2026-10-13T01:00:00.000Z" : null,
    version: 1,
  };
}

describe("LaboratoryResultService", () => {
  const authorize = vi.fn().mockResolvedValue(undefined);
  const repository = {
    acknowledgeCritical: vi.fn(),
    createAmendment: vi.fn(),
    completeAttachmentUpload: vi.fn(),
    createAttachmentUpload: vi.fn(),
    createDraft: vi.fn(),
    findCriticalById: vi.fn(),
    findAttachmentById: vi.fn(),
    findResultById: vi.fn(),
    listCriticalByPractitioner: vi.fn(),
    listResults: vi.fn(),
    publish: vi.fn(),
    rejectAttachmentUpload: vi.fn(),
    resolveCritical: vi.fn(),
    transitionResult: vi.fn(),
    updateDraft: vi.fn(),
  } satisfies Record<keyof LaboratoryResultRepository, ReturnType<typeof vi.fn>>;
  const storage = {
    inspectQuarantined: vi.fn(),
    signCleanDownload: vi.fn(),
    signUpload: vi.fn(),
  };
  const service = new LaboratoryResultService(
    repository as unknown as LaboratoryResultRepository,
    { authorize } as unknown as AuthorizationService,
    storage,
    {
      appEnvironment: "test",
      clinicalWorkflow: { mode: "synthetic" },
      laboratory: { criticalAcknowledgementSeconds: 1800 },
      objectStorage: { downloadTtlSeconds: 300, uploadTtlSeconds: 600 },
    } as ApiServiceConfig,
  );

  beforeEach(() => vi.clearAllMocks());

  it("conceals an unpublished result from its patient after relationship authorization", async () => {
    repository.findResultById.mockResolvedValue(result("DRAFT"));
    await expect(
      service.get({ actor: session("PATIENT"), requestId: "request-1" }, resultId),
    ).rejects.toMatchObject({
      code: "laboratory_result_not_found",
      status: 404,
    });
    expect(authorize).toHaveBeenCalledOnce();
  });

  it("publishes through the configured acknowledgement window and strips internal principals", async () => {
    repository.publish.mockResolvedValue(result("PUBLISHED"));
    const response = await service.publish(
      { actor: session("ORGANIZATION_STAFF"), requestId: "request-2" },
      organizationId,
      resultId,
      1,
    );
    expect(repository.publish).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledgementSeconds: 1800, expectedVersion: 1 }),
    );
    expect(response).not.toHaveProperty("patientPrincipalId");
    expect(response).not.toHaveProperty("practitionerPrincipalId");
    expect(response).not.toHaveProperty("laboratoryOrganizationId");
  });

  it("narrows a practitioner result list by patient without weakening practitioner ownership", async () => {
    repository.listResults.mockResolvedValue({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    });

    await service.listForPractitioner(
      { actor: session("PROVIDER"), requestId: "request-practitioner-patient-results" },
      { limit: 5, patientId },
    );

    expect(repository.listResults).toHaveBeenCalledWith({
      limit: 5,
      patientId,
      practitionerPrincipalId,
      status: "PUBLISHED",
    });
  });

  it("verifies quarantine evidence before scheduling an attachment scan", async () => {
    repository.findAttachmentById.mockResolvedValue({
      cleanObjectKey: null,
      cleanVersionId: null,
      declaredContentType: "application/pdf",
      declaredSha256: "a".repeat(64),
      declaredSizeBytes: 100,
      id: attachmentId,
      laboratoryOrganizationId: organizationId,
      originalFilename: "result.pdf",
      patientPrincipalId,
      practitionerPrincipalId,
      resultId,
      resultStatus: "DRAFT",
      status: "AWAITING_UPLOAD",
      storageObjectKey: `laboratory-result-attachments/${attachmentId}`,
      uploadExpiresAt: new Date(Date.now() + 60_000),
    });
    storage.inspectQuarantined.mockResolvedValue({
      checksumSha256: Buffer.from("a".repeat(64), "hex").toString("base64"),
      contentType: "application/pdf",
      sizeBytes: 100,
      versionId: "quarantine-version",
    });
    repository.completeAttachmentUpload.mockResolvedValue(true);

    await expect(
      service.completeAttachmentUpload(
        { actor: session("ORGANIZATION_STAFF"), requestId: "request-3" },
        organizationId,
        resultId,
        attachmentId,
      ),
    ).resolves.toEqual({ status: "QUARANTINED" });
    expect(repository.completeAttachmentUpload).toHaveBeenCalledWith({
      attachmentId,
      organizationId,
      quarantineVersionId: "quarantine-version",
    });
  });
});
