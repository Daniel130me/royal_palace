import type { CurrentSession } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import {
  ClinicalEncounterService,
  mapClinicalEncounterConflict,
} from "../src/clinical/application/clinical-encounter.service.js";
import {
  ClinicalEncounterConflictError,
  type ClinicalEncounterAccessRecord,
  type ClinicalEncounterRepository,
} from "../src/clinical/domain/clinical-encounter.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

function session(
  role: CurrentSession["roles"][number],
  principalId = createOpaqueId(),
): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: null,
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId,
    roles: [role],
    sessionId: createOpaqueId(),
  };
}

function encounter(
  overrides: Partial<ClinicalEncounterAccessRecord> = {},
): ClinicalEncounterAccessRecord {
  const patientPrincipalId = createOpaqueId();
  const practitionerPrincipalId = createOpaqueId();
  return {
    appointmentId: createOpaqueId(),
    encounterNumber: `ENC-${createOpaqueId()}`,
    id: createOpaqueId(),
    relatedActions: {
      allergies: [],
      attachmentReferences: [],
      carePlans: [],
      laboratoryRequestIds: [],
      prescriptionIds: [],
      referrals: [],
    },
    notes: [
      {
        authoredAt: new Date().toISOString(),
        contentHash: "a".repeat(64),
        diagnoses: [],
        documentation: {
          sections: [{ code: "assessment", text: "Synthetic note", title: "Assessment" }],
        },
        id: createOpaqueId(),
        kind: "DRAFT",
        observations: [],
        revision: 1,
        schemaVersion: 1,
        signedAt: null,
        supersedesNoteId: null,
      },
    ],
    openedAt: new Date().toISOString(),
    patient: { displayName: "Synthetic Patient", id: createOpaqueId() },
    patientPrincipalId,
    practitioner: { displayName: "Synthetic Practitioner", id: createOpaqueId() },
    practitionerPrincipalId,
    signedAt: null,
    status: "OPEN",
    updatedAt: new Date().toISOString(),
    version: 1,
    ...overrides,
  };
}

function createService(repository: Partial<ClinicalEncounterRepository>, enabled = true) {
  return new ClinicalEncounterService(
    repository as ClinicalEncounterRepository,
    new AuthorizationService(new PolicyEngine(), { append: vi.fn(async () => undefined) }),
    {
      ...testConfig,
      clinicalWorkflow: { mode: enabled ? ("synthetic" as const) : ("disabled" as const) },
    },
  );
}

describe("ClinicalEncounterService", () => {
  it("fails closed while the clinical workflow is unqualified", async () => {
    await expect(
      createService({}, false).listForPatient(
        { actor: session("PATIENT"), requestId: "request-disabled" },
        { limit: 20 },
      ),
    ).rejects.toMatchObject({ code: "clinical_workflow_disabled", status: 503 });
  });

  it("opens only a confirmed appointment owned by the exact verified practitioner", async () => {
    const principalId = createOpaqueId();
    const practitionerId = createOpaqueId();
    const appointmentId = createOpaqueId();
    const patientPrincipalId = createOpaqueId();
    const current = encounter({
      appointmentId,
      patientPrincipalId,
      practitionerPrincipalId: principalId,
    });
    const open = vi.fn<ClinicalEncounterRepository["open"]>(async () => current);
    const service = createService({
      findAppointmentScope: vi.fn(async () => ({
        id: appointmentId,
        patientPrincipalId,
        practitionerId,
        practitionerPrincipalId: principalId,
        status: "CONFIRMED",
      })),
      findPractitionerByPrincipal: vi.fn(async () => ({
        id: practitionerId,
        principalId,
        verificationStatus: "VERIFIED" as const,
      })),
      open,
    });

    await service.open(
      { actor: session("PROVIDER", principalId), requestId: "request-open" },
      { appointmentId },
      "clinical-open-001",
    );

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId,
        idempotencyKey: "clinical-open-001",
        practitionerId,
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("denies clinical content to managers, support, administrators, and organizations", async () => {
    const current = encounter({ status: "SIGNED", signedAt: new Date().toISOString() });
    const service = createService({
      findScopeById: vi.fn(async () => current),
    });
    for (const role of ["MANAGER", "SUPPORT", "ADMINISTRATOR", "ORGANIZATION_ADMIN"] as const) {
      await expect(
        service.get({ actor: session(role), requestId: `request-${role}` }, current.id),
      ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
    }
  });

  it("returns only signed and addendum notes to the patient owner", async () => {
    const patientPrincipalId = createOpaqueId();
    const draft = encounter().notes[0]!;
    const signed = {
      ...draft,
      id: createOpaqueId(),
      kind: "SIGNED" as const,
      signedAt: new Date().toISOString(),
    };
    const current = encounter({
      notes: [draft, signed],
      patientPrincipalId,
      signedAt: signed.signedAt,
      status: "SIGNED",
    });
    const result = await createService({
      findPatientRecord: vi.fn(async () => ({
        ...current,
        notes: current.notes.filter((note) => note.kind !== "DRAFT"),
      })),
      findScopeById: vi.fn(async () => current),
    }).get(
      { actor: session("PATIENT", patientPrincipalId), requestId: "request-patient" },
      current.id,
    );
    expect(result.notes).toEqual([signed]);
  });

  it("loads the patient's signed encounter by exact appointment without scanning a page", async () => {
    const patientPrincipalId = createOpaqueId();
    const appointmentId = createOpaqueId();
    const draft = encounter().notes[0]!;
    const signed = {
      ...draft,
      id: createOpaqueId(),
      kind: "SIGNED" as const,
      signedAt: new Date().toISOString(),
    };
    const current = encounter({
      appointmentId,
      notes: [signed],
      patientPrincipalId,
      signedAt: signed.signedAt,
      status: "SIGNED",
    });
    const findPatientRecordByAppointment = vi.fn<
      ClinicalEncounterRepository["findPatientRecordByAppointment"]
    >(async () => current);

    const result = await createService({
      findPatientRecordByAppointment,
    }).getForPatientByAppointment(
      { actor: session("PATIENT", patientPrincipalId), requestId: "request-patient-appointment" },
      appointmentId,
    );

    expect(findPatientRecordByAppointment).toHaveBeenCalledWith({
      appointmentId,
      patientPrincipalId,
    });
    expect(result.id).toBe(current.id);
    expect(result.notes).toEqual([signed]);
  });

  it("denies a different practitioner even if they have the provider role", async () => {
    const current = encounter();
    await expect(
      createService({ findScopeById: vi.fn(async () => current) }).get(
        { actor: session("PROVIDER"), requestId: "request-other-provider" },
        current.id,
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
  });

  it("requires an active primary diagnosis before signing", async () => {
    const principalId = createOpaqueId();
    const current = encounter({ practitionerPrincipalId: principalId });
    const service = createService({
      findById: vi.fn(async () => current),
      findScopeById: vi.fn(async () => current),
      findPractitionerByPrincipal: vi.fn(async () => ({
        id: current.practitioner.id,
        principalId,
        verificationStatus: "VERIFIED" as const,
      })),
    });
    await expect(
      service.sign(
        { actor: session("PROVIDER", principalId), requestId: "request-sign" },
        current.id,
        {
          diagnoses: [{ display: "Synthetic", status: "ACTIVE", type: "SECONDARY" }],
          documentation: { sections: [{ code: "plan", text: "Synthetic plan", title: "Plan" }] },
          expectedLatestRevision: 1,
          expectedVersion: 1,
          observations: [],
          schemaVersion: 1,
        },
        "clinical-sign-001",
      ),
    ).rejects.toMatchObject({ code: "primary_diagnosis_required", status: 400 });
  });

  it("creates a governed related action for the exact verified practitioner", async () => {
    const principalId = createOpaqueId();
    const current = encounter({ practitionerPrincipalId: principalId, status: "SIGNED" });
    const createRelatedAction = vi.fn<ClinicalEncounterRepository["createRelatedAction"]>(
      async () => current,
    );
    const service = createService({
      createRelatedAction,
      findScopeById: vi.fn(async () => current),
      findPractitionerByPrincipal: vi.fn(async () => ({
        id: current.practitioner.id,
        principalId,
        verificationStatus: "VERIFIED" as const,
      })),
    });

    await service.createRelatedAction(
      { actor: session("PROVIDER", principalId), requestId: "request-related-action" },
      current.id,
      {
        kind: "REFERRAL",
        priority: "URGENT",
        reason: "Synthetic specialist review",
        specialtyCode: "synthetic-specialty",
      },
      "related-action-001",
    );

    expect(createRelatedAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ kind: "REFERRAL", priority: "URGENT" }),
        actorPrincipalId: principalId,
        encounterId: current.id,
        idempotencyKey: "related-action-001",
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("builds the patient roster only through the authenticated verified practitioner scope", async () => {
    const principalId = createOpaqueId();
    const listPatientsByPractitioner = vi.fn<
      ClinicalEncounterRepository["listPatientsByPractitioner"]
    >(async () => ({ data: [], pageInfo: { endCursor: null, hasNextPage: false } }));
    const service = createService({
      findPractitionerByPrincipal: vi.fn(async () => ({
        id: createOpaqueId(),
        principalId,
        verificationStatus: "VERIFIED" as const,
      })),
      listPatientsByPractitioner,
    });

    await service.listPatientsForPractitioner(
      { actor: session("PROVIDER", principalId), requestId: "request-patient-roster" },
      { limit: 20, query: "Synthetic" },
    );

    expect(listPatientsByPractitioner).toHaveBeenCalledWith({
      limit: 20,
      practitionerPrincipalId: principalId,
      query: "Synthetic",
    });
  });

  it("lists referrals only in the requested authenticated-practitioner direction", async () => {
    const principalId = createOpaqueId();
    const listReferralsByPractitioner = vi.fn<
      ClinicalEncounterRepository["listReferralsByPractitioner"]
    >(async () => ({ data: [], pageInfo: { endCursor: null, hasNextPage: false } }));
    const service = createService({
      findPractitionerByPrincipal: vi.fn(async () => ({
        id: createOpaqueId(),
        principalId,
        verificationStatus: "VERIFIED" as const,
      })),
      listReferralsByPractitioner,
    });

    await service.listReferralsForPractitioner(
      { actor: session("PROVIDER", principalId), requestId: "request-referrals" },
      { direction: "RECEIVED", limit: 20 },
    );

    expect(listReferralsByPractitioner).toHaveBeenCalledWith({
      direction: "RECEIVED",
      limit: 20,
      practitionerPrincipalId: principalId,
    });
  });

  it("resolves a named referral recipient from verified practitioner data", async () => {
    const principalId = createOpaqueId();
    const recipientPractitionerId = createOpaqueId();
    const current = encounter({ practitionerPrincipalId: principalId, status: "SIGNED" });
    const createRelatedAction = vi.fn<ClinicalEncounterRepository["createRelatedAction"]>(
      async () => current,
    );
    const service = createService({
      createRelatedAction,
      findScopeById: vi.fn(async () => current),
      findPractitionerByPrincipal: vi.fn(async () => ({
        id: current.practitioner.id,
        principalId,
        verificationStatus: "VERIFIED" as const,
      })),
      findVerifiedPractitionerById: vi.fn(async () => ({
        displayName: "Verified Recipient",
        id: recipientPractitionerId,
        principalId: createOpaqueId(),
      })),
    });

    await service.createRelatedAction(
      { actor: session("PROVIDER", principalId), requestId: "request-named-referral" },
      current.id,
      {
        kind: "REFERRAL",
        priority: "ROUTINE",
        reason: "Synthetic review",
        recipientPractitionerId,
        specialtyCode: "synthetic-specialty",
      },
      "named-referral-001",
    );

    expect(createRelatedAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          recipientName: "Verified Recipient",
          recipientPractitionerId,
        }),
      }),
    );
  });

  it("uses optimistic concurrency and idempotency for recipient decisions", async () => {
    const principalId = createOpaqueId();
    const referralId = createOpaqueId();
    const transitionReceivedReferral = vi.fn<
      ClinicalEncounterRepository["transitionReceivedReferral"]
    >(async () => ({
      createdAt: new Date().toISOString(),
      id: referralId,
      patient: { displayName: "Synthetic Patient", id: createOpaqueId() },
      priority: "ROUTINE",
      reason: "Synthetic review",
      recipient: { displayName: "Recipient", id: createOpaqueId() },
      recipientName: "Recipient",
      sender: { displayName: "Sender", id: createOpaqueId() },
      specialtyCode: "synthetic-specialty",
      status: "ACCEPTED",
      version: 2,
    }));
    const service = createService({
      findPractitionerByPrincipal: vi.fn(async () => ({
        id: createOpaqueId(),
        principalId,
        verificationStatus: "VERIFIED" as const,
      })),
      transitionReceivedReferral,
    });

    await service.decideReceivedReferral(
      { actor: session("PROVIDER", principalId), requestId: "request-decide-referral" },
      referralId,
      { decision: "ACCEPTED", expectedVersion: 1 },
      "decide-referral-001",
    );

    expect(transitionReceivedReferral).toHaveBeenCalledWith(
      expect.objectContaining({
        actorPrincipalId: principalId,
        decision: "ACCEPTED",
        expectedVersion: 1,
        idempotencyKey: "decide-referral-001",
        referralId,
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("maps idempotency and concurrency conflicts without exposing database details", () => {
    for (const reason of [
      "IDEMPOTENCY_CONFLICT",
      "REVISION_CONFLICT",
      "VERSION_CONFLICT",
    ] as const) {
      expect(() =>
        mapClinicalEncounterConflict(new ClinicalEncounterConflictError(reason)),
      ).toThrow(expect.objectContaining({ code: `clinical_${reason.toLowerCase()}`, status: 409 }));
    }
  });
});
