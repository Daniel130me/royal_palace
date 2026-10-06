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
  Patch,
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
import { PrescriptionFlowError, PrescriptionService } from "../application/prescription.service.js";
import { PrescriptionConflictError } from "../domain/prescription.types.js";

const idSchema = z.uuid();
const expectedVersionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).optional();
const itemSchema = z
  .object({
    controlledMedication: z.boolean().default(false),
    dose: z.string().trim().min(1).max(240),
    duration: optionalText(120),
    frequency: z.string().trim().min(1).max(240),
    instructions: optionalText(1000),
    medicationCode: optionalText(120),
    medicationCodeSystem: z.url().max(255).optional(),
    medicationName: z.string().trim().min(1).max(240),
    quantity: z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/),
    quantityUnit: z.string().trim().min(1).max(64),
    refillsAuthorized: z.number().int().min(0).max(99).default(0),
    route: optionalText(120),
    strength: optionalText(120),
    substitutionAllowed: z.boolean().default(false),
  })
  .strict()
  .refine((item) => Number(item.quantity) > 0, { path: ["quantity"] })
  .refine(
    (item) => (item.medicationCode === undefined) === (item.medicationCodeSystem === undefined),
    { path: ["medicationCodeSystem"] },
  );
const draftFields = {
  appointmentId: idSchema,
  clinicalNote: optionalText(2000),
  items: z.array(itemSchema).min(1).max(50),
  jurisdictionCode: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]+$/)
    .transform((value) => value.toUpperCase()),
  patientId: idSchema,
  previousPrescriptionId: idSchema.optional(),
} as const;
const createDraftSchema = z.object(draftFields).strict();
const updateDraftSchema = z
  .object({ ...draftFields, expectedVersion: z.number().int().positive() })
  .strict();
const signSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    validUntil: z.iso.datetime({ offset: true }),
  })
  .strict();
const routeSchema = z
  .object({ expectedVersion: z.number().int().positive(), pharmacyOrganizationId: idSchema })
  .strict();
const cancelSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reasonCode: z.enum([
      "clinical_correction",
      "issued_in_error",
      "patient_safety",
      "superseded_by_amendment",
      "therapy_changed",
    ]),
  })
  .strict();
const queueSchema = z
  .object({
    cursor: z.string().trim().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
const expirationSchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(100) })
  .strict();

@Controller("v1/provider/prescriptions")
@UseGuards(AuthenticatedInternalRequestGuard)
export class ProviderPrescriptionController {
  constructor(@Inject(PrescriptionService) private readonly prescriptions: PrescriptionService) {}

  @Post()
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_PRESCRIPTION)
  create(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.prescriptions.createDraft(context(request), parse(createDraftSchema, body)),
    );
  }

  @Patch(":prescriptionId/draft")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_PRESCRIPTION)
  update(
    @Param("prescriptionId") prescriptionId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const { expectedVersion, ...draft } = parse(updateDraftSchema, body);
    return execute(() =>
      this.prescriptions.updateDraft(
        context(request),
        parse(idSchema, prescriptionId),
        expectedVersion,
        draft,
      ),
    );
  }

  @Post(":prescriptionId/sign")
  @HttpCode(HttpStatus.OK)
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_PRESCRIPTION)
  sign(
    @Param("prescriptionId") prescriptionId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(signSchema, body);
    return execute(() =>
      this.prescriptions.sign(
        context(request),
        parse(idSchema, prescriptionId),
        input.expectedVersion,
        input.validUntil,
      ),
    );
  }

  @Post(":prescriptionId/cancel")
  @HttpCode(HttpStatus.OK)
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_PRESCRIPTION)
  cancel(
    @Param("prescriptionId") prescriptionId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(cancelSchema, body);
    return execute(() =>
      this.prescriptions.cancel(
        context(request),
        parse(idSchema, prescriptionId),
        input.expectedVersion,
        input.reasonCode,
      ),
    );
  }
}

@Controller("v1/prescriptions")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PrescriptionReadController {
  constructor(@Inject(PrescriptionService) private readonly prescriptions: PrescriptionService) {}

  @Get(":prescriptionId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_PRESCRIPTION)
  get(
    @Param("prescriptionId") prescriptionId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() => this.prescriptions.get(context(request), parse(idSchema, prescriptionId)));
  }
}

@Controller("v1/patient/prescriptions")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PatientPrescriptionController {
  constructor(@Inject(PrescriptionService) private readonly prescriptions: PrescriptionService) {}

  @Post(":prescriptionId/send")
  @HttpCode(HttpStatus.OK)
  @PolicyProtected(AUTHORIZATION_POLICY.ROUTE_PRESCRIPTION)
  send(
    @Param("prescriptionId") prescriptionId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(routeSchema, body);
    return execute(() =>
      this.prescriptions.routeToPharmacy(
        context(request),
        parse(idSchema, prescriptionId),
        input.pharmacyOrganizationId,
        input.expectedVersion,
      ),
    );
  }
}

@Controller("v1/pharmacy/prescriptions")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PharmacyPrescriptionController {
  constructor(@Inject(PrescriptionService) private readonly prescriptions: PrescriptionService) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_PRESCRIPTION)
  list(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(queueSchema, query);
    return execute(() =>
      this.prescriptions.listPharmacyQueue(
        context(request),
        parse(idSchema, organizationId),
        input,
      ),
    );
  }

  @Post(":prescriptionId/accept")
  @HttpCode(HttpStatus.OK)
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_PRESCRIPTION)
  accept(
    @Param("prescriptionId") prescriptionId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(expectedVersionSchema, body);
    return execute(() =>
      this.prescriptions.acceptAtPharmacy(
        context(request),
        parse(idSchema, prescriptionId),
        parse(idSchema, organizationId),
        input.expectedVersion,
      ),
    );
  }
}

@Controller("v1/internal/prescriptions")
@UseGuards(AuthenticatedInternalRequestGuard)
export class InternalPrescriptionController {
  constructor(@Inject(PrescriptionService) private readonly prescriptions: PrescriptionService) {}

  @Post("expire-due")
  @HttpCode(HttpStatus.OK)
  @PolicyProtected(AUTHORIZATION_POLICY.EXPIRE_PRESCRIPTIONS)
  expire(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    const { limit } = parse(expirationSchema, query);
    return execute(() => this.prescriptions.expireDue(context(request), limit));
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
    if (error instanceof PrescriptionFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    if (error instanceof PrescriptionConflictError || isDatabaseConflict(error)) {
      throw new HttpException(
        { error: "prescription_conflict", message: "The request conflicts with current data" },
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
