import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type {
  CurrentSession,
  PharmacyPrescriptionResponse,
  PrescriptionResponse,
} from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import {
  PRESCRIPTION_REPOSITORY,
  PrescriptionConflictError,
  type PrescriptionDispenseLineInput,
  type PrescriptionDraftInput,
  type PrescriptionRepository,
  type PrescriptionSubstitutionInput,
} from "../domain/prescription.types.js";

const SYNTHETIC_ATTESTATION_METHOD = "AUTHENTICATED_PLATFORM_ATTESTATION_V1";
const DISPENSE_CLOCK_SKEW_MS = 5 * 60_000;
const DISPENSE_RECORDING_WINDOW_MS = 24 * 60 * 60_000;

export interface PrescriptionRequestContext {
  actor: CurrentSession;
  requestId: string;
}

export class PrescriptionFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PrescriptionFlowError";
  }
}

@Injectable()
export class PrescriptionService {
  constructor(
    @Inject(PRESCRIPTION_REPOSITORY) private readonly repository: PrescriptionRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async createDraft(context: PrescriptionRequestContext, draft: PrescriptionDraftInput) {
    this.assertSyntheticClinicalWorkflow();
    const practitioner = await this.requireVerifiedPractitioner(context.actor.principalId);
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        practitionerPrincipalId: practitioner.principalId,
        resourceId: practitioner.id,
        resourceType: "prescription",
      },
      policy: AUTHORIZATION_POLICY.MANAGE_OWN_PRESCRIPTION,
      requestId: context.requestId,
    });
    await this.requirePatient(draft.patientId);
    this.assertDraftPolicy(draft);
    return publicPrescription(
      await this.repository.createDraft({
        actorPrincipalId: context.actor.principalId,
        draft,
        practitionerId: practitioner.id,
      }),
    );
  }

  async updateDraft(
    context: PrescriptionRequestContext,
    prescriptionId: string,
    expectedVersion: number,
    draft: PrescriptionDraftInput,
  ) {
    this.assertSyntheticClinicalWorkflow();
    const current = await this.requirePrescription(prescriptionId);
    await this.authorizeIssuer(context, current);
    await this.requirePatient(draft.patientId);
    this.assertDraftPolicy(draft);
    return publicPrescription(
      this.requireMutation(
        await this.repository.updateDraft({
          actorPrincipalId: context.actor.principalId,
          draft,
          expectedVersion,
          prescriptionId,
        }),
        "prescription_draft_conflict",
      ),
    );
  }

  async sign(
    context: PrescriptionRequestContext,
    prescriptionId: string,
    expectedVersion: number,
    validUntilValue: string,
  ) {
    this.assertSyntheticClinicalWorkflow();
    const current = await this.requirePrescription(prescriptionId);
    await this.authorizeIssuer(context, current);
    await this.requireVerifiedPractitioner(context.actor.principalId);
    this.assertPrivilegedAssurance(context.actor);
    if (current.status !== "DRAFT") {
      throw new PrescriptionFlowError("prescription_not_draft", 409, "Prescription is not a draft");
    }
    const validUntil = parseFutureInstant(validUntilValue);
    const contentDigest = prescriptionDigest(current, validUntil);
    return publicPrescription(
      this.requireMutation(
        await this.repository.sign({
          actorPrincipalId: context.actor.principalId,
          attestationMethod: SYNTHETIC_ATTESTATION_METHOD,
          contentDigest,
          expectedVersion,
          prescriptionId,
          validUntil,
        }),
        "prescription_sign_conflict",
      ),
    );
  }

  async get(context: PrescriptionRequestContext, prescriptionId: string) {
    this.assertSyntheticClinicalWorkflow();
    const prescription = await this.requirePrescription(prescriptionId);
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: prescription.patientPrincipalId,
        ...(prescription.pharmacyOrganizationId === undefined
          ? {}
          : { pharmacyOrganizationId: prescription.pharmacyOrganizationId }),
        practitionerPrincipalId: prescription.practitionerPrincipalId,
        resourceId: prescription.id,
        resourceType: "prescription",
      },
      policy: AUTHORIZATION_POLICY.VIEW_PRESCRIPTION,
      requestId: context.requestId,
    });
    const isPatient =
      context.actor.roles.includes("PATIENT") &&
      context.actor.principalId === prescription.patientPrincipalId;
    const isIssuer =
      context.actor.roles.includes("PROVIDER") &&
      context.actor.principalId === prescription.practitionerPrincipalId;
    return isPatient || isIssuer
      ? publicPrescription(prescription)
      : pharmacyPrescription(prescription);
  }

  async routeToPharmacy(
    context: PrescriptionRequestContext,
    prescriptionId: string,
    pharmacyOrganizationId: string,
    expectedVersion: number,
  ) {
    this.assertSyntheticClinicalWorkflow();
    const prescription = await this.requirePrescription(prescriptionId);
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: prescription.patientPrincipalId,
        resourceId: prescription.id,
        resourceType: "prescription",
      },
      policy: AUTHORIZATION_POLICY.ROUTE_PRESCRIPTION,
      requestId: context.requestId,
    });
    return publicPrescription(
      this.requireMutation(
        await this.repository.routeToPharmacy({
          actorPrincipalId: context.actor.principalId,
          expectedVersion,
          pharmacyOrganizationId,
          prescriptionId,
        }),
        "prescription_route_conflict",
      ),
    );
  }

  async acceptAtPharmacy(
    context: PrescriptionRequestContext,
    prescriptionId: string,
    organizationId: string,
    expectedVersion: number,
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId: prescriptionId, resourceType: "prescription" },
      policy: AUTHORIZATION_POLICY.MANAGE_PHARMACY_PRESCRIPTION,
      requestId: context.requestId,
    });
    return pharmacyPrescription(
      this.requireMutation(
        await this.repository.acceptAtPharmacy({
          actorPrincipalId: context.actor.principalId,
          expectedVersion,
          organizationId,
          prescriptionId,
        }),
        "prescription_accept_conflict",
      ),
    );
  }

  async proposeSubstitution(
    context: PrescriptionRequestContext,
    prescriptionId: string,
    organizationId: string,
    expectedVersion: number,
    proposal: PrescriptionSubstitutionInput,
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId: prescriptionId, resourceType: "prescription" },
      policy: AUTHORIZATION_POLICY.MANAGE_PHARMACY_PRESCRIPTION,
      requestId: context.requestId,
    });
    return this.requireMutation(
      await this.repository.createSubstitutionProposal({
        actorPrincipalId: context.actor.principalId,
        expectedVersion,
        organizationId,
        prescriptionId,
        proposal,
      }),
      "prescription_substitution_conflict",
    );
  }

  async recordPatientSubstitutionDecision(
    context: PrescriptionRequestContext,
    prescriptionId: string,
    proposalId: string,
    expectedVersion: number,
    outcome: "APPROVED" | "DECLINED",
  ) {
    this.assertSyntheticClinicalWorkflow();
    const prescription = await this.requirePrescription(prescriptionId);
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: prescription.patientPrincipalId,
        resourceId: prescription.id,
        resourceType: "prescription",
      },
      policy: AUTHORIZATION_POLICY.ROUTE_PRESCRIPTION,
      requestId: context.requestId,
    });
    return this.requireMutation(
      await this.repository.decideSubstitution({
        actorPrincipalId: context.actor.principalId,
        decisionKind: "PATIENT_CONSENT",
        expectedVersion,
        outcome,
        prescriptionId,
        proposalId,
      }),
      "prescription_substitution_decision_conflict",
    );
  }

  async recordPractitionerSubstitutionDecision(
    context: PrescriptionRequestContext,
    prescriptionId: string,
    proposalId: string,
    expectedVersion: number,
    outcome: "APPROVED" | "DECLINED",
  ) {
    this.assertSyntheticClinicalWorkflow();
    const prescription = await this.requirePrescription(prescriptionId);
    await this.authorizeIssuer(context, prescription);
    await this.requireVerifiedPractitioner(context.actor.principalId);
    this.assertPrivilegedAssurance(context.actor);
    return this.requireMutation(
      await this.repository.decideSubstitution({
        actorPrincipalId: context.actor.principalId,
        decisionKind: "PRACTITIONER_APPROVAL",
        expectedVersion,
        outcome,
        prescriptionId,
        proposalId,
      }),
      "prescription_substitution_decision_conflict",
    );
  }

  async dispense(
    context: PrescriptionRequestContext,
    prescriptionId: string,
    organizationId: string,
    input: {
      dispenseEventId: string;
      expectedVersion: number;
      lines: readonly PrescriptionDispenseLineInput[];
      occurredAt: string;
    },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId: prescriptionId, resourceType: "prescription" },
      policy: AUTHORIZATION_POLICY.MANAGE_PHARMACY_PRESCRIPTION,
      requestId: context.requestId,
    });
    const occurredAt = parseDispenseInstant(input.occurredAt);
    const requestDigest = createHash("sha256")
      .update(
        JSON.stringify({
          lines: [...input.lines].sort((left, right) =>
            left.prescriptionItemId.localeCompare(right.prescriptionItemId),
          ),
          occurredAt: occurredAt.toISOString(),
          organizationId,
          prescriptionId,
        }),
      )
      .digest("hex");
    return this.requireMutation(
      await this.repository.dispense({
        actorPrincipalId: context.actor.principalId,
        dispenseEventId: input.dispenseEventId,
        expectedVersion: input.expectedVersion,
        lines: input.lines,
        occurredAt,
        organizationId,
        prescriptionId,
        requestDigest,
      }),
      "prescription_dispense_conflict",
    );
  }

  async returnToPatient(
    context: PrescriptionRequestContext,
    prescriptionId: string,
    organizationId: string,
    expectedVersion: number,
    reasonCode: string,
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId: prescriptionId, resourceType: "prescription" },
      policy: AUTHORIZATION_POLICY.MANAGE_PHARMACY_PRESCRIPTION,
      requestId: context.requestId,
    });
    return pharmacyPrescription(
      this.requireMutation(
        await this.repository.returnToPatient({
          actorPrincipalId: context.actor.principalId,
          expectedVersion,
          organizationId,
          prescriptionId,
          reasonCode,
        }),
        "prescription_return_conflict",
      ),
    );
  }

  async listDispenseEvents(
    context: PrescriptionRequestContext,
    prescriptionId: string,
    input: { cursor?: string; limit: number },
  ) {
    this.assertSyntheticClinicalWorkflow();
    const prescription = await this.requirePrescription(prescriptionId);
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        patientPrincipalId: prescription.patientPrincipalId,
        ...(prescription.pharmacyOrganizationId === undefined
          ? {}
          : { pharmacyOrganizationId: prescription.pharmacyOrganizationId }),
        practitionerPrincipalId: prescription.practitionerPrincipalId,
        resourceId: prescription.id,
        resourceType: "prescription",
      },
      policy: AUTHORIZATION_POLICY.VIEW_PRESCRIPTION,
      requestId: context.requestId,
    });
    return this.repository.listDispenseEvents({
      ...(input.cursor === undefined ? {} : { cursor: decodeEventCursor(input.cursor) }),
      limit: input.limit,
      prescriptionId,
    });
  }

  async cancel(
    context: PrescriptionRequestContext,
    prescriptionId: string,
    expectedVersion: number,
    reasonCode: string,
  ) {
    this.assertSyntheticClinicalWorkflow();
    const current = await this.requirePrescription(prescriptionId);
    await this.authorizeIssuer(context, current);
    return publicPrescription(
      this.requireMutation(
        await this.repository.cancel({
          actorPrincipalId: context.actor.principalId,
          expectedVersion,
          prescriptionId,
          reasonCode,
        }),
        "prescription_cancel_conflict",
      ),
    );
  }

  async listPharmacyQueue(
    context: PrescriptionRequestContext,
    organizationId: string,
    input: { cursor?: string; limit: number },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId: organizationId, resourceType: "pharmacy_queue" },
      policy: AUTHORIZATION_POLICY.MANAGE_PHARMACY_PRESCRIPTION,
      requestId: context.requestId,
    });
    const page = await this.repository.listPharmacyQueue({
      ...(input.cursor === undefined ? {} : { cursor: decodeCursor(input.cursor) }),
      limit: input.limit,
      organizationId,
    });
    return { ...page, data: page.data.map(pharmacyPrescription) };
  }

  async expireDue(context: PrescriptionRequestContext, limit: number) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId: "due-prescriptions", resourceType: "prescription" },
      policy: AUTHORIZATION_POLICY.EXPIRE_PRESCRIPTIONS,
      requestId: context.requestId,
    });
    return this.repository.expireDue({
      actorPrincipalId: context.actor.principalId,
      limit,
      now: new Date(),
    });
  }

  private async authorizeIssuer(
    context: PrescriptionRequestContext,
    prescription: Awaited<ReturnType<PrescriptionService["requirePrescription"]>>,
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        practitionerPrincipalId: prescription.practitionerPrincipalId,
        resourceId: prescription.id,
        resourceType: "prescription",
      },
      policy: AUTHORIZATION_POLICY.MANAGE_OWN_PRESCRIPTION,
      requestId: context.requestId,
    });
  }

  private assertDraftPolicy(draft: PrescriptionDraftInput): void {
    if (draft.items.some((item) => item.controlledMedication)) {
      throw new PrescriptionFlowError(
        "controlled_medication_disabled",
        409,
        "Controlled-medication prescribing is not enabled",
      );
    }
  }

  private assertSyntheticClinicalWorkflow(): void {
    if (this.config.clinicalWorkflow.mode !== "synthetic") {
      throw new PrescriptionFlowError(
        "clinical_workflow_disabled",
        503,
        "Clinical workflows are not enabled in this environment",
      );
    }
  }

  private assertPrivilegedAssurance(session: CurrentSession): void {
    const ageMilliseconds = Date.now() - new Date(session.authenticatedAt).getTime();
    if (
      session.assuranceContext !== this.config.identity.privilegedAssuranceContext ||
      !Number.isFinite(ageMilliseconds) ||
      ageMilliseconds < 0 ||
      ageMilliseconds > this.config.identity.privilegedAuthMaxAgeSeconds * 1000
    ) {
      throw new PrescriptionFlowError(
        "step_up_required",
        403,
        "Step-up authentication is required",
      );
    }
  }

  private async requirePatient(patientId: string): Promise<void> {
    if ((await this.repository.findPatientPrincipal(patientId)) === null) {
      throw new PrescriptionFlowError("patient_not_found", 404, "Patient was not found");
    }
  }

  private async requirePrescription(prescriptionId: string) {
    const prescription = await this.repository.findById(prescriptionId);
    if (prescription === null) {
      throw new PrescriptionFlowError("prescription_not_found", 404, "Prescription was not found");
    }
    return prescription;
  }

  private async requireVerifiedPractitioner(principalId: string) {
    const practitioner = await this.repository.findPractitionerByPrincipal(principalId);
    if (practitioner === null) {
      throw new PrescriptionFlowError(
        "practitioner_profile_required",
        403,
        "A practitioner profile is required",
      );
    }
    if (practitioner.verificationStatus !== "VERIFIED") {
      throw new PrescriptionFlowError(
        "practitioner_verification_required",
        403,
        "Practitioner verification is required",
      );
    }
    return practitioner;
  }

  private requireMutation<T>(value: T | null, code: string): T {
    if (value !== null) return value;
    throw new PrescriptionFlowError(code, 409, "Prescription changed or is unavailable");
  }
}

function prescriptionDigest(prescription: PrescriptionResponse, validUntil: Date): string {
  const canonical = {
    appointmentId: prescription.appointmentId,
    clinicalNote: prescription.clinicalNote,
    items: prescription.items.map((item) => ({
      controlledMedication: item.controlledMedication,
      dose: item.dose,
      duration: item.duration,
      frequency: item.frequency,
      instructions: item.instructions,
      lineNumber: item.lineNumber,
      medicationCode: item.medicationCode,
      medicationCodeSystem: item.medicationCodeSystem,
      medicationName: item.medicationName,
      quantity: item.quantity,
      quantityUnit: item.quantityUnit,
      refillsAuthorized: item.refillsAuthorized,
      route: item.route,
      strength: item.strength,
      substitutionAllowed: item.substitutionAllowed,
    })),
    jurisdictionCode: prescription.jurisdictionCode,
    patientId: prescription.patient.id,
    practitionerId: prescription.practitioner.id,
    previousPrescriptionId: prescription.previousPrescriptionId,
    validUntil: validUntil.toISOString(),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function parseFutureInstant(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed <= new Date()) {
    throw new PrescriptionFlowError("invalid_validity", 400, "Prescription validity is invalid");
  }
  return parsed;
}

function parseDispenseInstant(value: string): Date {
  const parsed = new Date(value);
  const now = Date.now();
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.getTime() > now + DISPENSE_CLOCK_SKEW_MS ||
    parsed.getTime() < now - DISPENSE_RECORDING_WINDOW_MS
  ) {
    throw new PrescriptionFlowError(
      "invalid_dispense_time",
      400,
      "Dispense time is outside the accepted recording window",
    );
  }
  return parsed;
}

function decodeCursor(value: string): { id: string; sentAt: Date } {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
      sentAt?: unknown;
    };
    if (typeof decoded.id !== "string" || typeof decoded.sentAt !== "string") throw new Error();
    const sentAt = new Date(decoded.sentAt);
    if (!Number.isFinite(sentAt.getTime())) throw new Error();
    return { id: decoded.id, sentAt };
  } catch {
    throw new PrescriptionFlowError("invalid_cursor", 400, "Cursor is invalid");
  }
}

function decodeEventCursor(value: string): { id: string; occurredAt: Date } {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
      occurredAt?: unknown;
    };
    if (typeof decoded.id !== "string" || typeof decoded.occurredAt !== "string") throw new Error();
    const occurredAt = new Date(decoded.occurredAt);
    if (!Number.isFinite(occurredAt.getTime())) throw new Error();
    return { id: decoded.id, occurredAt };
  } catch {
    throw new PrescriptionFlowError("invalid_cursor", 400, "Cursor is invalid");
  }
}

function publicPrescription<T extends PrescriptionResponse>(prescription: T): PrescriptionResponse {
  const {
    patientPrincipalId: _patientPrincipalId,
    pharmacyOrganizationId: _pharmacyOrganizationId,
    practitionerPrincipalId: _practitionerPrincipalId,
    ...response
  } = prescription as T & {
    patientPrincipalId?: string;
    pharmacyOrganizationId?: string;
    practitionerPrincipalId?: string;
  };
  return response;
}

/** Pharmacy views deliberately omit consultation linkage and private clinical notes. */
function pharmacyPrescription<T extends PrescriptionResponse>(
  prescription: T,
): PharmacyPrescriptionResponse {
  const {
    appointmentId: _appointment,
    clinicalNote: _clinicalNote,
    ...response
  } = publicPrescription(prescription);
  return response;
}

export function mapPrescriptionConflict(error: unknown): never | void {
  if (!(error instanceof PrescriptionConflictError)) return;
  throw new PrescriptionFlowError(
    `prescription_${error.reason.toLowerCase()}`,
    409,
    "Prescription changed or is unavailable",
  );
}
