import type {
  CommissionPolicyResponse,
  ManagerEarningsReportResponse,
  ManagerProfileResponse,
  ManagerReferralStatusResponse,
  ManagerTicketCategory,
  ManagerTicketResponse,
  PublicOrganizationType,
  PatientActivityType,
  ReferralAttributionCorrectionResponse,
  ReferralAudience,
  SupportManagerTicketResponse,
} from "@royal-palace/contracts";

export interface SettledPatientActivityInput {
  activityType: PatientActivityType;
  currency: string;
  grossAmountMinor: bigint;
  patientId: string;
  recordedByPrincipalId: string;
  settledAt: Date;
  sourceEventKey: string;
  sourceType: string;
}

export interface SettledPatientActivityResult {
  earningCreated: boolean;
  earningId: string | null;
  settlementId: string;
}

export interface StoredReferralLinkForClaim {
  audience: ReferralAudience;
  id: string;
  label: string;
  managerProfileId: string;
  managerStatus: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  organizationType: PublicOrganizationType | null;
  signingKeyId: string;
  status: "ACTIVE" | "PAUSED" | "REVOKED";
  tokenVersion: number;
  validFrom: Date;
  validUntil: Date | null;
}

export interface ManagerRepository {
  addManagerTicketFollowUp(input: {
    authorPrincipalId: string;
    body: string;
    managerProfileId: string;
    ticketId: string;
  }): Promise<ManagerTicketResponse | null>;
  createManagerProfile(input: {
    displayName: string;
    grantedByPrincipalId: string;
    principalId: string;
  }): Promise<ManagerProfileResponse>;
  createCommissionPolicy(input: {
    activityType: PatientActivityType;
    createdByPrincipalId: string;
    currency: string;
    effectiveFrom: Date;
    effectiveUntil?: Date;
    managerProfileId: string;
    minimumGrossMinor?: bigint;
    rateBps: number;
  }): Promise<CommissionPolicyResponse>;
  createManagerTicket(input: {
    category: ManagerTicketCategory;
    managerProfileId: string;
    principalId: string;
    subjectDisplayName: string;
    subjectReference?: string;
  }): Promise<ManagerTicketResponse>;
  createReferralLink(input: {
    audience: ReferralAudience;
    createdByPrincipalId: string;
    label: string;
    managerProfileId: string;
    organizationType?: PublicOrganizationType;
    signingKeyId: string;
    validUntil?: Date;
  }): Promise<StoredReferralLinkForClaim>;
  findReferralLinkForClaim(id: string): Promise<StoredReferralLinkForClaim | null>;
  findManagerByPrincipal(principalId: string): Promise<ManagerProfileResponse | null>;
  activateCommissionPolicy(input: {
    approvedByPrincipalId: string;
    expectedVersion: number;
    policyId: string;
  }): Promise<CommissionPolicyResponse | null>;
  correctAttribution(input: {
    actorPrincipalId: string;
    applicationId: string;
    correlationId?: string;
    expectedVersion: number;
    managerProfileId?: string;
    reasonCategory: string;
    referralLinkId?: string;
    requestId: string;
  }): Promise<ReferralAttributionCorrectionResponse | null>;
  getManagerTicket(input: {
    managerProfileId: string;
    ticketId: string;
  }): Promise<ManagerTicketResponse | null>;
  listEarnings(input: {
    cursor?: { id: string; occurredAt: Date };
    from: Date;
    granularity: "DAY" | "MONTH";
    limit: number;
    managerProfileId: string;
    timeZone: string;
    to: Date;
  }): Promise<ManagerEarningsReportResponse>;
  listManagerTickets(input: {
    cursor?: { id: string; updatedAt: Date };
    limit: number;
    managerProfileId: string;
  }): Promise<{ data: ManagerTicketResponse[]; hasNextPage: boolean }>;
  listSupportTickets(input: {
    cursor?: { id: string; updatedAt: Date };
    limit: number;
    status?: ManagerTicketResponse["status"];
  }): Promise<{ data: SupportManagerTicketResponse[]; hasNextPage: boolean }>;
  listReferralLinks(managerProfileId: string): Promise<StoredReferralLinkForClaim[]>;
  listReferralStatuses(input: {
    cursor?: { applicationId: string; updatedAt: Date };
    limit: number;
    managerProfileId: string;
  }): Promise<{
    cursor: { applicationId: string; updatedAt: Date } | null;
    data: ManagerReferralStatusResponse[];
    hasNextPage: boolean;
  }>;
  recordSettledPatientActivity(
    input: SettledPatientActivityInput,
  ): Promise<SettledPatientActivityResult>;
  reviewManagerTicket(input: {
    authorPrincipalId: string;
    body?: string;
    expectedVersion: number;
    status: ManagerTicketResponse["status"];
    ticketId: string;
  }): Promise<SupportManagerTicketResponse | null>;
}

export const MANAGER_REPOSITORY = Symbol("MANAGER_REPOSITORY");
