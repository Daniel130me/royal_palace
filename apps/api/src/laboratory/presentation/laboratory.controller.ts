import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
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
import { LaboratoryFlowError, LaboratoryService } from "../application/laboratory.service.js";
import { LaboratoryConflictError } from "../domain/laboratory.types.js";

const idSchema = z.uuid();
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).optional();
const requestSchema = z
  .object({
    appointmentId: idSchema,
    clinicalIndication: z.string().trim().min(1).max(2000),
    patientId: idSchema,
    priority: z.enum(["ROUTINE", "URGENT"]).default("ROUTINE"),
    serviceId: idSchema,
    specimenInstructions: optionalText(1000),
  })
  .strict();
const listSchema = z
  .object({
    cursor: z.string().trim().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
const providerListSchema = listSchema.extend({ patientId: idSchema.optional() }).strict();
const bookingBaseSchema = {
  expectedVersion: z.number().int().positive(),
  laboratoryOrganizationId: idSchema,
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
};
const bookingSchema = z.discriminatedUnion("collectionMode", [
  z.object({ ...bookingBaseSchema, collectionMode: z.literal("FACILITY") }).strict(),
  z
    .object({
      ...bookingBaseSchema,
      collectionMode: z.literal("HOME"),
      homeCollection: z
        .object({
          addressLine1: z.string().trim().min(1).max(200),
          addressLine2: optionalText(200),
          administrativeArea: optionalText(100),
          collectionInstructions: optionalText(1000),
          countryCode: z
            .string()
            .trim()
            .regex(/^[A-Za-z]{2}$/)
            .transform((value) => value.toUpperCase()),
          locality: z.string().trim().min(1).max(100),
          postalCode: optionalText(32),
        })
        .strict(),
    })
    .strict(),
]);
const bookingStatusSchema = z.enum([
  "CONFIRMED",
  "SAMPLE_COLLECTION_PENDING",
  "SAMPLE_COLLECTED",
  "PROCESSING",
  "RESULT_READY",
  "COMPLETED",
  "CANCELLED",
]);
const laboratoryQueueSchema = listSchema
  .extend({ status: bookingStatusSchema.optional() })
  .strict();
const transitionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reasonCode: z.enum([
      "collection_arranged",
      "sample_collected",
      "processing_started",
      "patient_cancelled",
      "laboratory_cancelled",
      "sample_invalid",
    ]),
    // Result-ready and completion are reserved for the result-publication slice.
    toStatus: z.enum(["SAMPLE_COLLECTION_PENDING", "SAMPLE_COLLECTED", "PROCESSING", "CANCELLED"]),
  })
  .strict()
  .refine(
    (input) =>
      (input.toStatus === "SAMPLE_COLLECTION_PENDING" &&
        input.reasonCode === "collection_arranged") ||
      (input.toStatus === "SAMPLE_COLLECTED" && input.reasonCode === "sample_collected") ||
      (input.toStatus === "PROCESSING" && input.reasonCode === "processing_started") ||
      (input.toStatus === "CANCELLED" &&
        ["patient_cancelled", "laboratory_cancelled", "sample_invalid"].includes(input.reasonCode)),
    { path: ["reasonCode"] },
  );
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

@Controller("v1/provider/laboratory-requests")
@UseGuards(AuthenticatedInternalRequestGuard)
export class ProviderLaboratoryController {
  constructor(@Inject(LaboratoryService) private readonly laboratory: LaboratoryService) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_LABORATORY_REQUEST)
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.laboratory.listForPractitioner(context(request), parse(providerListSchema, query)),
    );
  }

  @Post()
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_LABORATORY_REQUEST)
  create(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.laboratory.createRequest(context(request), parse(requestSchema, body)),
    );
  }
}

@Controller("v1/patient/laboratory-requests")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PatientLaboratoryController {
  constructor(@Inject(LaboratoryService) private readonly laboratory: LaboratoryService) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.ROUTE_LABORATORY_REQUEST)
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.laboratory.listForPatient(context(request), parse(listSchema, query)),
    );
  }

  @Post(":requestId/bookings")
  @PolicyProtected(AUTHORIZATION_POLICY.ROUTE_LABORATORY_REQUEST)
  book(
    @Param("requestId") requestId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.laboratory.book(
        context(request),
        parse(idSchema, requestId),
        parse(idempotencyKeySchema, idempotencyKey),
        parse(bookingSchema, body),
      ),
    );
  }
}

@Controller("v1/laboratory-requests")
@UseGuards(AuthenticatedInternalRequestGuard)
export class LaboratoryRequestReadController {
  constructor(@Inject(LaboratoryService) private readonly laboratory: LaboratoryService) {}

  @Get(":requestId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LABORATORY_REQUEST)
  get(@Param("requestId") requestId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.laboratory.get(context(request), parse(idSchema, requestId)));
  }
}

@Controller("v1/laboratory")
@UseGuards(AuthenticatedInternalRequestGuard)
export class LaboratoryOperationsController {
  constructor(@Inject(LaboratoryService) private readonly laboratory: LaboratoryService) {}

  @Get("bookings")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LABORATORY_BOOKING)
  list(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.laboratory.listLaboratoryQueue(
        context(request),
        parse(idSchema, organizationId),
        parse(laboratoryQueueSchema, query),
      ),
    );
  }

  @Get("bookings/:bookingId")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LABORATORY_BOOKING)
  get(
    @Param("bookingId") bookingId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.laboratory.getLaboratoryBooking(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, bookingId),
      ),
    );
  }

  @Post("bookings/:bookingId/transitions")
  @HttpCode(HttpStatus.OK)
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LABORATORY_BOOKING)
  transition(
    @Param("bookingId") bookingId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.laboratory.transitionBooking(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, bookingId),
        parse(transitionSchema, body),
      ),
    );
  }
}

export function context(request: AuthenticatedInternalRequest) {
  const requestId = request.headers["x-request-id"];
  if (typeof requestId !== "string") {
    throw new HttpException(
      { error: "missing_request_id", message: "Request ID is required" },
      400,
    );
  }
  return { actor: request.currentSession, requestId };
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
  }
  return result.data;
}

export async function execute<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LaboratoryFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    if (error instanceof LaboratoryConflictError || isDatabaseConflict(error)) {
      throw new HttpException(
        { error: "laboratory_conflict", message: "The request conflicts with current data" },
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
