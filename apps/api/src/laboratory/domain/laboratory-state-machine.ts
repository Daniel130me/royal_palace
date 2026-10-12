export type LaboratoryRequestStatus = "ACTIVE" | "CANCELLED" | "COMPLETED";

export type LaboratoryBookingStatus =
  | "CONFIRMED"
  | "SAMPLE_COLLECTION_PENDING"
  | "SAMPLE_COLLECTED"
  | "PROCESSING"
  | "RESULT_READY"
  | "COMPLETED"
  | "CANCELLED";

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

export function isLaboratoryRequestTerminal(status: LaboratoryRequestStatus): boolean {
  return REQUEST_TRANSITIONS[status].length === 0;
}

export function isLaboratoryBookingTerminal(status: LaboratoryBookingStatus): boolean {
  return BOOKING_TRANSITIONS[status].length === 0;
}
