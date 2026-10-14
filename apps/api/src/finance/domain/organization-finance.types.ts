export const ORGANIZATION_FINANCE_REPOSITORY = Symbol("ORGANIZATION_FINANCE_REPOSITORY");

export type ReportGranularity = "DAY" | "MONTH" | "TOTAL";

export interface OrganizationFinanceRepository {
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
}
