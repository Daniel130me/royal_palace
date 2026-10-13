import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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

import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { PolicyProtected } from "../../authorization/presentation/policy-protected.decorator.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { LaboratoryResultService } from "../application/laboratory-result.service.js";
import { context, execute, parse } from "./laboratory.controller.js";

const idSchema = z.uuid();
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).optional();
const componentSchema = z
  .object({
    code: optionalText(128),
    codeSystem: optionalText(255),
    flag: z.enum(["NORMAL", "LOW", "HIGH", "ABNORMAL", "CRITICAL"]),
    name: z.string().trim().min(1).max(255),
    note: optionalText(1000),
    referenceRange: optionalText(255),
    unit: optionalText(64),
    value: z.string().trim().min(1).max(1000),
  })
  .strict();
const resultContentSchema = z
  .object({
    components: z.array(componentSchema).min(1).max(200),
    interpretation: optionalText(4000),
  })
  .strict();
const createResultSchema = resultContentSchema.extend({ bookingId: idSchema }).strict();
const updateResultSchema = resultContentSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
const reviewTransitionSchema = z.discriminatedUnion("toStatus", [
  z
    .object({
      expectedVersion: z.number().int().positive(),
      reasonCode: z.literal("submitted_for_review"),
      toStatus: z.literal("IN_REVIEW"),
    })
    .strict(),
  z
    .object({
      expectedVersion: z.number().int().positive(),
      reasonCode: z.literal("returned_for_correction"),
      toStatus: z.literal("DRAFT"),
    })
    .strict(),
]);
const versionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
const resolutionSchema = versionSchema
  .extend({ resolutionCode: z.string().trim().min(1).max(128) })
  .strict();
const listSchema = z
  .object({
    cursor: z.string().trim().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
const laboratoryListSchema = listSchema
  .extend({ status: z.enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "SUPERSEDED"]).optional() })
  .strict();
const criticalListSchema = listSchema
  .extend({ status: z.enum(["OPEN", "ACKNOWLEDGED", "ESCALATED", "RESOLVED"]).optional() })
  .strict();
const MAX_LABORATORY_RESULT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const attachmentUploadSchema = z
  .object({
    declaredContentType: z.enum([
      "application/pdf",
      "image/heic",
      "image/heif",
      "image/jpeg",
      "image/png",
    ]),
    declaredSha256: z.string().regex(/^[0-9a-f]{64}$/),
    declaredSizeBytes: z.number().int().positive().max(MAX_LABORATORY_RESULT_ATTACHMENT_BYTES),
    originalFilename: z.string().trim().min(1).max(255),
    purpose: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{2,79}$/),
  })
  .strict();

@Controller("v1/laboratory/results")
@UseGuards(AuthenticatedInternalRequestGuard)
export class LaboratoryResultOperationsController {
  constructor(@Inject(LaboratoryResultService) private readonly results: LaboratoryResultService) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LABORATORY_RESULT)
  list(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.listForLaboratory(
        context(request),
        parse(idSchema, organizationId),
        parse(laboratoryListSchema, query),
      ),
    );
  }

  @Get(":resultId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT)
  get(@Param("resultId") resultId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.results.get(context(request), parse(idSchema, resultId)));
  }

  @Post()
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LABORATORY_RESULT)
  create(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.createDraft(
        context(request),
        parse(idSchema, organizationId),
        parse(idempotencyKeySchema, idempotencyKey),
        parse(createResultSchema, body),
      ),
    );
  }

  @Patch(":resultId/draft")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LABORATORY_RESULT)
  update(
    @Param("resultId") resultId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.updateDraft(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, resultId),
        parse(updateResultSchema, body),
      ),
    );
  }

  @Post(":resultId/review-transitions")
  @HttpCode(HttpStatus.OK)
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LABORATORY_RESULT)
  transition(
    @Param("resultId") resultId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.transitionReview(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, resultId),
        parse(reviewTransitionSchema, body),
      ),
    );
  }

  @Post(":resultId/publications")
  @HttpCode(HttpStatus.OK)
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LABORATORY_RESULT)
  publish(
    @Param("resultId") resultId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.publish(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, resultId),
        parse(versionSchema, body).expectedVersion,
      ),
    );
  }

  @Post(":resultId/amendments")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LABORATORY_RESULT)
  amend(
    @Param("resultId") resultId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.createAmendment(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, resultId),
        parse(resultContentSchema, body),
      ),
    );
  }

  @Post(":resultId/attachment-upload-intents")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LABORATORY_RESULT)
  createAttachmentUpload(
    @Param("resultId") resultId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.createAttachmentUploadIntent(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, resultId),
        parse(attachmentUploadSchema, body),
      ),
    );
  }

  @Post(":resultId/attachments/:attachmentId/complete")
  @HttpCode(HttpStatus.OK)
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_LABORATORY_RESULT)
  completeAttachmentUpload(
    @Param("resultId") resultId: string,
    @Param("attachmentId") attachmentId: string,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.completeAttachmentUpload(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, resultId),
        parse(idSchema, attachmentId),
      ),
    );
  }

  @Get(":resultId/attachments/:attachmentId/download")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT)
  downloadAttachment(
    @Param("resultId") resultId: string,
    @Param("attachmentId") attachmentId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.downloadAttachment(
        context(request),
        parse(idSchema, resultId),
        parse(idSchema, attachmentId),
      ),
    );
  }
}

@Controller("v1/patient/laboratory-results")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PatientLaboratoryResultController {
  constructor(@Inject(LaboratoryResultService) private readonly results: LaboratoryResultService) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT)
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.results.listForPatient(context(request), parse(listSchema, query)));
  }

  @Get(":resultId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT)
  get(@Param("resultId") resultId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.results.get(context(request), parse(idSchema, resultId)));
  }

  @Get(":resultId/attachments/:attachmentId/download")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT)
  downloadAttachment(
    @Param("resultId") resultId: string,
    @Param("attachmentId") attachmentId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.downloadAttachment(
        context(request),
        parse(idSchema, resultId),
        parse(idSchema, attachmentId),
      ),
    );
  }
}

@Controller("v1/provider")
@UseGuards(AuthenticatedInternalRequestGuard)
export class ProviderLaboratoryResultController {
  constructor(@Inject(LaboratoryResultService) private readonly results: LaboratoryResultService) {}

  @Get("laboratory-results")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT)
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.results.listForPractitioner(context(request), parse(listSchema, query)),
    );
  }

  @Get("laboratory-results/:resultId")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT)
  get(@Param("resultId") resultId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.results.get(context(request), parse(idSchema, resultId)));
  }

  @Get("laboratory-results/:resultId/attachments/:attachmentId/download")
  @PolicyProtected(AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT)
  downloadAttachment(
    @Param("resultId") resultId: string,
    @Param("attachmentId") attachmentId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.downloadAttachment(
        context(request),
        parse(idSchema, resultId),
        parse(idSchema, attachmentId),
      ),
    );
  }

  @Get("laboratory-critical-results")
  @PolicyProtected(AUTHORIZATION_POLICY.ACKNOWLEDGE_CRITICAL_LABORATORY_RESULT)
  listCritical(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.results.listCriticalForPractitioner(context(request), parse(criticalListSchema, query)),
    );
  }

  @Post("laboratory-critical-results/:criticalResultId/acknowledgements")
  @HttpCode(HttpStatus.OK)
  @PolicyProtected(AUTHORIZATION_POLICY.ACKNOWLEDGE_CRITICAL_LABORATORY_RESULT)
  acknowledge(
    @Param("criticalResultId") criticalResultId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.results.acknowledgeCritical(
        context(request),
        parse(idSchema, criticalResultId),
        parse(versionSchema, body).expectedVersion,
      ),
    );
  }

  @Post("laboratory-critical-results/:criticalResultId/resolutions")
  @HttpCode(HttpStatus.OK)
  @PolicyProtected(AUTHORIZATION_POLICY.ACKNOWLEDGE_CRITICAL_LABORATORY_RESULT)
  resolve(
    @Param("criticalResultId") criticalResultId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() => {
      const input = parse(resolutionSchema, body);
      return this.results.resolveCritical(
        context(request),
        parse(idSchema, criticalResultId),
        input.expectedVersion,
        input.resolutionCode,
      );
    });
  }
}
