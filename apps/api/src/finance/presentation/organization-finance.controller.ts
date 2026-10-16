import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  OrganizationFinanceFlowError,
  OrganizationFinanceService,
} from "../application/organization-finance.service.js";

const idSchema = z.uuid();
const currencySchema = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());
const idempotencySchema = z.string().trim().min(8).max(128);
const reportSchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    granularity: z.enum(["DAY", "MONTH", "TOTAL"]).default("MONTH"),
    to: z.iso.datetime({ offset: true }),
  })
  .strict();
const requestSchema = z
  .object({ currency: currencySchema, requestedAmountMinor: z.string().regex(/^\d{1,19}$/) })
  .strict();
const reviewSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    expectedVersion: z.number().int().positive(),
    reasonCode: z.string().trim().min(3).max(100),
  })
  .strict();
const executeSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
const finalizeStatementSchema = z
  .object({
    currency: currencySchema,
    from: z.iso.datetime({ offset: true }),
    organizationId: idSchema,
    to: z.iso.datetime({ offset: true }),
  })
  .strict();

@Controller("v1/organization/finance")
@UseGuards(AuthenticatedInternalRequestGuard)
export class OrganizationFinanceController {
  constructor(
    @Inject(OrganizationFinanceService) private readonly finance: OrganizationFinanceService,
  ) {}

  @Get("settlements")
  report(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.finance.report(context(request), {
        ...parseRange(query),
        organizationId: parse(idSchema, organizationId),
      }),
    );
  }

  @Get("statements")
  statements(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.finance.statements(context(request), parse(idSchema, organizationId)),
    );
  }

  @Get("payouts")
  payouts(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() => this.finance.payouts(context(request), parse(idSchema, organizationId)));
  }

  @Post("payouts")
  requestPayout(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(requestSchema, body);
    return execute(() =>
      this.finance.requestPayout(context(request), {
        ...input,
        idempotencyKey: parse(idempotencySchema, idempotencyKey),
        organizationId: parse(idSchema, organizationId),
      }),
    );
  }
}

@Controller("v1/admin/finance")
@UseGuards(AuthenticatedInternalRequestGuard)
export class AdminOrganizationFinanceController {
  constructor(
    @Inject(OrganizationFinanceService) private readonly finance: OrganizationFinanceService,
  ) {}

  @Get("settlements")
  report(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.finance.report(context(request), parseRange(query)));
  }

  @Get("payouts")
  payouts(@Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.finance.payouts(context(request)));
  }

  @Get("statements")
  statements(@Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.finance.statements(context(request)));
  }

  @Post("statements")
  finalizeStatement(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(finalizeStatementSchema, body);
    const range = parseRange({ from: input.from, to: input.to, granularity: "TOTAL" });
    return execute(() =>
      this.finance.finalizeStatement(context(request), {
        currency: input.currency,
        from: range.from,
        idempotencyKey: parse(idempotencySchema, idempotencyKey),
        organizationId: input.organizationId,
        to: range.to,
      }),
    );
  }

  @Get("reports/summary")
  advancedReport(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.finance.advancedReport(context(request), parseRange(query)));
  }

  @Post("payouts/:payoutId/review")
  review(
    @Param("payoutId") payoutId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.finance.review(context(request), {
        ...parse(reviewSchema, body),
        payoutId: parse(idSchema, payoutId),
      }),
    );
  }

  @Post("payouts/:payoutId/execute")
  executePayout(
    @Param("payoutId") payoutId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.finance.executePayout(context(request), {
        ...parse(executeSchema, body),
        payoutId: parse(idSchema, payoutId),
      }),
    );
  }
}

function parseRange(value: unknown) {
  const parsed = parse(reportSchema, value);
  const from = new Date(parsed.from);
  const to = new Date(parsed.to);
  if (to <= from || to.getTime() - from.getTime() > 366 * 86_400_000) {
    throw new HttpException(
      {
        error: "invalid_report_range",
        message: "Report range must be positive and no longer than 366 days",
      },
      400,
    );
  }
  return { from, granularity: parsed.granularity, to };
}

function context(request: AuthenticatedInternalRequest) {
  const requestId = request.headers["x-request-id"];
  if (typeof requestId !== "string")
    throw new HttpException(
      { error: "missing_request_id", message: "Request ID is required" },
      400,
    );
  return { actor: request.currentSession, requestId };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
  return result.data;
}

async function execute<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof OrganizationFinanceFlowError)
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    if (error instanceof AuthorizationDeniedError)
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    throw error;
  }
}
