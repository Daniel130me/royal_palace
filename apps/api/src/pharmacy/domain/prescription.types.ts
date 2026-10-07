import type {
  PrescriptionDispenseEventListResponse,
  PrescriptionDispenseEventResponse,
  PrescriptionListResponse,
  PrescriptionResponse,
  PrescriptionSubstitutionProposalResponse,
  SubstitutionDecisionOutcome,
} from "@royal-palace/contracts";

export interface PrescriptionItemInput {
  controlledMedication: boolean;
  dose: string;
  duration?: string;
  frequency: string;
  instructions?: string;
  medicationCode?: string;
  medicationCodeSystem?: string;
  medicationName: string;
  quantity: string;
  quantityUnit: string;
  refillsAuthorized: number;
  route?: string;
  strength?: string;
  substitutionAllowed: boolean;
}

export interface PrescriptionDraftInput {
  appointmentId: string;
  clinicalNote?: string;
  items: readonly PrescriptionItemInput[];
  jurisdictionCode: string;
  patientId: string;
  previousPrescriptionId?: string;
}

export interface PrescriptionAccessRecord extends PrescriptionResponse {
  patientPrincipalId: string;
  pharmacyOrganizationId?: string;
  practitionerPrincipalId: string;
}

export interface PrescriptionSubstitutionInput {
  fillNumber: number;
  prescriptionItemId: string;
  proposedMedicationCode?: string;
  proposedMedicationCodeSystem?: string;
  proposedMedicationName: string;
  proposedStrength?: string;
  reasonCode: string;
}

export interface PrescriptionDispenseLineInput {
  fillNumber: number;
  prescriptionItemId: string;
  quantity: string;
  substitutionProposalId?: string;
}

export interface PractitionerPrescriptionIdentity {
  id: string;
  principalId: string;
  verificationStatus: "PENDING" | "VERIFIED" | "SUSPENDED" | "REVOKED";
}

export class PrescriptionConflictError extends Error {
  constructor(
    readonly reason:
      | "ACTIVE_ROUTE_EXISTS"
      | "DUPLICATE_DISPENSE_EVENT"
      | "INVALID_STATE"
      | "SUBSTITUTION_CONFLICT"
      | "VERSION_CONFLICT"
      | "INVARIANT_VIOLATION",
  ) {
    super(reason);
    this.name = "PrescriptionConflictError";
  }
}

export interface PrescriptionRepository {
  acceptAtPharmacy(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    organizationId: string;
    prescriptionId: string;
  }): Promise<PrescriptionAccessRecord | null>;
  cancel(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    prescriptionId: string;
    reasonCode: string;
  }): Promise<PrescriptionAccessRecord | null>;
  createSubstitutionProposal(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    organizationId: string;
    prescriptionId: string;
    proposal: PrescriptionSubstitutionInput;
  }): Promise<PrescriptionSubstitutionProposalResponse | null>;
  decideSubstitution(input: {
    actorPrincipalId: string;
    decisionKind: "PATIENT_CONSENT" | "PRACTITIONER_APPROVAL";
    expectedVersion: number;
    outcome: SubstitutionDecisionOutcome;
    prescriptionId: string;
    proposalId: string;
  }): Promise<PrescriptionSubstitutionProposalResponse | null>;
  dispense(input: {
    actorPrincipalId: string;
    dispenseEventId: string;
    expectedVersion: number;
    lines: readonly PrescriptionDispenseLineInput[];
    occurredAt: Date;
    organizationId: string;
    prescriptionId: string;
    requestDigest: string;
  }): Promise<PrescriptionDispenseEventResponse | null>;
  createDraft(input: {
    actorPrincipalId: string;
    draft: PrescriptionDraftInput;
    practitionerId: string;
  }): Promise<PrescriptionAccessRecord>;
  expireDue(input: {
    actorPrincipalId: string;
    limit: number;
    now: Date;
  }): Promise<{ expired: number }>;
  findById(prescriptionId: string): Promise<PrescriptionAccessRecord | null>;
  findPatientPrincipal(patientId: string): Promise<string | null>;
  findPractitionerByPrincipal(
    principalId: string,
  ): Promise<PractitionerPrescriptionIdentity | null>;
  listPharmacyQueue(input: {
    cursor?: { id: string; sentAt: Date };
    limit: number;
    organizationId: string;
  }): Promise<PrescriptionListResponse>;
  listDispenseEvents(input: {
    cursor?: { id: string; occurredAt: Date };
    limit: number;
    prescriptionId: string;
  }): Promise<PrescriptionDispenseEventListResponse>;
  returnToPatient(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    organizationId: string;
    prescriptionId: string;
    reasonCode: string;
  }): Promise<PrescriptionAccessRecord | null>;
  routeToPharmacy(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    pharmacyOrganizationId: string;
    prescriptionId: string;
  }): Promise<PrescriptionAccessRecord | null>;
  sign(input: {
    actorPrincipalId: string;
    attestationMethod: string;
    contentDigest: string;
    expectedVersion: number;
    prescriptionId: string;
    validUntil: Date;
  }): Promise<PrescriptionAccessRecord | null>;
  updateDraft(input: {
    actorPrincipalId: string;
    draft: PrescriptionDraftInput;
    expectedVersion: number;
    prescriptionId: string;
  }): Promise<PrescriptionAccessRecord | null>;
}

export const PRESCRIPTION_REPOSITORY = Symbol("PRESCRIPTION_REPOSITORY");
