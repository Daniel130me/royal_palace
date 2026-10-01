import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { ManagerFlowError, ManagerService } from "../application/manager.service.js";

const idSchema = z.uuid();
const cursorSchema = z.string().min(1).max(2048).optional();
const limitSchema = z.coerce.number().int().min(1).max(50).optional();
const ticketStatusSchema = z.enum([
  "ESCALATED",
  "IN_REVIEW",
  "WAITING_MANAGER",
  "RESOLVED",
  "CLOSED",
]);
const listSchema = z.object({ cursor: cursorSchema, limit: limitSchema }).strict();
const ticketListSchema = listSchema.extend({ status: ticketStatusSchema.optional() });
const earningsSchema = listSchema.extend({
  from: z.string().min(1).max(64),
  granularity: z.enum(["DAY", "MONTH"]),
  timeZone: z.string().trim().min(1).max(100),
  to: z.string().min(1).max(64),
});
const ticketCreateSchema = z
  .object({
    category: z.enum(["ONBOARDING", "ACCOUNT", "TECHNICAL", "SERVICE", "OTHER"]),
    subjectDisplayName: z.string().trim().min(1).max(160),
    subjectReference: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
const ticketFollowUpSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();

@Controller("v1/manager")
@UseGuards(AuthenticatedInternalRequestGuard)
export class ManagerController {
  constructor(@Inject(ManagerService) private readonly manager: ManagerService) {}

  @Get("profile")
  profile(@Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.manager.getOwnProfile(requestContext(request)));
  }

  @Get("referral-links")
  links(@Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.manager.listOwnLinks(requestContext(request)));
  }

  @Get("referrals")
  referrals(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.manager.listOwnReferralStatuses(requestContext(request), parse(listSchema, query)),
    );
  }

  @Get("earnings")
  earnings(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.manager.getOwnEarnings(requestContext(request), parse(earningsSchema, query)),
    );
  }

  @Post("tickets")
  createTicket(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.manager.createOwnTicket(requestContext(request), parse(ticketCreateSchema, body)),
    );
  }

  @Get("tickets")
  tickets(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.manager.listOwnTickets(requestContext(request), parse(listSchema, query)),
    );
  }

  @Get("tickets/:ticketId")
  ticket(@Param("ticketId") ticketId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.manager.getOwnTicket(requestContext(request), parse(idSchema, ticketId)),
    );
  }

  @Post("tickets/:ticketId/follow-ups")
  followUp(
    @Param("ticketId") ticketId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(ticketFollowUpSchema, body);
    return execute(() =>
      this.manager.addOwnTicketFollowUp(
        requestContext(request),
        parse(idSchema, ticketId),
        input.body,
      ),
    );
  }
}

const managerProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160),
    principalId: idSchema,
  })
  .strict();
const referralLinkSchema = z
  .object({
    audience: z.enum(["PATIENT", "ORGANIZATION"]),
    label: z.string().trim().min(1).max(120),
    organizationType: z.enum(["HOSPITAL", "PHARMACY", "LABORATORY"]).optional(),
    validUntil: z.string().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const organizationShape = input.audience === "ORGANIZATION";
    if (organizationShape !== (input.organizationType !== undefined)) {
      context.addIssue({ code: "custom", message: "Referral purpose is inconsistent" });
    }
  });
const policySchema = z
  .object({
    activityType: z.enum(["CONSULTATION", "HOSPITAL", "PHARMACY", "LABORATORY"]),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/),
    effectiveFrom: z.string().min(1).max(64),
    effectiveUntil: z.string().min(1).max(64).optional(),
    minimumGrossMinor: z.string().regex(/^\d+$/).max(19).optional(),
    rateBps: z.number().int().min(1).max(10_000),
  })
  .strict();
const activationSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
const correctionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    managerProfileId: idSchema.optional(),
    reasonCategory: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{1,99}$/),
    referralLinkId: idSchema.optional(),
  })
  .strict();

@Controller("v1/admin/managers")
@UseGuards(AuthenticatedInternalRequestGuard)
export class AdminManagerController {
  constructor(@Inject(ManagerService) private readonly manager: ManagerService) {}

  @Post()
  create(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.manager.createManagerProfile(requestContext(request), parse(managerProfileSchema, body)),
    );
  }

  @Post(":managerProfileId/referral-links")
  createLink(
    @Param("managerProfileId") managerProfileId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.manager.createReferralLink(
        requestContext(request),
        parse(idSchema, managerProfileId),
        parse(referralLinkSchema, body),
      ),
    );
  }

  @Post(":managerProfileId/commission-policies")
  createPolicy(
    @Param("managerProfileId") managerProfileId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.manager.createCommissionPolicy(
        requestContext(request),
        parse(idSchema, managerProfileId),
        parse(policySchema, body),
      ),
    );
  }

  @Post("commission-policies/:policyId/activate")
  activatePolicy(
    @Param("policyId") policyId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(activationSchema, body);
    return execute(() =>
      this.manager.activateCommissionPolicy(
        requestContext(request),
        parse(idSchema, policyId),
        input.expectedVersion,
      ),
    );
  }

  @Post("attributions/:applicationId/corrections")
  correctAttribution(
    @Param("applicationId") applicationId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.manager.correctAttribution(
        requestContext(request),
        parse(idSchema, applicationId),
        parse(correctionSchema, body),
      ),
    );
  }
}

const ticketReviewSchema = z
  .object({
    body: z.string().trim().min(1).max(2000).optional(),
    expectedVersion: z.number().int().positive(),
    status: z.enum(["IN_REVIEW", "WAITING_MANAGER", "RESOLVED", "CLOSED"]),
  })
  .strict();

@Controller("v1/support/manager-tickets")
@UseGuards(AuthenticatedInternalRequestGuard)
export class SupportManagerTicketController {
  constructor(@Inject(ManagerService) private readonly manager: ManagerService) {}

  @Get()
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.manager.listSupportTickets(requestContext(request), parse(ticketListSchema, query)),
    );
  }

  @Patch(":ticketId")
  review(
    @Param("ticketId") ticketId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.manager.reviewSupportTicket(
        requestContext(request),
        parse(idSchema, ticketId),
        parse(ticketReviewSchema, body),
      ),
    );
  }
}

function requestContext(request: AuthenticatedInternalRequest) {
  const requestId = request.headers["x-request-id"];
  const correlationId = request.headers.traceparent;
  if (typeof requestId !== "string") {
    throw new HttpException(
      { error: "missing_request_id", message: "Request ID is required" },
      400,
    );
  }
  return {
    actor: request.currentSession,
    ...(typeof correlationId === "string" ? { correlationId } : {}),
    requestId,
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
  }
  return result.data;
}

async function execute<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ManagerFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "P2002" || error.code === "P2003" || error.code === "P2004")
    ) {
      throw new HttpException(
        {
          error: "manager_program_conflict",
          message: "The requested change conflicts with current data",
        },
        409,
      );
    }
    throw error;
  }
}
