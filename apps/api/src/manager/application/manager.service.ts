import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type {
  CurrentSession,
  ManagerEarningsReportResponse,
  ManagerProfileResponse,
  ManagerReferralLinkResponse,
  ManagerReferralStatusResponse,
  ManagerTicketCategory,
  ManagerTicketResponse,
  PatientActivityType,
  PublicOrganizationType,
  ReferralAudience,
} from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../domain/manager-repository.types.js";
import { ReferralClaimService } from "./referral-claim.service.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_REPORT_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export interface ManagerRequestContext {
  actor: CurrentSession;
  requestId: string;
}

export class ManagerFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ManagerFlowError";
  }
}

@Injectable()
export class ManagerService {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly repository: ManagerRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(ReferralClaimService) private readonly referralClaims: ReferralClaimService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async getOwnProfile(context: ManagerRequestContext): Promise<ManagerProfileResponse> {
    const profile = await this.requireOwnProfile(context);
    await this.authorizeManager(context, profile, AUTHORIZATION_POLICY.VIEW_MANAGER_REFERRALS);
    return profile;
  }

  async listOwnLinks(context: ManagerRequestContext): Promise<ManagerReferralLinkResponse[]> {
    const profile = await this.requireOwnProfile(context);
    await this.authorizeManager(context, profile, AUTHORIZATION_POLICY.VIEW_MANAGER_REFERRALS);
    const links = await this.repository.listReferralLinks(profile.id);
    return links.map((link) => ({
      audience: link.audience,
      id: link.id,
      label: link.label,
      organizationType: link.organizationType,
      referralToken: this.referralClaims.issue(link),
      status: link.status,
      validFrom: link.validFrom.toISOString(),
      validUntil: link.validUntil?.toISOString() ?? null,
    }));
  }

  async listOwnReferralStatuses(
    context: ManagerRequestContext,
    input: { cursor?: string; limit?: number },
  ): Promise<{
    data: ManagerReferralStatusResponse[];
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  }> {
    const profile = await this.requireOwnProfile(context);
    await this.authorizeManager(context, profile, AUTHORIZATION_POLICY.VIEW_MANAGER_REFERRALS);
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    const result = await this.repository.listReferralStatuses({
      ...(cursor === undefined
        ? {}
        : { cursor: { applicationId: cursor.id, updatedAt: cursor.timestamp } }),
      limit: pageSize(input.limit),
      managerProfileId: profile.id,
    });
    return {
      data: result.data,
      pageInfo: {
        endCursor:
          result.cursor === null
            ? null
            : encodeCursor(result.cursor.updatedAt, result.cursor.applicationId),
        hasNextPage: result.hasNextPage,
      },
    };
  }

  async getOwnEarnings(
    context: ManagerRequestContext,
    input: {
      cursor?: string;
      from: string;
      granularity: "DAY" | "MONTH";
      limit?: number;
      timeZone: string;
      to: string;
    },
  ): Promise<ManagerEarningsReportResponse> {
    const profile = await this.requireOwnProfile(context);
    await this.authorizeManager(context, profile, AUTHORIZATION_POLICY.VIEW_MANAGER_EARNINGS);
    const from = parseInstant(input.from);
    const to = parseInstant(input.to);
    if (to <= from || to.getTime() - from.getTime() > MAX_REPORT_RANGE_MS) {
      throw new ManagerFlowError("invalid_report_range", 400, "Report range is invalid");
    }
    assertTimeZone(input.timeZone);
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    return this.repository.listEarnings({
      ...(cursor === undefined ? {} : { cursor: { id: cursor.id, occurredAt: cursor.timestamp } }),
      from,
      granularity: input.granularity,
      limit: pageSize(input.limit),
      managerProfileId: profile.id,
      timeZone: input.timeZone,
      to,
    });
  }

  async createOwnTicket(
    context: ManagerRequestContext,
    input: {
      category: ManagerTicketCategory;
      subjectDisplayName: string;
      subjectReference?: string;
    },
  ): Promise<ManagerTicketResponse> {
    const profile = await this.requireOwnProfile(context);
    await this.authorizeTicket(context, profile);
    return this.repository.createManagerTicket({
      ...input,
      managerProfileId: profile.id,
      principalId: context.actor.principalId,
    });
  }

  async listOwnTickets(context: ManagerRequestContext, input: { cursor?: string; limit?: number }) {
    const profile = await this.requireOwnProfile(context);
    await this.authorizeTicket(context, profile);
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    const result = await this.repository.listManagerTickets({
      ...(cursor === undefined ? {} : { cursor: { id: cursor.id, updatedAt: cursor.timestamp } }),
      limit: pageSize(input.limit),
      managerProfileId: profile.id,
    });
    const last = result.data.at(-1);
    return {
      data: result.data,
      pageInfo: {
        endCursor:
          result.hasNextPage && last !== undefined
            ? encodeCursor(new Date(last.updatedAt), last.id)
            : null,
        hasNextPage: result.hasNextPage,
      },
    };
  }

  async getOwnTicket(context: ManagerRequestContext, ticketId: string) {
    const profile = await this.requireOwnProfile(context);
    await this.authorizeTicket(context, profile);
    const ticket = await this.repository.getManagerTicket({
      managerProfileId: profile.id,
      ticketId,
    });
    if (ticket === null)
      throw new ManagerFlowError("ticket_not_found", 404, "Ticket was not found");
    return ticket;
  }

  async addOwnTicketFollowUp(context: ManagerRequestContext, ticketId: string, body: string) {
    const profile = await this.requireOwnProfile(context);
    await this.authorizeTicket(context, profile);
    const ticket = await this.repository.addManagerTicketFollowUp({
      authorPrincipalId: context.actor.principalId,
      body,
      managerProfileId: profile.id,
      ticketId,
    });
    if (ticket === null)
      throw new ManagerFlowError("ticket_not_found", 404, "Ticket was not found");
    return ticket;
  }

  async createManagerProfile(
    context: ManagerRequestContext,
    input: { displayName: string; principalId: string },
  ) {
    await this.authorizeAdministration(context, input.principalId);
    this.assertPrivilegedAssurance(context.actor);
    return this.repository.createManagerProfile({
      ...input,
      grantedByPrincipalId: context.actor.principalId,
    });
  }

  async createReferralLink(
    context: ManagerRequestContext,
    managerProfileId: string,
    input: {
      audience: ReferralAudience;
      label: string;
      organizationType?: PublicOrganizationType;
      validUntil?: string;
    },
  ): Promise<ManagerReferralLinkResponse> {
    await this.authorizeAdministration(context, managerProfileId);
    this.assertPrivilegedAssurance(context.actor);
    const validUntil = input.validUntil === undefined ? undefined : parseInstant(input.validUntil);
    if (validUntil !== undefined && validUntil <= new Date()) {
      throw new ManagerFlowError(
        "invalid_referral_validity",
        400,
        "Referral expiry must be in the future",
      );
    }
    const link = await this.repository.createReferralLink({
      audience: input.audience,
      createdByPrincipalId: context.actor.principalId,
      label: input.label,
      managerProfileId,
      ...(input.organizationType === undefined ? {} : { organizationType: input.organizationType }),
      signingKeyId: this.config.identity.referralActiveSigningKeyId,
      ...(validUntil === undefined ? {} : { validUntil }),
    });
    return {
      audience: link.audience,
      id: link.id,
      label: input.label,
      organizationType: link.organizationType,
      referralToken: this.referralClaims.issue(link),
      status: link.status,
      validFrom: link.validFrom.toISOString(),
      validUntil: link.validUntil?.toISOString() ?? null,
    };
  }

  async createCommissionPolicy(
    context: ManagerRequestContext,
    managerProfileId: string,
    input: {
      activityType: PatientActivityType;
      currency: string;
      effectiveFrom: string;
      effectiveUntil?: string;
      minimumGrossMinor?: string;
      rateBps: number;
    },
  ) {
    await this.authorizePolicyAdministration(context, managerProfileId);
    this.assertPrivilegedAssurance(context.actor);
    const effectiveFrom = parseInstant(input.effectiveFrom);
    const effectiveUntil =
      input.effectiveUntil === undefined ? undefined : parseInstant(input.effectiveUntil);
    if (effectiveUntil !== undefined && effectiveUntil <= effectiveFrom) {
      throw new ManagerFlowError("invalid_policy_validity", 400, "Policy validity is invalid");
    }
    return this.repository.createCommissionPolicy({
      activityType: input.activityType,
      createdByPrincipalId: context.actor.principalId,
      currency: normalizeCurrency(input.currency),
      effectiveFrom,
      ...(effectiveUntil === undefined ? {} : { effectiveUntil }),
      managerProfileId,
      ...(input.minimumGrossMinor === undefined
        ? {}
        : { minimumGrossMinor: parseNonNegativeMinor(input.minimumGrossMinor) }),
      rateBps: input.rateBps,
    });
  }

  async activateCommissionPolicy(
    context: ManagerRequestContext,
    policyId: string,
    expectedVersion: number,
  ) {
    await this.authorizePolicyAdministration(context, policyId);
    this.assertPrivilegedAssurance(context.actor);
    const policy = await this.repository.activateCommissionPolicy({
      approvedByPrincipalId: context.actor.principalId,
      expectedVersion,
      policyId,
    });
    if (policy === null)
      throw new ManagerFlowError("policy_conflict", 409, "Policy changed or is unavailable");
    return policy;
  }

  async correctAttribution(
    context: ManagerRequestContext & { correlationId?: string },
    applicationId: string,
    input: {
      expectedVersion: number;
      managerProfileId?: string;
      reasonCategory: string;
      referralLinkId?: string;
    },
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId: applicationId, resourceType: "referral_attribution" },
      policy: AUTHORIZATION_POLICY.CORRECT_REFERRAL_ATTRIBUTION,
      requestId: context.requestId,
    });
    this.assertPrivilegedAssurance(context.actor);
    if ((input.managerProfileId === undefined) !== (input.referralLinkId === undefined)) {
      throw new ManagerFlowError(
        "invalid_attribution_target",
        400,
        "Manager and referral link must be provided together",
      );
    }
    const correction = await this.repository.correctAttribution({
      actorPrincipalId: context.actor.principalId,
      applicationId,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      expectedVersion: input.expectedVersion,
      ...(input.managerProfileId === undefined ? {} : { managerProfileId: input.managerProfileId }),
      reasonCategory: input.reasonCategory,
      ...(input.referralLinkId === undefined ? {} : { referralLinkId: input.referralLinkId }),
      requestId: context.requestId,
    });
    if (correction === null) {
      throw new ManagerFlowError(
        "attribution_conflict",
        409,
        "Attribution changed or target is unavailable",
      );
    }
    return correction;
  }

  async listSupportTickets(
    context: ManagerRequestContext,
    input: { cursor?: string; limit?: number; status?: ManagerTicketResponse["status"] },
  ) {
    await this.authorizeTicketReview(context, "manager-ticket-queue");
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    const result = await this.repository.listSupportTickets({
      ...(cursor === undefined ? {} : { cursor: { id: cursor.id, updatedAt: cursor.timestamp } }),
      limit: pageSize(input.limit),
      ...(input.status === undefined ? {} : { status: input.status }),
    });
    const last = result.data.at(-1);
    return {
      data: result.data,
      pageInfo: {
        endCursor:
          result.hasNextPage && last !== undefined
            ? encodeCursor(new Date(last.updatedAt), last.id)
            : null,
        hasNextPage: result.hasNextPage,
      },
    };
  }

  async reviewSupportTicket(
    context: ManagerRequestContext,
    ticketId: string,
    input: { body?: string; expectedVersion: number; status: ManagerTicketResponse["status"] },
  ) {
    await this.authorizeTicketReview(context, ticketId);
    const ticket = await this.repository.reviewManagerTicket({
      authorPrincipalId: context.actor.principalId,
      ...input,
      ticketId,
    });
    if (ticket === null)
      throw new ManagerFlowError("ticket_conflict", 409, "Ticket changed or was not found");
    return ticket;
  }

  async recordSettledPatientActivity(
    context: ManagerRequestContext,
    input: {
      activityType: PatientActivityType;
      currency: string;
      grossAmountMinor: string;
      patientId: string;
      settledAt: string;
      sourceEventKey: string;
      sourceType: string;
    },
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId: input.sourceEventKey, resourceType: "patient_activity_settlement" },
      policy: AUTHORIZATION_POLICY.RECORD_SETTLED_PATIENT_ACTIVITY,
      requestId: context.requestId,
    });
    return this.repository.recordSettledPatientActivity({
      ...input,
      currency: normalizeCurrency(input.currency),
      grossAmountMinor: parsePositiveMinor(input.grossAmountMinor),
      recordedByPrincipalId: context.actor.principalId,
      settledAt: parseInstant(input.settledAt),
    });
  }

  private async requireOwnProfile(context: ManagerRequestContext) {
    const profile = await this.repository.findManagerByPrincipal(context.actor.principalId);
    if (profile === null || profile.status !== "ACTIVE") {
      throw new ManagerFlowError(
        "manager_profile_unavailable",
        403,
        "Manager access is unavailable",
      );
    }
    return profile;
  }

  private authorizeManager(
    context: ManagerRequestContext,
    profile: ManagerProfileResponse,
    policy:
      | typeof AUTHORIZATION_POLICY.VIEW_MANAGER_EARNINGS
      | typeof AUTHORIZATION_POLICY.VIEW_MANAGER_REFERRALS,
  ) {
    return this.authorization.authorize({
      actor: context.actor,
      context: {
        managerPrincipalId: context.actor.principalId,
        resourceId: profile.id,
        resourceType: "manager_profile",
      },
      policy,
      requestId: context.requestId,
    });
  }

  private authorizeTicket(context: ManagerRequestContext, profile: ManagerProfileResponse) {
    return this.authorization.authorize({
      actor: context.actor,
      context: {
        disclosureLevel: "MINIMAL" as const,
        resourceId: profile.id,
        resourceType: "manager_support_ticket",
        ticketOwnerPrincipalId: context.actor.principalId,
      },
      policy: AUTHORIZATION_POLICY.ESCALATE_TICKET,
      requestId: context.requestId,
    });
  }

  private authorizeAdministration(context: ManagerRequestContext, resourceId: string) {
    return this.authorization.authorize({
      actor: context.actor,
      context: { resourceId, resourceType: "manager_program" },
      policy: AUTHORIZATION_POLICY.ADMINISTER_MANAGER_PROGRAM,
      requestId: context.requestId,
    });
  }

  private authorizePolicyAdministration(context: ManagerRequestContext, resourceId: string) {
    return this.authorization.authorize({
      actor: context.actor,
      context: { resourceId, resourceType: "commission_policy" },
      policy: AUTHORIZATION_POLICY.ADMINISTER_COMMISSION_POLICY,
      requestId: context.requestId,
    });
  }

  private authorizeTicketReview(context: ManagerRequestContext, resourceId: string) {
    return this.authorization.authorize({
      actor: context.actor,
      context: { resourceId, resourceType: "manager_support_ticket" },
      policy: AUTHORIZATION_POLICY.REVIEW_MANAGER_TICKET,
      requestId: context.requestId,
    });
  }

  private assertPrivilegedAssurance(session: CurrentSession): void {
    const authenticatedAt = new Date(session.authenticatedAt);
    const ageMilliseconds = Date.now() - authenticatedAt.getTime();
    if (
      session.assuranceContext !== this.config.identity.privilegedAssuranceContext ||
      !Number.isFinite(ageMilliseconds) ||
      ageMilliseconds < 0 ||
      ageMilliseconds > this.config.identity.privilegedAuthMaxAgeSeconds * 1000
    ) {
      throw new ManagerFlowError("step_up_required", 403, "Step-up authentication is required");
    }
  }
}

function pageSize(value: number | undefined): number {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    throw new ManagerFlowError("invalid_page_size", 400, "Page size is invalid");
  }
  return Math.min(value ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function parseNonNegativeMinor(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new ManagerFlowError("invalid_minor_amount", 400, "Minor amount is invalid");
  }
  const amount = BigInt(value);
  if (amount > MAX_POSTGRES_BIGINT) {
    throw new ManagerFlowError("invalid_minor_amount", 400, "Minor amount is invalid");
  }
  return amount;
}

function parsePositiveMinor(value: string): bigint {
  const amount = parseNonNegativeMinor(value);
  if (amount === 0n) {
    throw new ManagerFlowError("invalid_minor_amount", 400, "Minor amount must be positive");
  }
  return amount;
}

function normalizeCurrency(value: string): string {
  const currency = value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ManagerFlowError("invalid_currency", 400, "Currency is invalid");
  }
  return currency;
}

function parseInstant(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    throw new ManagerFlowError("invalid_timestamp", 400, "Timestamp must include an offset");
  }
  return date;
}

function assertTimeZone(value: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch {
    throw new ManagerFlowError("invalid_time_zone", 400, "Time zone is invalid");
  }
}

function encodeCursor(timestamp: Date, id: string): string {
  return Buffer.from(`${timestamp.toISOString()}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(value: string): { id: string; timestamp: Date } {
  try {
    const [rawTimestamp, id, extra] = Buffer.from(value, "base64url").toString("utf8").split("|");
    if (rawTimestamp === undefined || id === undefined || extra !== undefined) throw new Error();
    return { id, timestamp: parseInstant(rawTimestamp) };
  } catch {
    throw new ManagerFlowError("invalid_cursor", 400, "Cursor is invalid");
  }
}
