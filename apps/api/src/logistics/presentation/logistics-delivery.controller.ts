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
  LogisticsDeliveryService,
  LogisticsFlowError,
} from "../application/logistics-delivery.service.js";
import { LogisticsConflictError } from "../domain/logistics-delivery.types.js";

const idSchema = z.uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(128);
const reasonCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  .transform((value) => value.toUpperCase());
const phoneSchema = z.string().regex(/^\+[1-9]\d{6,14}$/);
const addressSchema = z
  .object({
    addressLine1: z.string().trim().min(2).max(200),
    addressLine2: z.string().trim().min(1).max(200).optional(),
    administrativeArea: z.string().trim().min(1).max(120),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase()),
    locality: z.string().trim().min(1).max(120),
    postalCode: z.string().trim().min(1).max(32).optional(),
  })
  .strict();
const dispatchSchema = z
  .object({
    courierPrincipalId: idSchema.optional(),
    deliveryAddress: addressSchema,
    deliveryInstruction: z.string().trim().min(1).max(500).optional(),
    handoffId: idSchema,
    logisticsOrganizationId: idSchema,
    pickupAddress: addressSchema,
    pickupContactName: z.string().trim().min(1).max(160),
    pickupContactPhoneE164: phoneSchema,
    pickupLocationName: z.string().trim().min(1).max(120),
    recipientName: z.string().trim().min(1).max(160),
    recipientPhoneE164: phoneSchema,
  })
  .strict();
const reassignSchema = z
  .object({
    courierPrincipalId: idSchema.optional(),
    expectedVersion: z.number().int().positive(),
    logisticsOrganizationId: idSchema,
    reasonCode: reasonCodeSchema,
  })
  .strict();
const cancelSchema = z
  .object({ expectedVersion: z.number().int().positive(), reasonCode: reasonCodeSchema })
  .strict();
const assignCourierSchema = z
  .object({ courierPrincipalId: idSchema, expectedAssignmentVersion: z.number().int().positive() })
  .strict();
const transitionStatusSchema = z.enum([
  "ACCEPTED",
  "HEADING_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKUP_VERIFIED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED_AT_DESTINATION",
  "FAILED",
  "RETURNED",
]);
const transitionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reasonCode: reasonCodeSchema.optional(),
    toStatus: transitionStatusSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (["FAILED", "RETURNED"].includes(input.toStatus) && input.reasonCode === undefined) {
      context.addIssue({ code: "custom", message: "reasonCode is required", path: ["reasonCode"] });
    }
  });
const listSchema = z
  .object({
    cursor: z.string().trim().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    status: z
      .enum([
        "ASSIGNED",
        "ACCEPTED",
        "HEADING_TO_PICKUP",
        "ARRIVED_AT_PICKUP",
        "PICKUP_VERIFIED",
        "PICKED_UP",
        "IN_TRANSIT",
        "ARRIVED_AT_DESTINATION",
        "DELIVERED",
        "FAILED",
        "RETURNED",
        "CANCELLED",
      ])
      .optional(),
  })
  .strict();
const historySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
  .strict();

@Controller("v1/admin/logistics/deliveries")
@UseGuards(AuthenticatedInternalRequestGuard)
export class AdminLogisticsDeliveryController {
  constructor(
    @Inject(LogisticsDeliveryService) private readonly deliveries: LogisticsDeliveryService,
  ) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.ADMINISTER_LOGISTICS_ASSIGNMENT)
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.deliveries.listAdmin(context(request), parse(listSchema, query)));
  }

  @Get(":deliveryId")
  @PolicyProtected(AUTHORIZATION_POLICY.ADMINISTER_LOGISTICS_ASSIGNMENT)
  get(@Param("deliveryId") deliveryId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.deliveries.getAdmin(context(request), parse(idSchema, deliveryId)));
  }

  @Post()
  @PolicyProtected(AUTHORIZATION_POLICY.ADMINISTER_LOGISTICS_ASSIGNMENT)
  dispatch(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.deliveries.dispatch(context(request), {
        ...parse(dispatchSchema, body),
        idempotencyKey: parse(idempotencyKeySchema, idempotencyKey),
      }),
    );
  }

  @Post(":deliveryId/reassign")
  @HttpCode(200)
  @PolicyProtected(AUTHORIZATION_POLICY.ADMINISTER_LOGISTICS_ASSIGNMENT)
  reassign(
    @Param("deliveryId") deliveryId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.deliveries.reassign(context(request), parse(idSchema, deliveryId), {
        ...parse(reassignSchema, body),
        idempotencyKey: parse(idempotencyKeySchema, idempotencyKey),
      }),
    );
  }

  @Post(":deliveryId/cancel")
  @HttpCode(200)
  @PolicyProtected(AUTHORIZATION_POLICY.ADMINISTER_LOGISTICS_ASSIGNMENT)
  cancel(
    @Param("deliveryId") deliveryId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.deliveries.cancel(context(request), parse(idSchema, deliveryId), {
        ...parse(cancelSchema, body),
        idempotencyKey: parse(idempotencyKeySchema, idempotencyKey),
      }),
    );
  }
}

@Controller("v1/logistics/deliveries")
@UseGuards(AuthenticatedInternalRequestGuard)
export class LogisticsDeliveryController {
  constructor(
    @Inject(LogisticsDeliveryService) private readonly deliveries: LogisticsDeliveryService,
  ) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LOGISTICS_DELIVERY)
  list(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.deliveries.listOrganization(
        context(request),
        parse(idSchema, organizationId),
        parse(listSchema, query),
      ),
    );
  }

  @Get(":deliveryId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LOGISTICS_DELIVERY)
  get(
    @Param("deliveryId") deliveryId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.deliveries.getOrganization(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, deliveryId),
      ),
    );
  }

  @Get(":deliveryId/history")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LOGISTICS_DELIVERY)
  history(
    @Param("deliveryId") deliveryId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(historySchema, query);
    return execute(() =>
      this.deliveries.history(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, deliveryId),
        input.limit,
      ),
    );
  }

  @Post(":deliveryId/courier-assignment")
  @HttpCode(200)
  @PolicyProtected(AUTHORIZATION_POLICY.ADMINISTER_LOGISTICS_COURIER_ASSIGNMENT)
  assignCourier(
    @Param("deliveryId") deliveryId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.deliveries.assignCourier(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, deliveryId),
        {
          ...parse(assignCourierSchema, body),
          idempotencyKey: parse(idempotencyKeySchema, idempotencyKey),
        },
      ),
    );
  }

  @Post(":deliveryId/transitions")
  @HttpCode(200)
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LOGISTICS_DELIVERY)
  transition(
    @Param("deliveryId") deliveryId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.deliveries.transition(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, deliveryId),
        {
          ...parse(transitionSchema, body),
          idempotencyKey: parse(idempotencyKeySchema, idempotencyKey),
        },
      ),
    );
  }
}

@Controller("v1/patient/logistics/deliveries")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PatientLogisticsDeliveryController {
  constructor(
    @Inject(LogisticsDeliveryService) private readonly deliveries: LogisticsDeliveryService,
  ) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LOGISTICS_DELIVERY)
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.deliveries.listPatient(context(request), parse(listSchema, query)));
  }

  @Get(":deliveryId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LOGISTICS_DELIVERY)
  get(@Param("deliveryId") deliveryId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.deliveries.getPatient(context(request), parse(idSchema, deliveryId)));
  }
}

@Controller("v1/pharmacy/logistics-deliveries")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PharmacyLogisticsDeliveryController {
  constructor(
    @Inject(LogisticsDeliveryService) private readonly deliveries: LogisticsDeliveryService,
  ) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LOGISTICS_DELIVERY)
  list(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.deliveries.listPharmacy(
        context(request),
        parse(idSchema, organizationId),
        parse(listSchema, query),
      ),
    );
  }

  @Get(":deliveryId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LOGISTICS_DELIVERY)
  get(
    @Param("deliveryId") deliveryId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.deliveries.getPharmacy(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, deliveryId),
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
    if (error instanceof LogisticsFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    if (error instanceof LogisticsConflictError || isDatabaseConflict(error)) {
      throw new HttpException(
        { error: "logistics_delivery_conflict", message: "Request conflicts with current data" },
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
