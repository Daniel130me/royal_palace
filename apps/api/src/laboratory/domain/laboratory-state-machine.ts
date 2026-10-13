export type LaboratoryRequestStatus = "ACTIVE" | "CANCELLED" | "COMPLETED";

export type LaboratoryBookingStatus =
  | "CONFIRMED"
  | "SAMPLE_COLLECTION_PENDING"
  | "SAMPLE_COLLECTED"
  | "PROCESSING"
  | "RESULT_READY"
  | "COMPLETED"
  | "CANCELLED";

export type LaboratoryResultStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "SUPERSEDED";
export type LaboratoryCriticalResultStatus = "OPEN" | "ACKNOWLEDGED" | "ESCALATED" | "RESOLVED";

const REQUEST_TRANSITIONS: Readonly<
  Record<LaboratoryRequestStatus, readonly LaboratoryRequestStatus[]>
> = {
  ACTIVE: ["CANCELLED", "COMPLETED"],
  CANCELLED: [],
  COMPLETED: [],
};

const BOOKING_TRANSITIONS: Readonly<
  Record<LaboratoryBookingStatus, readonly LaboratoryBookingStatus[]>
> = {
  CONFIRMED: ["SAMPLE_COLLECTION_PENDING", "SAMPLE_COLLECTED", "CANCELLED"],
  SAMPLE_COLLECTION_PENDING: ["SAMPLE_COLLECTED", "CANCELLED"],
  SAMPLE_COLLECTED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["RESULT_READY", "CANCELLED"],
  RESULT_READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

const RESULT_TRANSITIONS: Readonly<
  Record<LaboratoryResultStatus, readonly LaboratoryResultStatus[]>
> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["DRAFT", "PUBLISHED"],
  PUBLISHED: ["SUPERSEDED"],
  SUPERSEDED: [],
};

const CRITICAL_RESULT_TRANSITIONS: Readonly<
  Record<LaboratoryCriticalResultStatus, readonly LaboratoryCriticalResultStatus[]>
> = {
  OPEN: ["ACKNOWLEDGED", "ESCALATED"],
  ACKNOWLEDGED: ["RESOLVED"],
  ESCALATED: ["ACKNOWLEDGED", "RESOLVED"],
  RESOLVED: [],
};

export function canTransitionLaboratoryRequest(
  from: LaboratoryRequestStatus,
  to: LaboratoryRequestStatus,
): boolean {
  return REQUEST_TRANSITIONS[from].includes(to);
}

export function canTransitionLaboratoryBooking(
  from: LaboratoryBookingStatus,
  to: LaboratoryBookingStatus,
): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

export function canTransitionLaboratoryResult(
  from: LaboratoryResultStatus,
  to: LaboratoryResultStatus,
): boolean {
  return RESULT_TRANSITIONS[from].includes(to);
}

export function canTransitionLaboratoryCriticalResult(
  from: LaboratoryCriticalResultStatus,
  to: LaboratoryCriticalResultStatus,
): boolean {
  return CRITICAL_RESULT_TRANSITIONS[from].includes(to);
}

export function isLaboratoryRequestTerminal(status: LaboratoryRequestStatus): boolean {
  return REQUEST_TRANSITIONS[status].length === 0;
}

export function isLaboratoryBookingTerminal(status: LaboratoryBookingStatus): boolean {
  return BOOKING_TRANSITIONS[status].length === 0;
}

export function isLaboratoryResultTerminal(status: LaboratoryResultStatus): boolean {
  return RESULT_TRANSITIONS[status].length === 0;
}

export function isLaboratoryCriticalResultTerminal(
  status: LaboratoryCriticalResultStatus,
): boolean {
  return CRITICAL_RESULT_TRANSITIONS[status].length === 0;
}
