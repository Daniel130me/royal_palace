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
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { PolicyProtected } from "../../authorization/presentation/policy-protected.decorator.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  ScannedPrescriptionFlowError,
  ScannedPrescriptionService,
} from "../application/scanned-prescription.service.js";
import { InvalidScannedPrescriptionError } from "../domain/scanned-prescription-policy.js";

const idSchema = z.uuid();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value.length === 0 ? null : value));
const createSchema = z
  .object({
    declaredContentType: z.enum([
      "application/pdf",
      "image/heic",
      "image/heif",
      "image/jpeg",
      "image/png",
    ]),
    declaredSha256: z.string().regex(/^[0-9a-f]{64}$/),
    declaredSizeBytes: z.number().int().positive(),
    originalFilename: z.string().min(1).max(255),
    patientNote: optionalText(1000),
    pharmacyOrganizationId: idSchema.nullish().transform((value) => value ?? null),
    prescriberFacility: optionalText(200),
    prescriberName: optionalText(200),
  })
  .strict();
const listSchema = z
  .object({
    cursor: z.string().trim().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
const reviewSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    patientVisibleNote: z
      .string()
      .trim()
      .min(2)
      .max(1000)
      .nullish()
      .transform((value) => value ?? null),
  })
  .strict();

@Controller("v1/patient/scanned-prescriptions")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PatientScannedPrescriptionController {
  constructor(
    @Inject(ScannedPrescriptionService)
    private readonly prescriptions: ScannedPrescriptionService,
  ) {}

  @Post("upload-intents")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_SCANNED_PRESCRIPTION)
  create(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.prescriptions.createUploadIntent(context(request), parse(createSchema, body)),
    );
  }

  @Post(":prescriptionId/complete")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_SCANNED_PRESCRIPTION)
  complete(
    @Param("prescriptionId") prescriptionId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.prescriptions.completeUpload(context(request), parse(idSchema, prescriptionId)),
    );
  }

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_SCANNED_PRESCRIPTION)
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    const input = parse(listSchema, query);
    return execute(() => this.prescriptions.listOwned(context(request), input.limit, input.cursor));
  }

  @Get(":prescriptionId")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_SCANNED_PRESCRIPTION)
  find(
    @Param("prescriptionId") prescriptionId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.prescriptions.findOwned(context(request), parse(idSchema, prescriptionId)),
    );
  }

  @Get(":prescriptionId/download")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_SCANNED_PRESCRIPTION)
  download(
    @Param("prescriptionId") prescriptionId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.prescriptions.downloadOwned(context(request), parse(idSchema, prescriptionId)),
    );
  }
}

@Controller("v1/pharmacy/scanned-prescriptions")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PharmacyScannedPrescriptionController {
  constructor(
    @Inject(ScannedPrescriptionService)
    private readonly prescriptions: ScannedPrescriptionService,
  ) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_SCANNED_PRESCRIPTION)
  list(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(listSchema, query);
    return execute(() =>
      this.prescriptions.listForPharmacy(
        context(request),
        parse(idSchema, organizationId),
        input.limit,
        input.cursor,
      ),
    );
  }

  @Get(":prescriptionId")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_SCANNED_PRESCRIPTION)
  find(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Param("prescriptionId") prescriptionId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.prescriptions.findForPharmacy(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, prescriptionId),
      ),
    );
  }

  @Get(":prescriptionId/download")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_SCANNED_PRESCRIPTION)
  download(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Param("prescriptionId") prescriptionId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.prescriptions.downloadForPharmacy(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, prescriptionId),
      ),
    );
  }

  @Post(":prescriptionId/:action")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_SCANNED_PRESCRIPTION)
  transition(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Param("prescriptionId") prescriptionId: string,
    @Param("action") action: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const actionStatus = {
      approve: "APPROVED",
      "request-information": "MORE_INFORMATION_REQUIRED",
      reject: "REJECTED",
      "start-review": "UNDER_REVIEW",
    } as const;
    const toStatus = actionStatus[action as keyof typeof actionStatus];
    if (toStatus === undefined) {
      throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
    }
    return execute(() =>
      this.prescriptions.transitionReview(context(request), {
        ...parse(reviewSchema, body),
        pharmacyOrganizationId: parse(idSchema, organizationId),
        prescriptionId: parse(idSchema, prescriptionId),
        toStatus,
      }),
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
    if (error instanceof ScannedPrescriptionFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    if (error instanceof InvalidScannedPrescriptionError) {
      throw new HttpException({ error: error.code, message: error.message }, 400);
    }
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    throw error;
  }
}
