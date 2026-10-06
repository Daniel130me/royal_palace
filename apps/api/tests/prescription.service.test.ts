import type { CurrentSession, PrescriptionResponse } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import { PrescriptionService } from "../src/pharmacy/application/prescription.service.js";
import type {
  PrescriptionAccessRecord,
  PrescriptionRepository,
} from "../src/pharmacy/domain/prescription.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

function session(
  role: CurrentSession["roles"][number],
  options: { organizationId?: string; principalId?: string } = {},
): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: testConfig.identity.privilegedAssuranceContext,
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships:
      options.organizationId === undefined
        ? []
        : [{ organizationId: options.organizationId, roles: [role] }],
    principalId: options.principalId ?? createOpaqueId(),
    roles: [role],
    sessionId: createOpaqueId(),
  };
}

function prescription(overrides: Partial<PrescriptionAccessRecord> = {}): PrescriptionAccessRecord {
  const patientPrincipalId = createOpaqueId();
  const practitionerPrincipalId = createOpaqueId();
  return {
    appointmentId: createOpaqueId(),
    attestationMethod: null,
    cancelledAt: null,
    clinicalNote: null,
    contentDigest: null,
    createdAt: new Date().toISOString(),
    id: createOpaqueId(),
    items: [
      {
        controlledMedication: false,
        dose: "one tablet",
        duration: "five days",
        frequency: "twice daily",
        id: createOpaqueId(),
        instructions: null,
        lineNumber: 1,
        medicationCode: "12345",
        medicationCodeSystem: "https://example.test/medicines",
        medicationName: "Synthetic medicine",
        quantity: "10",
        quantityUnit: "tablet",
        refillsAuthorized: 0,
        route: "oral",
        strength: "10 mg",
        substitutionAllowed: false,
      },
    ],
    jurisdictionCode: "CA-ON",
    patient: { displayName: "Synthetic Patient", id: createOpaqueId() },
    patientPrincipalId,
    practitioner: { displayName: "Synthetic Practitioner", id: createOpaqueId() },
    practitionerPrincipalId,
    prescriptionNumber: `RX-${createOpaqueId()}`,
    previousPrescriptionId: null,
    routes: [],
    signedAt: null,
    status: "DRAFT",
    statusHistory: [],
    updatedAt: new Date().toISOString(),
    validUntil: null,
    version: 1,
    ...overrides,
  };
}

function createService(repository: Partial<PrescriptionRepository>, enabled = true) {
  return new PrescriptionService(
    repository as PrescriptionRepository,
    new AuthorizationService(new PolicyEngine(), { append: vi.fn(async () => undefined) }),
    {
      ...testConfig,
      clinicalWorkflow: { mode: enabled ? ("synthetic" as const) : ("disabled" as const) },
    },
  );
}

describe("PrescriptionService", () => {
  it("fails closed when the clinical workflow has not been qualified", async () => {
    await expect(
      createService({}, false).get(
        { actor: session("PATIENT"), requestId: "request-disabled" },
        createOpaqueId(),
      ),
    ).rejects.toMatchObject({ code: "clinical_workflow_disabled", status: 503 });
  });

  it("requires an independently verified practitioner before creating a draft", async () => {
    const principalId = createOpaqueId();
    const repository = {
      findPractitionerByPrincipal: vi.fn(async () => ({
        id: createOpaqueId(),
        principalId,
        verificationStatus: "PENDING" as const,
      })),
    };
    await expect(
      createService(repository).createDraft(
        { actor: session("PROVIDER", { principalId }), requestId: "request-unverified" },
        {
          appointmentId: createOpaqueId(),
          items: [],
          jurisdictionCode: "CA-ON",
          patientId: createOpaqueId(),
        },
      ),
    ).rejects.toMatchObject({ code: "practitioner_verification_required", status: 403 });
  });

  it("rejects controlled medication while jurisdiction qualification is deferred", async () => {
    const principalId = createOpaqueId();
    const patientId = createOpaqueId();
    const repository = {
      findPatientPrincipal: vi.fn(async () => createOpaqueId()),
      findPractitionerByPrincipal: vi.fn(async () => ({
        id: createOpaqueId(),
        principalId,
        verificationStatus: "VERIFIED" as const,
      })),
    };
    await expect(
      createService(repository).createDraft(
        { actor: session("PROVIDER", { principalId }), requestId: "request-controlled" },
        {
          appointmentId: createOpaqueId(),
          items: [
            {
              controlledMedication: true,
              dose: "one",
              frequency: "daily",
              medicationName: "Controlled synthetic medicine",
              quantity: "1",
              quantityUnit: "tablet",
              refillsAuthorized: 0,
              substitutionAllowed: false,
            },
          ],
          jurisdictionCode: "CA-ON",
          patientId,
        },
      ),
    ).rejects.toMatchObject({ code: "controlled_medication_disabled", status: 409 });
  });

  it("removes internal principal identifiers from mutation responses", async () => {
    const principalId = createOpaqueId();
    const patientId = createOpaqueId();
    const created = prescription({ practitionerPrincipalId: principalId });
    const service = createService({
      createDraft: vi.fn(async () => created),
      findPatientPrincipal: vi.fn(async () => created.patientPrincipalId),
      findPractitionerByPrincipal: vi.fn(async () => ({
        id: created.practitioner.id,
        principalId,
        verificationStatus: "VERIFIED" as const,
      })),
    });

    const result = await service.createDraft(
      { actor: session("PROVIDER", { principalId }), requestId: "request-create" },
      {
        appointmentId: created.appointmentId,
        items: [
          {
            controlledMedication: false,
            dose: "one tablet",
            frequency: "twice daily",
            medicationName: "Synthetic medicine",
            quantity: "10",
            quantityUnit: "tablet",
            refillsAuthorized: 0,
            substitutionAllowed: false,
          },
        ],
        jurisdictionCode: "CA-ON",
        patientId,
      },
    );

    expect(result).not.toHaveProperty("patientPrincipalId");
    expect(result).not.toHaveProperty("practitionerPrincipalId");
    expect(result).not.toHaveProperty("pharmacyOrganizationId");
  });

  it("creates a stable content digest only after issuer authorization and step-up", async () => {
    const principalId = createOpaqueId();
    const current = prescription({ practitionerPrincipalId: principalId });
    const sign = vi.fn<PrescriptionRepository["sign"]>(async (input) => ({
      ...current,
      attestationMethod: input.attestationMethod,
      contentDigest: input.contentDigest,
      signedAt: new Date().toISOString(),
      status: "SIGNED",
      validUntil: input.validUntil.toISOString(),
      version: 2,
    }));
    const repository = {
      findById: vi.fn(async () => current),
      findPractitionerByPrincipal: vi.fn(async () => ({
        id: current.practitioner.id,
        principalId,
        verificationStatus: "VERIFIED" as const,
      })),
      sign,
    };
    const validUntil = new Date(Date.now() + 86_400_000).toISOString();
    await createService(repository).sign(
      { actor: session("PROVIDER", { principalId }), requestId: "request-sign" },
      current.id,
      1,
      validUntil,
    );
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        attestationMethod: "AUTHENTICATED_PLATFORM_ATTESTATION_V1",
        contentDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("does not expose a prescription to a manager", async () => {
    const current = prescription();
    await expect(
      createService({ findById: vi.fn(async () => current) }).get(
        { actor: session("MANAGER"), requestId: "request-manager" },
        current.id,
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
  });

  it("allows only assigned pharmacy members to accept a routed prescription", async () => {
    const organizationId = createOpaqueId();
    const current = prescription({ pharmacyOrganizationId: organizationId, status: "SENT" });
    const acceptAtPharmacy = vi.fn(async () => ({ ...current, status: "ACCEPTED" as const }));
    const service = createService({ acceptAtPharmacy });

    await expect(
      service.acceptAtPharmacy(
        { actor: session("ORGANIZATION_STAFF"), requestId: "request-unassigned" },
        current.id,
        organizationId,
        1,
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
    await expect(
      service.acceptAtPharmacy(
        {
          actor: session("ORGANIZATION_STAFF", { organizationId }),
          requestId: "request-assigned",
        },
        current.id,
        organizationId,
        1,
      ),
    ).resolves.toMatchObject<Partial<PrescriptionResponse>>({ status: "ACCEPTED" });
  });
});
