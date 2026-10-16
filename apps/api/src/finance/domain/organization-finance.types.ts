export const ORGANIZATION_FINANCE_REPOSITORY = Symbol("ORGANIZATION_FINANCE_REPOSITORY");
export const PAYOUT_GATEWAY = Symbol("PAYOUT_GATEWAY");

export type ReportGranularity = "DAY" | "MONTH" | "TOTAL";

export interface OrganizationFinanceRepository {
  listStatements(input: { organizationId?: string; limit: number }): Promise<unknown>;
  finalizeStatement(input: {
    currency: string;
    finalizedByPrincipalId: string;
    from: Date;
    idempotencyKey: string;
    organizationId: string;
    to: Date;
    traceRequestId: string;
  }): Promise<unknown | null>;
  listAdvancedReport(input: {
    from: Date;
    granularity: ReportGranularity;
    to: Date;
  }): Promise<unknown>;
  listSettlementReport(input: {
    from: Date;
    granularity: ReportGranularity;
    organizationId?: string;
    to: Date;
  }): Promise<unknown>;
  listPayouts(input: { organizationId?: string; limit: number }): Promise<unknown>;
  requestPayout(input: {
    currency: string;
    idempotencyKey: string;
    organizationId: string;
    requestedAmountMinor: bigint;
    requestedByPrincipalId: string;
    traceRequestId: string;
  }): Promise<unknown | null>;
  reviewPayout(input: {
    decision: "APPROVE" | "REJECT";
    expectedVersion: number;
    payoutId: string;
    reasonCode: string;
    reviewedByPrincipalId: string;
    traceRequestId: string;
  }): Promise<unknown | null>;
  claimPayoutExecution(input: {
    executedByPrincipalId: string;
    expectedVersion: number;
    payoutId: string;
    traceRequestId: string;
  }): Promise<PayoutExecutionClaim | null>;
  completePayoutExecution(input: {
    failureCode?: string;
    outcome: "SUCCEEDED" | "FAILED" | "UNKNOWN";
    payoutId: string;
    providerCode: string;
    providerReference: string;
    traceRequestId: string;
  }): Promise<unknown | null>;
}

export interface PayoutExecutionClaim {
  amountMinor: string;
  currency: string;
  organizationId: string;
  payoutId: string;
  payoutNumber: string;
}

export interface PayoutGateway {
  execute(input: PayoutExecutionClaim): Promise<{
    providerCode: string;
    providerReference: string;
    outcome: "SUCCEEDED" | "FAILED" | "UNKNOWN";
    failureCode?: string;
  }>;
}
