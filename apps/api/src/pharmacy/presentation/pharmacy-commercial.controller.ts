import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { PolicyProtected } from "../../authorization/presentation/policy-protected.decorator.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  PharmacyCommercialFlowError,
  PharmacyCommercialService,
} from "../application/pharmacy-commercial.service.js";
import { PharmacyCommercialConflictError } from "../domain/pharmacy-commercial.types.js";

const idSchema = z.uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(128);
const amountMinorSchema = z
  .string()
  .regex(/^\d{1,16}$/)
  .transform((value) => BigInt(value));
const quoteLineSchema = z
  .object({
    prescriptionItemId: idSchema,
    quantity: z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/),
    substitutionProposalId: idSchema.optional(),
    unitPriceMinor: amountMinorSchema,
  })
  .strict();
const quoteChargeSchema = z
  .object({
    amountMinor: amountMinorSchema,
    code: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
      .transform((value) => value.toUpperCase()),
    label: z.string().trim().min(1).max(160),
    type: z.enum(["TAX", "FEE"]),
  })
  .strict();
const createQuoteSchema = z
  .object({
    charges: z.array(quoteChargeSchema).max(20).default([]),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .transform((value) => value.toUpperCase()),
    expectedPrescriptionVersion: z.number().int().positive(),
    fillNumber: z.number().int().min(0).max(99),
    lines: z.array(quoteLineSchema).min(1).max(50),
    validForSeconds: z.number().int().min(60).max(86_400),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.lines.map((line) => line.prescriptionItemId)).size === input.lines.length,
    { path: ["lines"] },
  );
const acceptQuoteSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
const reasonCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  .transform((value) => value.toUpperCase());
const prepareHandoffSchema = z
  .object({
    expectedOrderVersion: z.number().int().positive(),
    method: z.enum(["PICKUP", "DELIVERY"]),
  })
  .strict();
const completeHandoffSchema = z
  .object({ expectedHandoffVersion: z.number().int().positive() })
  .strict();
const orderResolutionSchema = z
  .object({ expectedVersion: z.number().int().positive(), reasonCode: reasonCodeSchema })
  .strict();

@Controller("v1/pharmacy")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PharmacyCommercialController {
  constructor(
    @Inject(PharmacyCommercialService) private readonly commercial: PharmacyCommercialService,
  ) {}

  @Post("prescriptions/:prescriptionId/quotes")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_QUOTE)
  createQuote(
    @Param("prescriptionId") prescriptionId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(createQuoteSchema, body);
    return execute(() =>
      this.commercial.createQuote(context(request), {
        ...input,
        idempotencyKey: parse(idempotencyKeySchema, idempotencyKey),
        pharmacyOrganizationId: parse(idSchema, organizationId),
        prescriptionId: parse(idSchema, prescriptionId),
      }),
    );
  }

  @Get("quotes/:quoteId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_PHARMACY_QUOTE)
  getQuote(@Param("quoteId") quoteId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.commercial.getQuote(context(request), parse(idSchema, quoteId)));
  }

  @Get("orders/:orderId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_PHARMACY_ORDER)
  getOrder(@Param("orderId") orderId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.commercial.getOrder(context(request), parse(idSchema, orderId)));
  }

  @Post("orders/:orderId/handoff")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_HANDOFF)
  prepareHandoff(
    @Param("orderId") orderId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(prepareHandoffSchema, body);
    return execute(() =>
      this.commercial.prepareHandoff(
        context(request),
        parse(idSchema, orderId),
        input.expectedOrderVersion,
        input.method,
        parse(idempotencyKeySchema, idempotencyKey),
      ),
    );
  }

  @Post("orders/:orderId/handoff/complete")
  @HttpCode(200)
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_HANDOFF)
  completeHandoff(
    @Param("orderId") orderId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(completeHandoffSchema, body);
    return execute(() =>
      this.commercial.completeHandoff(
        context(request),
        parse(idSchema, orderId),
        input.expectedHandoffVersion,
        parse(idempotencyKeySchema, idempotencyKey),
      ),
    );
  }
}

@Controller("v1/patient/pharmacy")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PatientPharmacyCommercialController {
  constructor(
    @Inject(PharmacyCommercialService) private readonly commercial: PharmacyCommercialService,
  ) {}

  @Get("quotes/:quoteId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_PHARMACY_QUOTE)
  getQuote(@Param("quoteId") quoteId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.commercial.getQuote(context(request), parse(idSchema, quoteId)));
  }

  @Post("quotes/:quoteId/accept")
  @PolicyProtected(AUTHORIZATION_POLICY.ACCEPT_PHARMACY_QUOTE)
  acceptQuote(
    @Param("quoteId") quoteId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(acceptQuoteSchema, body);
    return execute(() =>
      this.commercial.acceptQuote(
        context(request),
        parse(idSchema, quoteId),
        input.expectedVersion,
        parse(idempotencyKeySchema, idempotencyKey),
      ),
    );
  }

  @Get("orders/:orderId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_PHARMACY_ORDER)
  getOrder(@Param("orderId") orderId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.commercial.getOrder(context(request), parse(idSchema, orderId)));
  }

  @Post("orders/:orderId/cancel")
  @HttpCode(200)
  @PolicyProtected(AUTHORIZATION_POLICY.CANCEL_OWN_PHARMACY_ORDER)
  cancelOrder(
    @Param("orderId") orderId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(orderResolutionSchema, body);
    return execute(() =>
      this.commercial.cancelOrder(
        context(request),
        parse(idSchema, orderId),
        input.expectedVersion,
        input.reasonCode,
        parse(idempotencyKeySchema, idempotencyKey),
      ),
    );
  }
}

@Controller("v1/admin/pharmacy")
@UseGuards(AuthenticatedInternalRequestGuard)
export class AdminPharmacyCommercialController {
  constructor(
    @Inject(PharmacyCommercialService) private readonly commercial: PharmacyCommercialService,
  ) {}

  @Post("orders/:orderId/disputes")
  @PolicyProtected(AUTHORIZATION_POLICY.ADMINISTER_PHARMACY_DISPUTE)
  requestDispute(
    @Param("orderId") orderId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(orderResolutionSchema, body);
    return execute(() =>
      this.commercial.requestDispute(
        context(request),
        parse(idSchema, orderId),
        input.expectedVersion,
        input.reasonCode,
        parse(idempotencyKeySchema, idempotencyKey),
      ),
    );
  }
}

function context(request: AuthenticatedInternalRequest) {
  const requestId = request.headers["x-request-id"];
  if (typeof requestId !== "string") {
    throw new HttpException(
      { error: "missing_request_id", message: "Request ID is required" },
      400,
    );
  }
  return { actor: request.currentSession, requestId };
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
    if (error instanceof PharmacyCommercialFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    if (error instanceof PharmacyCommercialConflictError || isDatabaseConflict(error)) {
      throw new HttpException(
        { error: "pharmacy_commercial_conflict", message: "Request conflicts with current data" },
        409,
      );
    }
    throw error;
  }
}

function isDatabaseConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2003" || error.code === "P2004")
  );
}
