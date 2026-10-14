import type {
  CursorPageInfo,
  LaboratoryBookingListResponse,
  LaboratoryCollectionMode,
  LaboratoryHomeCollectionInput,
  LaboratoryBookingStatus,
  LaboratoryRequestPriority,
  LaboratoryRequestResponse,
} from "@royal-palace/contracts";

export interface LaboratoryRequestDraft {
  appointmentId: string;
  clinicalIndication: string;
  patientId: string;
  priority: LaboratoryRequestPriority;
  serviceId: string;
  specimenInstructions?: string;
}

export interface LaboratoryBookingDraft {
  collectionMode: LaboratoryCollectionMode;
  homeCollection?: LaboratoryHomeCollectionInput;
  laboratoryOrganizationId: string;
  scheduledAt?: Date;
}

export interface LaboratoryRequestAccessRecord extends LaboratoryRequestResponse {
  laboratoryOrganizationId?: string;
  patientPrincipalId: string;
  practitionerPrincipalId: string;
}

export interface LaboratoryRequestAccessList {
  data: readonly LaboratoryRequestAccessRecord[];
  pageInfo: CursorPageInfo;
}

export interface LaboratoryPractitionerIdentity {
  id: string;
  principalId: string;
  verificationStatus: "PENDING" | "VERIFIED" | "SUSPENDED" | "REVOKED";
}

export class LaboratoryConflictError extends Error {
  constructor(
    readonly reason:
      | "ACTIVE_BOOKING_EXISTS"
      | "IDEMPOTENCY_CONFLICT"
      | "INVALID_STATE"
      | "INVARIANT_VIOLATION"
      | "VERSION_CONFLICT",
  ) {
    super(reason);
    this.name = "LaboratoryConflictError";
  }
}

export interface LaboratoryRepository {
  book(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    idempotencyKey: string;
    draft: LaboratoryBookingDraft;
    patientPrincipalId: string;
    requestHash: string;
    requestId: string;
    traceRequestId: string;
  }): Promise<LaboratoryRequestAccessRecord | null>;
  createRequest(input: {
    actorPrincipalId: string;
    draft: LaboratoryRequestDraft;
    practitionerId: string;
    requestId: string;
  }): Promise<LaboratoryRequestAccessRecord>;
  findById(requestId: string): Promise<LaboratoryRequestAccessRecord | null>;
  findByBooking(input: {
    bookingId: string;
    organizationId: string;
  }): Promise<LaboratoryRequestAccessRecord | null>;
  findPractitionerByPrincipal(principalId: string): Promise<LaboratoryPractitionerIdentity | null>;
  listByPatient(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    patientPrincipalId: string;
  }): Promise<LaboratoryRequestAccessList>;
  listByPractitioner(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    patientId?: string;
    practitionerPrincipalId: string;
  }): Promise<LaboratoryRequestAccessList>;
  listLaboratoryQueue(input: {
    cursor?: { acceptedAt: Date; id: string };
    limit: number;
    organizationId: string;
    status?: LaboratoryBookingStatus;
  }): Promise<LaboratoryBookingListResponse>;
  transitionBooking(input: {
    actorPrincipalId: string;
    bookingId: string;
    expectedVersion: number;
    organizationId: string;
    reasonCode: string;
    requestId: string;
    toStatus: LaboratoryBookingStatus;
  }): Promise<LaboratoryRequestAccessRecord | null>;
}

export const LABORATORY_REPOSITORY = Symbol("LABORATORY_REPOSITORY");
