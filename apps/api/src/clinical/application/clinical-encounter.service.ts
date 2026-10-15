import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type {
  ClinicalDiagnosisStatus,
  ClinicalDiagnosisType,
  ClinicalDocumentation,
  CurrentSession,
} from "@royal-palace/contracts";
import type { ApiServiceConfig } from "@royal-palace/config/environment";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import {
  CLINICAL_ENCOUNTER_REPOSITORY,
  ClinicalEncounterConflictError,
  type ClinicalDiagnosisDraft,
  type ClinicalEncounterAccessRecord,
  type ClinicalEncounterRepository,
  type ClinicalObservationDraft,
} from "../domain/clinical-encounter.types.js";

export interface ClinicalEncounterContext {
  actor: CurrentSession;
  requestId: string;
}

export interface ClinicalDiagnosisInput {
  code?: string;
  codeSystem?: string;
  display: string;
  onsetAt?: string;
  status: ClinicalDiagnosisStatus;
  type: ClinicalDiagnosisType;
}

export type ClinicalObservationInput = {
  code: string;
  codeSystem?: string;
  display: string;
  observedAt: string;
  unitCode?: string;
} & (
  | { numericValue: string; valueType: "QUANTITY" }
  | { textValue: string; valueType: "TEXT" }
  | { codedValue: string; valueType: "CODED" }
  | { booleanValue: boolean; valueType: "BOOLEAN" }
);

export class ClinicalEncounterFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ClinicalEncounterFlowError";
  }
}

@Injectable()
export class ClinicalEncounterService {
  constructor(
    @Inject(CLINICAL_ENCOUNTER_REPOSITORY)
    private readonly repository: ClinicalEncounterRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async open(
    context: ClinicalEncounterContext,
    input: { appointmentId: string },
    idempotencyKey: string,
  ) {
    this.assertSyntheticClinicalWorkflow();
    const practitioner = await this.requireVerifiedPractitioner(context.actor.principalId);
    const appointment = await this.repository.findAppointmentScope(input.appointmentId);
    if (
      appointment === null ||
      appointment.practitionerId !== practitioner.id ||
      appointment.status !== "CONFIRMED"
    ) {
      throw new ClinicalEncounterFlowError(
        "confirmed_appointment_required",
        409,
        "A confirmed appointment with the treating practitioner is required",
      );
    }
    await this.authorizePractitioner(context, appointment);
    return publicEncounter(
      await this.repository.open({
        actorPrincipalId: context.actor.principalId,
        appointmentId: input.appointmentId,
        idempotencyKey,
        practitionerId: practitioner.id,
        requestHash: requestHash({ appointmentId: input.appointmentId }),
        traceRequestId: context.requestId,
      }),
    );
  }

  async get(context: ClinicalEncounterContext, encounterId: string) {
    this.assertSyntheticClinicalWorkflow();
    const scope = await this.requireScope(encounterId);
    const patientOwner = context.actor.principalId === scope.patientPrincipalId;
    if (patientOwner && scope.status !== "SIGNED") {
      throw new ClinicalEncounterFlowError(
        "clinical_encounter_not_found",
        404,
        "Encounter was not found",
      );
    }
    await this.authorizeRead(context, scope, patientOwner ? "PATIENT_SIGNED" : "PRACTITIONER_FULL");
    const encounter = patientOwner
      ? await this.repository.findPatientRecord({
          encounterId,
          patientPrincipalId: context.actor.principalId,
        })
      : await this.repository.findById(encounterId);
    if (encounter === null) {
      throw new ClinicalEncounterFlowError(
        "clinical_encounter_not_found",
        404,
        "Encounter was not found",
      );
    }
    return publicEncounter(encounter);
  }

  async listForPatient(
    context: ClinicalEncounterContext,
    input: { cursor?: string; limit: number },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: context.actor.principalId,
        patientScopeId: context.actor.principalId,
        practitionerPrincipalId: context.actor.principalId,
        resourceId: context.actor.principalId,
        resourceType: "clinical_encounter_list",
        visibility: "PATIENT_SIGNED",
      },
      policy: AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD,
      requestId: context.requestId,
    });
    const page = await this.repository.listByPatient({
      ...(input.cursor === undefined ? {} : { cursor: decodeCursor(input.cursor) }),
      limit: input.limit,
      patientPrincipalId: context.actor.principalId,
    });
    return { ...page, data: page.data.map(patientEncounter) };
  }

  async listForPractitioner(
    context: ClinicalEncounterContext,
    input: { cursor?: string; limit: number; patientId?: string },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.requireVerifiedPractitioner(context.actor.principalId);
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: context.actor.principalId,
        patientScopeId: context.actor.principalId,
        practitionerPrincipalId: context.actor.principalId,
        resourceId: context.actor.principalId,
        resourceType: "clinical_encounter_list",
        visibility: "PRACTITIONER_FULL",
      },
      policy: AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD,
      requestId: context.requestId,
    });
    const page = await this.repository.listByPractitioner({
      ...(input.cursor === undefined ? {} : { cursor: decodeCursor(input.cursor) }),
      limit: input.limit,
      ...(input.patientId === undefined ? {} : { patientId: input.patientId }),
      practitionerPrincipalId: context.actor.principalId,
    });
    return { ...page, data: page.data.map(publicEncounter) };
  }

  async saveDraft(
    context: ClinicalEncounterContext,
    encounterId: string,
    input: {
      documentation: ClinicalDocumentation;
      expectedLatestRevision: number;
      schemaVersion: number;
    },
    idempotencyKey: string,
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorizeMutation(context, encounterId, "OPEN");
    return publicEncounter(
      await this.repository.saveDraft({
        actorPrincipalId: context.actor.principalId,
        documentation: input.documentation,
        encounterId,
        expectedLatestRevision: input.expectedLatestRevision,
        idempotencyKey,
        requestHash: requestHash({ encounterId, ...input }),
        schemaVersion: input.schemaVersion,
        traceRequestId: context.requestId,
      }),
    );
  }

  async sign(
    context: ClinicalEncounterContext,
    encounterId: string,
    input: {
      diagnoses: readonly ClinicalDiagnosisInput[];
      documentation: ClinicalDocumentation;
      expectedLatestRevision: number;
      expectedVersion: number;
      observations: readonly ClinicalObservationInput[];
      schemaVersion: number;
    },
    idempotencyKey: string,
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorizeMutation(context, encounterId, "OPEN");
    if (
      !input.diagnoses.some(
        (diagnosis) => diagnosis.type === "PRIMARY" && diagnosis.status !== "ENTERED_IN_ERROR",
      )
    ) {
      throw new ClinicalEncounterFlowError(
        "primary_diagnosis_required",
        400,
        "A primary diagnosis is required before signing",
      );
    }
    return publicEncounter(
      await this.repository.sign({
        actorPrincipalId: context.actor.principalId,
        diagnoses: mapDiagnoses(input.diagnoses),
        documentation: input.documentation,
        encounterId,
        expectedLatestRevision: input.expectedLatestRevision,
        expectedVersion: input.expectedVersion,
        idempotencyKey,
        observations: mapObservations(input.observations),
        requestHash: requestHash({ encounterId, ...input }),
        schemaVersion: input.schemaVersion,
        traceRequestId: context.requestId,
      }),
    );
  }

  async addAddendum(
    context: ClinicalEncounterContext,
    encounterId: string,
    input: {
      diagnoses: readonly ClinicalDiagnosisInput[];
      documentation: ClinicalDocumentation;
      expectedLatestRevision: number;
      observations: readonly ClinicalObservationInput[];
      schemaVersion: number;
      supersedesNoteId: string;
    },
    idempotencyKey: string,
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorizeMutation(context, encounterId, "SIGNED");
    const encounter = await this.requireEncounter(encounterId);
    if (
      !encounter.notes.some((note) => note.id === input.supersedesNoteId && note.kind !== "DRAFT")
    ) {
      throw new ClinicalEncounterFlowError(
        "invalid_superseded_note",
        400,
        "An addendum must reference a signed note from this encounter",
      );
    }
    return publicEncounter(
      await this.repository.appendAddendum({
        actorPrincipalId: context.actor.principalId,
        diagnoses: mapDiagnoses(input.diagnoses),
        documentation: input.documentation,
        encounterId,
        expectedLatestRevision: input.expectedLatestRevision,
        idempotencyKey,
        observations: mapObservations(input.observations),
        requestHash: requestHash({ encounterId, ...input }),
        schemaVersion: input.schemaVersion,
        supersedesNoteId: input.supersedesNoteId,
        traceRequestId: context.requestId,
      }),
    );
  }

  private async authorizeMutation(
    context: ClinicalEncounterContext,
    encounterId: string,
    expectedStatus: "OPEN" | "SIGNED",
  ) {
    await this.requireVerifiedPractitioner(context.actor.principalId);
    const scope = await this.requireScope(encounterId);
    await this.authorizePractitioner(context, scope);
    if (scope.status !== expectedStatus) {
      throw new ClinicalEncounterFlowError(
        "clinical_encounter_state_conflict",
        409,
        "Encounter state does not allow this operation",
      );
    }
    return scope;
  }

  private authorizePractitioner(
    context: ClinicalEncounterContext,
    record: Pick<
      ClinicalEncounterAccessRecord,
      "id" | "patientPrincipalId" | "practitionerPrincipalId"
    >,
  ) {
    return this.authorizeRead(context, record, "PRACTITIONER_FULL");
  }

  private authorizeRead(
    context: ClinicalEncounterContext,
    record: Pick<
      ClinicalEncounterAccessRecord,
      "id" | "patientPrincipalId" | "practitionerPrincipalId"
    >,
    visibility: "PATIENT_SIGNED" | "PRACTITIONER_FULL",
  ) {
    return this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: record.patientPrincipalId,
        patientScopeId: record.patientPrincipalId,
        practitionerPrincipalId: record.practitionerPrincipalId,
        resourceId: record.id,
        resourceType: "clinical_encounter",
        visibility,
      },
      policy: AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD,
      requestId: context.requestId,
    });
  }

  private async requireVerifiedPractitioner(principalId: string) {
    const practitioner = await this.repository.findPractitionerByPrincipal(principalId);
    if (practitioner === null || practitioner.verificationStatus !== "VERIFIED") {
      throw new ClinicalEncounterFlowError(
        "verified_practitioner_required",
        403,
        "A verified practitioner is required",
      );
    }
    return practitioner;
  }

  private async requireEncounter(encounterId: string) {
    const encounter = await this.repository.findById(encounterId);
    if (encounter === null) {
      throw new ClinicalEncounterFlowError(
        "clinical_encounter_not_found",
        404,
        "Encounter was not found",
      );
    }
    return encounter;
  }

  private async requireScope(encounterId: string) {
    const encounter = await this.repository.findScopeById(encounterId);
    if (encounter === null) {
      throw new ClinicalEncounterFlowError(
        "clinical_encounter_not_found",
        404,
        "Encounter was not found",
      );
    }
    return encounter;
  }

  private assertSyntheticClinicalWorkflow() {
    if (this.config.clinicalWorkflow.mode !== "synthetic") {
      throw new ClinicalEncounterFlowError(
        "clinical_workflow_disabled",
        503,
        "Clinical workflows are not enabled in this environment",
      );
    }
  }
}

function mapDiagnoses(input: readonly ClinicalDiagnosisInput[]): readonly ClinicalDiagnosisDraft[] {
  return input.map(({ onsetAt, ...diagnosis }) => ({
    ...diagnosis,
    ...(onsetAt === undefined ? {} : { onsetAt: new Date(onsetAt) }),
  }));
}

function mapObservations(
  input: readonly ClinicalObservationInput[],
): readonly ClinicalObservationDraft[] {
  return input.map((observation) => ({
    ...observation,
    observedAt: new Date(observation.observedAt),
  }));
}

function publicEncounter(encounter: ClinicalEncounterAccessRecord) {
  const {
    patientPrincipalId: _patientPrincipalId,
    practitionerPrincipalId: _practitionerPrincipalId,
    ...response
  } = encounter;
  return response;
}

function patientEncounter(encounter: ClinicalEncounterAccessRecord) {
  return {
    ...publicEncounter(encounter),
    notes: encounter.notes.filter((note) => note.kind !== "DRAFT"),
  };
}

function decodeCursor(value: string): { id: string; openedAt: Date } {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (typeof decoded.id !== "string" || typeof decoded.openedAt !== "string") throw new Error();
    const openedAt = new Date(decoded.openedAt);
    if (!Number.isFinite(openedAt.getTime())) throw new Error();
    return { id: decoded.id, openedAt };
  } catch {
    throw new ClinicalEncounterFlowError("invalid_cursor", 400, "Cursor is invalid");
  }
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function mapClinicalEncounterConflict(error: unknown): never | void {
  if (!(error instanceof ClinicalEncounterConflictError)) return;
  throw new ClinicalEncounterFlowError(
    `clinical_${error.reason.toLowerCase()}`,
    409,
    "The encounter changed or the request conflicts with current data",
  );
}
