import type { LogisticsDeliveryStatus } from "@royal-palace/contracts";

export const LOGISTICS_DELIVERY_REPOSITORY = Symbol("LOGISTICS_DELIVERY_REPOSITORY");

export interface LogisticsRequestContext {
  actorPrincipalId: string;
  requestId: string;
}

export interface LogisticsAddressSnapshot {
  addressLine1: string;
  addressLine2?: string;
  administrativeArea: string;
  countryCode: string;
  locality: string;
  postalCode?: string;
}

export interface DispatchLogisticsDeliveryInput {
  courierPrincipalId?: string;
  deliveryAddress: LogisticsAddressSnapshot;
  deliveryInstruction?: string;
  handoffId: string;
  idempotencyKey: string;
  logisticsOrganizationId: string;
  pickupAddress: LogisticsAddressSnapshot;
  pickupContactName: string;
  pickupContactPhoneE164: string;
  pickupLocationName: string;
  recipientName: string;
  recipientPhoneE164: string;
  requestHash: string;
}

export interface ReassignLogisticsDeliveryInput {
  courierPrincipalId?: string;
  deliveryId: string;
  expectedVersion: number;
  idempotencyKey: string;
  logisticsOrganizationId: string;
  reasonCode: string;
  requestHash: string;
}

export interface TransitionLogisticsDeliveryInput {
  deliveryId: string;
  expectedVersion: number;
  idempotencyKey: string;
  reasonCode?: string;
  requestHash: string;
  toStatus: Exclude<LogisticsDeliveryStatus, "ASSIGNED" | "DELIVERED" | "CANCELLED">;
}

export interface AssignCourierInput {
  courierPrincipalId: string;
  deliveryId: string;
  expectedAssignmentVersion: number;
  idempotencyKey: string;
  requestHash: string;
}

export interface LogisticsListInput {
  cursor?: { assignedAt: Date; id: string };
  limit: number;
  status?: LogisticsDeliveryStatus;
}

export interface LogisticsDeliveryRecord {
  acceptedAt: Date | null;
  activeAssignment: {
    assignedAt: Date;
    courierPrincipalId: string | null;
    id: string;
    logisticsOrganizationId: string;
    version: number;
  } | null;
  arrivedAtDestinationAt: Date | null;
  arrivedAtPickupAt: Date | null;
  assignedAt: Date;
  cancelledAt: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
  deliveryAddress: LogisticsAddressSnapshot;
  deliveryInstruction: string | null;
  deliveryNumber: string;
  failedAt: Date | null;
  handoffId: string;
  handoffReference: string;
  id: string;
  logisticsOrganizationId: string;
  orderId: string;
  orderNumber: string;
  patientPrincipalId: string;
  pharmacyOrganizationId: string;
  pickedUpAt: Date | null;
  pickupAddress: LogisticsAddressSnapshot;
  pickupContactName: string;
  pickupContactPhoneE164: string;
  pickupLocationName: string;
  pickupVerifiedAt: Date | null;
  recipientName: string;
  recipientPhoneE164: string;
  returnedAt: Date | null;
  status: LogisticsDeliveryStatus;
  updatedAt: Date;
  version: number;
}

export interface LogisticsHistoryRecord {
  actorPrincipalId: string;
  fromStatus: LogisticsDeliveryStatus | null;
  id: string;
  occurredAt: Date;
  reasonCode: string | null;
  toStatus: LogisticsDeliveryStatus;
}

export interface LogisticsDeliveryRepository {
  assignCourier(
    context: LogisticsRequestContext,
    input: AssignCourierInput,
  ): Promise<LogisticsDeliveryRecord | null>;
  cancel(
    context: LogisticsRequestContext,
    input: Omit<TransitionLogisticsDeliveryInput, "toStatus">,
  ): Promise<LogisticsDeliveryRecord | null>;
  dispatch(
    context: LogisticsRequestContext,
    input: DispatchLogisticsDeliveryInput,
  ): Promise<LogisticsDeliveryRecord>;
  findById(id: string): Promise<LogisticsDeliveryRecord | null>;
  listAdmin(input: LogisticsListInput): Promise<LogisticsDeliveryRecord[]>;
  listByLogisticsOrganization(
    organizationId: string,
    input: LogisticsListInput,
  ): Promise<LogisticsDeliveryRecord[]>;
  listByPatient(
    patientPrincipalId: string,
    input: LogisticsListInput,
  ): Promise<LogisticsDeliveryRecord[]>;
  listByPharmacy(
    pharmacyOrganizationId: string,
    input: LogisticsListInput,
  ): Promise<LogisticsDeliveryRecord[]>;
  listHistory(deliveryId: string, limit: number): Promise<LogisticsHistoryRecord[]>;
  reassign(
    context: LogisticsRequestContext,
    input: ReassignLogisticsDeliveryInput,
  ): Promise<LogisticsDeliveryRecord | null>;
  transition(
    context: LogisticsRequestContext,
    input: TransitionLogisticsDeliveryInput,
  ): Promise<LogisticsDeliveryRecord | null>;
}

export class LogisticsConflictError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "LogisticsConflictError";
  }
}
