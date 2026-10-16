import { Inject, Injectable } from "@nestjs/common";
import type { CurrentSession } from "@royal-palace/contracts";
import type { ApiServiceConfig } from "@royal-palace/config/environment";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import {
  ORGANIZATION_FINANCE_REPOSITORY,
  PAYOUT_GATEWAY,
  type OrganizationFinanceRepository,
  type PayoutGateway,
  type ReportGranularity,
} from "../domain/organization-finance.types.js";

export class OrganizationFinanceFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OrganizationFinanceFlowError";
  }
}

type RequestContext = { actor: CurrentSession; requestId: string };

@Injectable()
export class OrganizationFinanceService {
  constructor(
    @Inject(ORGANIZATION_FINANCE_REPOSITORY)
    private readonly repository: OrganizationFinanceRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
    @Inject(PAYOUT_GATEWAY) private readonly payoutGateway: PayoutGateway,
  ) {}

  async statements(context: RequestContext, organizationId?: string) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        ...(organizationId === undefined ? {} : { organizationId }),
        resourceId: organizationId ?? "platform_organization_settlements",
        resourceType: "organization_settlement",
      },
      policy: AUTHORIZATION_POLICY.VIEW_ORGANIZATION_FINANCIALS,
      requestId: context.requestId,
    });
    return this.repository.listStatements({
      ...(organizationId === undefined ? {} : { organizationId }),
      limit: 100,
    });
  }

  async finalizeStatement(
    context: RequestContext,
    input: {
      currency: string;
      from: Date;
      idempotencyKey: string;
      organizationId: string;
      to: Date;
    },
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        organizationId: input.organizationId,
        resourceId: input.organizationId,
        resourceType: "organization_settlement",
      },
      policy: AUTHORIZATION_POLICY.FINALIZE_ORGANIZATION_SETTLEMENT,
      requestId: context.requestId,
    });
    this.assertPrivilegedAssurance(context.actor);
    const result = await this.repository.finalizeStatement({
      ...input,
      currency: input.currency.toUpperCase(),
      finalizedByPrincipalId: context.actor.principalId,
      traceRequestId: context.requestId,
    });
    if (result === null)
      throw new OrganizationFinanceFlowError(
        "settlement_not_finalizable",
        409,
        "No unsettled earnings are available for this period",
      );
    return result;
  }

  async advancedReport(
    context: RequestContext,
    input: { from: Date; granularity: ReportGranularity; to: Date },
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId: "platform_finance_report", resourceType: "finance_report" },
      policy: AUTHORIZATION_POLICY.VIEW_ORGANIZATION_FINANCIALS,
      requestId: context.requestId,
    });
    return this.repository.listAdvancedReport(input);
  }

  async report(
    context: RequestContext,
    input: {
      from: Date;
      granularity: ReportGranularity;
      organizationId?: string;
      to: Date;
    },
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
        resourceId: input.organizationId ?? "platform_organization_finance",
        resourceType: "organization_finance_report",
      },
      policy: AUTHORIZATION_POLICY.VIEW_ORGANIZATION_FINANCIALS,
      requestId: context.requestId,
    });
    return this.repository.listSettlementReport(input);
  }

  async payouts(context: RequestContext, organizationId?: string) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        ...(organizationId === undefined ? {} : { organizationId }),
        resourceId: organizationId ?? "platform_organization_payouts",
        resourceType: "organization_payout",
      },
      policy: AUTHORIZATION_POLICY.VIEW_ORGANIZATION_FINANCIALS,
      requestId: context.requestId,
    });
    return this.repository.listPayouts({
      ...(organizationId === undefined ? {} : { organizationId }),
      limit: 100,
    });
  }

  async requestPayout(
    context: RequestContext,
    input: {
      currency: string;
      idempotencyKey: string;
      organizationId: string;
      requestedAmountMinor: string;
    },
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        organizationId: input.organizationId,
        resourceId: input.organizationId,
        resourceType: "organization_payout",
      },
      policy: AUTHORIZATION_POLICY.REQUEST_ORGANIZATION_PAYOUT,
      requestId: context.requestId,
    });
    this.assertPrivilegedAssurance(context.actor);
    const amount = BigInt(input.requestedAmountMinor);
    if (amount <= 0n)
      throw new OrganizationFinanceFlowError("invalid_amount", 400, "Amount must be positive");
    const result = await this.repository.requestPayout({
      currency: input.currency.toUpperCase(),
      idempotencyKey: input.idempotencyKey,
      organizationId: input.organizationId,
      requestedAmountMinor: amount,
      requestedByPrincipalId: context.actor.principalId,
      traceRequestId: context.requestId,
    });
    if (result === null)
      throw new OrganizationFinanceFlowError(
        "insufficient_available_balance",
        409,
        "Available earnings are insufficient",
      );
    return result;
  }

  async review(
    context: RequestContext,
    input: {
      decision: "APPROVE" | "REJECT";
      expectedVersion: number;
      payoutId: string;
      reasonCode: string;
    },
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId: input.payoutId, resourceType: "organization_payout" },
      policy: AUTHORIZATION_POLICY.REVIEW_ORGANIZATION_PAYOUT,
      requestId: context.requestId,
    });
    this.assertPrivilegedAssurance(context.actor);
    const result = await this.repository.reviewPayout({
      ...input,
      reviewedByPrincipalId: context.actor.principalId,
      traceRequestId: context.requestId,
    });
    if (result === null)
      throw new OrganizationFinanceFlowError(
        "payout_conflict",
        409,
        "Payout changed or is unavailable",
      );
    return result;
  }

  async executePayout(
    context: RequestContext,
    input: { expectedVersion: number; payoutId: string },
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId: input.payoutId, resourceType: "organization_payout" },
      policy: AUTHORIZATION_POLICY.EXECUTE_ORGANIZATION_PAYOUT,
      requestId: context.requestId,
    });
    this.assertPrivilegedAssurance(context.actor);
    if (this.config.payoutGateway.mode === "disabled") {
      throw new OrganizationFinanceFlowError(
        "payout_gateway_disabled",
        503,
        "Payout execution is disabled until a provider is qualified",
      );
    }
    const claim = await this.repository.claimPayoutExecution({
      executedByPrincipalId: context.actor.principalId,
      expectedVersion: input.expectedVersion,
      payoutId: input.payoutId,
      traceRequestId: context.requestId,
    });
    if (claim === null)
      throw new OrganizationFinanceFlowError(
        "payout_execution_conflict",
        409,
        "Payout is unavailable or separation of duties was not satisfied",
      );
    try {
      const result = await this.payoutGateway.execute(claim);
      return await this.repository.completePayoutExecution({
        ...result,
        payoutId: claim.payoutId,
        traceRequestId: context.requestId,
      });
    } catch (error) {
      const failureCode = error instanceof Error ? error.message.slice(0, 100) : "gateway_failure";
      await this.repository.completePayoutExecution({
        failureCode,
        outcome: "UNKNOWN",
        payoutId: claim.payoutId,
        providerCode: "unavailable",
        providerReference: `unknown-${claim.payoutId}`,
        traceRequestId: context.requestId,
      });
      throw new OrganizationFinanceFlowError(
        "payout_execution_failed",
        502,
        "Payout provider execution failed",
      );
    }
  }

  private assertPrivilegedAssurance(session: CurrentSession) {
    const age = Date.now() - new Date(session.authenticatedAt).getTime();
    if (
      session.assuranceContext !== this.config.identity.privilegedAssuranceContext ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > this.config.identity.privilegedAuthMaxAgeSeconds * 1000
    ) {
      throw new OrganizationFinanceFlowError(
        "step_up_required",
        403,
        "Step-up authentication is required",
      );
    }
  }
}
