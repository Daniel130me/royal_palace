import {
  Body,
  Controller,
  Get,
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
import type {
  OnboardingApplicationData,
  OnboardingApplicationDetail,
  OnboardingApplicationListResponse,
} from "@royal-palace/contracts";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { InvalidReferralClaimError } from "../../manager/application/referral-claim.service.js";
import { InvalidApplicationCursorError } from "../application/application-cursor.js";
import {
  MAX_APPLICATION_PAGE_SIZE,
  OnboardingFlowError,
  OnboardingService,
} from "../application/onboarding.service.js";
import { InvalidApplicationTransitionError } from "../domain/application-state-machine.js";
import {
  ApplicationConflictError,
  InvalidCatalogueSelectionError,
} from "../infrastructure/prisma-onboarding.repository.js";

const idSchema = z.uuid();
const nullableTrimmed = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();
const nullableCountryCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) => value.toUpperCase())
  .nullable();
const nullablePhone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/)
  .nullable();
const patientDataSchema = z
  .object({
    countryCode: nullableCountryCode,
    dateOfBirth: z.iso.date().nullable(),
    familyName: z.string().trim().min(1).max(100),
    givenName: z.string().trim().min(1).max(100),
    phoneE164: nullablePhone,
    preferredLanguage: z.string().trim().min(2).max(35).nullable(),
  })
  .strict();
const organizationDataSchema = z
  .object({
    addressLine1: nullableTrimmed(200),
    addressLine2: nullableTrimmed(200),
    administrativeArea: nullableTrimmed(100),
    contactEmail: z.email().max(320),
    contactName: z.string().trim().min(1).max(160),
    contactPhoneE164: nullablePhone,
    countryCode: nullableCountryCode.unwrap(),
    displayName: z.string().trim().min(1).max(120),
    legalName: z.string().trim().min(1).max(200),
    locality: nullableTrimmed(100),
    organizationType: z.enum(["HOSPITAL", "PHARMACY", "LABORATORY"]),
    postalCode: nullableTrimmed(32),
    jurisdictionCode: z.string().trim().min(1).max(16),
    registrationAuthority: z.string().trim().min(1).max(200),
    registrationNumber: z.string().trim().min(1).max(160),
    serviceIds: z.array(idSchema).max(250),
  })
  .strict();
const practitionerDataSchema = z
  .object({
    biography: nullableTrimmed(3000),
    credentialType: z.string().trim().min(1).max(80),
    facilityName: nullableTrimmed(200),
    familyName: z.string().trim().min(1).max(100),
    givenName: z.string().trim().min(1).max(100),
    honorific: nullableTrimmed(40),
    jurisdictionCode: z.string().trim().min(1).max(16),
    professionIds: z.array(idSchema).max(50),
    registrationAuthority: z.string().trim().min(1).max(200),
    registrationNumber: z.string().trim().min(1).max(160),
    selectedOrganizationId: idSchema.nullable(),
    specialtyIds: z.array(idSchema).max(100),
  })
  .strict();
const referralTokenSchema = z.string().trim().min(1).max(512).optional();
const patientCreateSchema = patientDataSchema.extend({ referralToken: referralTokenSchema });
const organizationCreateSchema = organizationDataSchema.extend({
  referralToken: referralTokenSchema,
});
const versionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
const withdrawalSchema = versionSchema.extend({
  note: z.string().trim().min(1).max(2000).optional(),
});
const documentSchema = z
  .object({
    declaredContentType: z.string().trim().min(1).max(127),
    declaredSha256: z.string().regex(/^[0-9a-f]{64}$/),
    declaredSizeBytes: z
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024),
    originalFilename: z.string().trim().min(1).max(255),
    purpose: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{1,79}$/),
  })
  .strict();
const listSchema = z
  .object({
    applicantPrincipalId: idSchema.optional(),
    cursor: z.string().min(1).max(2048).optional(),
    kind: z.enum(["PATIENT", "ORGANIZATION", "PRACTITIONER"]).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_APPLICATION_PAGE_SIZE).optional(),
    status: z
      .enum([
        "DRAFT",
        "SUBMITTED",
        "UNDER_REVIEW",
        "MORE_INFORMATION_REQUIRED",
        "APPROVED",
        "REJECTED",
        "WITHDRAWN",
      ])
      .optional(),
  })
  .strict();
const decisionSchema = versionSchema.extend({
  note: z.string().trim().min(1).max(2000).optional(),
  reasonCategory: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,99}$/),
});

@Controller("v1/applications")
@UseGuards(AuthenticatedInternalRequestGuard)
export class ApplicantOnboardingController {
  constructor(@Inject(OnboardingService) private readonly onboarding: OnboardingService) {}

  @Get()
  listOwn(
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ): Promise<OnboardingApplicationListResponse> {
    const { applicantPrincipalId: _ignored, ...filters } = parse(listSchema, query);
    return execute(() => this.onboarding.listOwnApplications(requestContext(request), filters));
  }

  @Post("patients")
  createPatient(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    const { referralToken, ...values } = parse(patientCreateSchema, body);
    return this.create(request, { kind: "PATIENT", values }, referralToken);
  }

  @Get("patients/:applicationId")
  getPatient(@Param("applicationId") id: string, @Req() request: AuthenticatedInternalRequest) {
    return this.get(request, id, "PATIENT");
  }

  @Patch("patients/:applicationId")
  updatePatient(
    @Param("applicationId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return this.update(request, id, "PATIENT", patientDataSchema, body);
  }

  @Post("organizations")
  createOrganization(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    const { referralToken, ...values } = parse(organizationCreateSchema, body);
    return this.create(
      request,
      {
        kind: "ORGANIZATION",
        values,
      },
      referralToken,
    );
  }

  @Get("organizations/:applicationId")
  getOrganization(
    @Param("applicationId") id: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return this.get(request, id, "ORGANIZATION");
  }

  @Patch("organizations/:applicationId")
  updateOrganization(
    @Param("applicationId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return this.update(request, id, "ORGANIZATION", organizationDataSchema, body);
  }

  @Post("practitioners")
  createPractitioner(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    return this.create(request, {
      kind: "PRACTITIONER",
      values: parse(practitionerDataSchema, body),
    });
  }

  @Get("practitioners/:applicationId")
  getPractitioner(
    @Param("applicationId") id: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return this.get(request, id, "PRACTITIONER");
  }

  @Patch("practitioners/:applicationId")
  updatePractitioner(
    @Param("applicationId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return this.update(request, id, "PRACTITIONER", practitionerDataSchema, body);
  }

  @Post(":applicationId/documents/upload-intents")
  reserveDocument(
    @Param("applicationId") rawId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const applicationId = parse(idSchema, rawId);
    return execute(() =>
      this.onboarding.reserveDocument(
        requestContext(request),
        applicationId,
        parse(documentSchema, body),
      ),
    );
  }

  @Post(":applicationId/submit")
  @HttpCode(HttpStatus.OK)
  submit(
    @Param("applicationId") rawId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const applicationId = parse(idSchema, rawId);
    const input = parse(versionSchema, body);
    return execute(() =>
      this.onboarding.submitOwnApplication(
        requestContext(request),
        applicationId,
        input.expectedVersion,
      ),
    );
  }

  @Post(":applicationId/withdraw")
  @HttpCode(HttpStatus.OK)
  withdraw(
    @Param("applicationId") rawId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const applicationId = parse(idSchema, rawId);
    const input = parse(withdrawalSchema, body);
    return execute(() =>
      this.onboarding.withdrawOwnApplication(
        requestContext(request),
        applicationId,
        input.expectedVersion,
        input.note,
      ),
    );
  }

  private create(
    request: AuthenticatedInternalRequest,
    data: OnboardingApplicationData,
    referralToken?: string,
  ) {
    return execute(() =>
      this.onboarding.createApplication(requestContext(request), data, referralToken),
    );
  }

  private async get(
    request: AuthenticatedInternalRequest,
    rawId: string,
    expectedKind: OnboardingApplicationData["kind"],
  ) {
    return requireKind(
      await execute(() =>
        this.onboarding.getOwnApplication(requestContext(request), parse(idSchema, rawId)),
      ),
      expectedKind,
    );
  }

  private update<T>(
    request: AuthenticatedInternalRequest,
    rawId: string,
    kind: OnboardingApplicationData["kind"],
    schema: z.ZodType<T>,
    rawBody: unknown,
  ) {
    const body = parse(
      z.object({ expectedVersion: z.number().int().positive(), values: schema }).strict(),
      rawBody,
    );
    return execute(() =>
      this.onboarding.updateOwnApplication(
        requestContext(request),
        parse(idSchema, rawId),
        body.expectedVersion,
        {
          kind,
          values: body.values,
        } as OnboardingApplicationData,
      ),
    );
  }
}

@Controller("v1/support/applications")
@UseGuards(AuthenticatedInternalRequestGuard)
export class SupportOnboardingController {
  constructor(@Inject(OnboardingService) private readonly onboarding: OnboardingService) {}

  @Get()
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.onboarding.listForReview(requestContext(request), "REVIEW", parse(listSchema, query)),
    );
  }

  @Get(":applicationId")
  get(@Param("applicationId") rawId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.onboarding.getForReview(requestContext(request), parse(idSchema, rawId), "REVIEW"),
    );
  }

  @Post(":applicationId/start-review")
  @HttpCode(HttpStatus.OK)
  startReview(
    @Param("applicationId") rawId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.onboarding.startReview(
        requestContext(request),
        parse(idSchema, rawId),
        parse(versionSchema, body).expectedVersion,
      ),
    );
  }
}

@Controller("v1/admin/applications")
@UseGuards(AuthenticatedInternalRequestGuard)
export class AdminOnboardingController {
  constructor(@Inject(OnboardingService) private readonly onboarding: OnboardingService) {}

  @Get()
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.onboarding.listForReview(requestContext(request), "DECIDE", parse(listSchema, query)),
    );
  }

  @Get(":applicationId")
  get(@Param("applicationId") rawId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.onboarding.getForReview(requestContext(request), parse(idSchema, rawId), "DECIDE"),
    );
  }

  @Post(":applicationId/request-information")
  @HttpCode(HttpStatus.OK)
  requestInformation(
    @Param("applicationId") rawId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return this.decide(request, rawId, body, "MORE_INFORMATION_REQUIRED");
  }

  @Post(":applicationId/approve")
  @HttpCode(HttpStatus.OK)
  approve(
    @Param("applicationId") rawId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return this.decide(request, rawId, body, "APPROVED");
  }

  @Post(":applicationId/reject")
  @HttpCode(HttpStatus.OK)
  reject(
    @Param("applicationId") rawId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return this.decide(request, rawId, body, "REJECTED");
  }

  private decide(
    request: AuthenticatedInternalRequest,
    rawId: string,
    body: unknown,
    toStatus: "APPROVED" | "MORE_INFORMATION_REQUIRED" | "REJECTED",
  ) {
    const input = parse(decisionSchema, body);
    return execute(() =>
      this.onboarding.decide(requestContext(request), parse(idSchema, rawId), {
        ...input,
        toStatus,
      }),
    );
  }
}

function requestContext(request: AuthenticatedInternalRequest) {
  const requestId = request.headers["x-request-id"];
  const traceparent = request.headers.traceparent;
  if (typeof requestId !== "string") {
    throw new HttpException(
      { error: "missing_request_id", message: "Request ID is required" },
      400,
    );
  }
  return {
    actor: request.currentSession,
    ...(typeof traceparent === "string" ? { correlationId: traceparent } : {}),
    requestId,
  };
}

function requireKind(
  application: OnboardingApplicationDetail,
  expectedKind: OnboardingApplicationData["kind"],
): OnboardingApplicationDetail {
  if (application.kind !== expectedKind) {
    throw new HttpException(
      { error: "application_not_found", message: "Application was not found" },
      404,
    );
  }
  return application;
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
    if (error instanceof OnboardingFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    if (error instanceof InvalidApplicationCursorError) {
      throw new HttpException({ error: "invalid_cursor", message: error.message }, 400);
    }
    if (error instanceof InvalidApplicationTransitionError) {
      throw new HttpException({ error: "invalid_status_transition", message: error.message }, 409);
    }
    if (error instanceof ApplicationConflictError) {
      throw new HttpException({ error: "application_conflict", message: error.message }, 409);
    }
    if (error instanceof InvalidCatalogueSelectionError) {
      throw new HttpException(
        { error: "invalid_catalogue_selection", message: error.message },
        400,
      );
    }
    if (error instanceof InvalidReferralClaimError) {
      throw new HttpException(
        { error: "invalid_referral", message: "Referral link is invalid or unavailable" },
        400,
      );
    }
    throw error;
  }
}
