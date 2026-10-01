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
  Query,
  type RawBodyRequest,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  SchedulingPaymentFlowError,
  SchedulingPaymentService,
} from "../application/scheduling-payment.service.js";

const idSchema = z.uuid();
const instantSchema = z.iso.datetime({ offset: true });
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/);
const modeSchema = z.enum(["VIDEO", "AUDIO", "CHAT", "IN_PERSON", "HOME_VISIT"]);
const feeSchema = z
  .object({
    amountMinor: z.string().regex(/^\d{1,19}$/),
    currency: z.string().regex(/^[A-Za-z]{3}$/),
    effectiveFrom: instantSchema,
    effectiveUntil: instantSchema.optional(),
    mode: modeSchema,
  })
  .strict();
const activateSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
const availabilitySchema = z
  .object({
    consultationFeeId: idSchema,
    endsAt: instantSchema,
    practitionerId: idSchema,
    startsAt: instantSchema,
  })
  .strict();
const bookSchema = z.object({ availabilitySlotId: idSchema }).strict();
const checkoutSchema = z.object({ paymentId: idSchema }).strict();
const availabilityQuerySchema = z.object({ from: instantSchema, to: instantSchema }).strict();
const expirationQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(100) })
  .strict();

@Controller("v1/public/practitioners")
export class PublicSchedulingController {
  constructor(
    @Inject(SchedulingPaymentService) private readonly scheduling: SchedulingPaymentService,
  ) {}

  @Get(":practitionerId/availability")
  list(@Param("practitionerId") practitionerId: string, @Query() query: unknown) {
    const range = parse(availabilityQuerySchema, query);
    return execute(() =>
      this.scheduling.listAvailability({
        ...range,
        practitionerId: parse(idSchema, practitionerId),
      }),
    );
  }
}

@Controller("v1/provider/availability")
@UseGuards(AuthenticatedInternalRequestGuard)
export class ProviderAvailabilityController {
  constructor(
    @Inject(SchedulingPaymentService) private readonly scheduling: SchedulingPaymentService,
  ) {}

  @Post()
  create(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.scheduling.createAvailability(requestContext(request), parse(availabilitySchema, body)),
    );
  }
}

@Controller("v1/admin")
@UseGuards(AuthenticatedInternalRequestGuard)
export class AdminSchedulingPaymentController {
  constructor(
    @Inject(SchedulingPaymentService) private readonly scheduling: SchedulingPaymentService,
  ) {}

  @Post("practitioners/:practitionerId/consultation-fees")
  createFee(
    @Param("practitionerId") practitionerId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.scheduling.createConsultationFee(
        requestContext(request),
        parse(idSchema, practitionerId),
        parse(feeSchema, body),
      ),
    );
  }

  @Post("consultation-fees/:feeId/activate")
  activateFee(
    @Param("feeId") feeId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(activateSchema, body);
    return execute(() =>
      this.scheduling.activateConsultationFee(
        requestContext(request),
        parse(idSchema, feeId),
        input.expectedVersion,
      ),
    );
  }

  @Post("payments/:paymentId/reconcile")
  reconcile(@Param("paymentId") paymentId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.scheduling.reconcilePayment(requestContext(request), parse(idSchema, paymentId)),
    );
  }
}

@Controller("v1")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PatientSchedulingPaymentController {
  constructor(
    @Inject(SchedulingPaymentService) private readonly scheduling: SchedulingPaymentService,
  ) {}

  @Post("appointments")
  book(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(bookSchema, body);
    return execute(() =>
      this.scheduling.bookAppointment(
        requestContext(request),
        input.availabilitySlotId,
        parse(idempotencyKeySchema, idempotencyKey),
      ),
    );
  }

  @Get("appointments/:appointmentId")
  appointment(
    @Param("appointmentId") appointmentId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.scheduling.getAppointment(requestContext(request), parse(idSchema, appointmentId)),
    );
  }

  @Post("payments/checkout-sessions")
  checkout(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(checkoutSchema, body);
    return execute(() =>
      this.scheduling.createHostedCheckout(
        requestContext(request),
        input.paymentId,
        parse(idempotencyKeySchema, idempotencyKey),
      ),
    );
  }

  @Get("payments/:paymentId/status")
  paymentStatus(
    @Param("paymentId") paymentId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.scheduling.getPaymentStatus(requestContext(request), parse(idSchema, paymentId)),
    );
  }
}

@Controller("v1/internal/scheduling")
@UseGuards(AuthenticatedInternalRequestGuard)
export class InternalSchedulingPaymentController {
  constructor(
    @Inject(SchedulingPaymentService) private readonly scheduling: SchedulingPaymentService,
  ) {}

  @Post("expire-due-reservations")
  expireDue(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    const { limit } = parse(expirationQuerySchema, query);
    return execute(() => this.scheduling.expireDueReservations(requestContext(request), limit));
  }
}

@Controller("v1/webhooks/payments")
export class PaymentWebhookController {
  constructor(
    @Inject(SchedulingPaymentService) private readonly scheduling: SchedulingPaymentService,
  ) {}

  @Post(":providerCode")
  @HttpCode(200)
  webhook(
    @Param("providerCode") providerCode: string,
    @Req() request: RawBodyRequest<FastifyRequest>,
  ) {
    if (request.rawBody === undefined) {
      throw new HttpException(
        { error: "missing_raw_body", message: "Webhook payload is unavailable" },
        400,
      );
    }
    const rawBody = request.rawBody;
    return execute(async () => {
      const result = await this.scheduling.processWebhook({
        headers: request.headers,
        providerCode,
        rawBody,
      });
      return { accepted: true, duplicate: result.duplicate };
    });
  }
}

function requestContext(request: AuthenticatedInternalRequest) {
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
    if (error instanceof SchedulingPaymentFlowError) {
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
          error: "scheduling_payment_conflict",
          message: "The request conflicts with current data",
        },
        409,
      );
    }
    throw error;
  }
}
