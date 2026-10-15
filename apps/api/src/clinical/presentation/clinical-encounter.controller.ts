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
  ClinicalEncounterFlowError,
  ClinicalEncounterService,
  mapClinicalEncounterConflict,
} from "../application/clinical-encounter.service.js";

const idSchema = z.uuid();
const instantSchema = z.iso.datetime({ offset: true });
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const documentationSchema = z
  .object({
    sections: z
      .array(
        z
          .object({
            code: z
              .string()
              .trim()
              .min(1)
              .max(100)
              .regex(/^[A-Za-z0-9._:-]+$/),
            text: z.string().trim().min(1).max(20_000),
            title: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict();
const diagnosisSchema = z
  .object({
    code: z.string().trim().min(1).max(100).optional(),
    codeSystem: z.string().trim().min(1).max(255).optional(),
    display: z.string().trim().min(1).max(500),
    onsetAt: instantSchema.optional(),
    status: z.enum(["ACTIVE", "RESOLVED", "ENTERED_IN_ERROR"]),
    type: z.enum(["PRIMARY", "SECONDARY", "DIFFERENTIAL", "PROVISIONAL"]),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.code === undefined) !== (value.codeSystem === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Code and code system must be provided together",
      });
    }
  });
const observationBase = {
  code: z.string().trim().min(1).max(100),
  codeSystem: z.string().trim().min(1).max(255).optional(),
  display: z.string().trim().min(1).max(200),
  observedAt: instantSchema,
};
const observationSchema = z.discriminatedUnion("valueType", [
  z
    .object({
      ...observationBase,
      numericValue: z.string().regex(/^-?\d{1,12}(?:\.\d{1,6})?$/),
      unitCode: z.string().trim().min(1).max(100).optional(),
      valueType: z.literal("QUANTITY"),
    })
    .strict(),
  z
    .object({
      ...observationBase,
      textValue: z.string().trim().min(1).max(1000),
      valueType: z.literal("TEXT"),
    })
    .strict(),
  z
    .object({
      ...observationBase,
      codedValue: z.string().trim().min(1).max(255),
      valueType: z.literal("CODED"),
    })
    .strict(),
  z
    .object({ ...observationBase, booleanValue: z.boolean(), valueType: z.literal("BOOLEAN") })
    .strict(),
]);
const openSchema = z.object({ appointmentId: idSchema }).strict();
const noteBase = {
  documentation: documentationSchema,
  expectedLatestRevision: z.number().int().min(0),
  schemaVersion: z.literal(1),
};
const draftSchema = z.object(noteBase).strict();
const signSchema = z
  .object({
    ...noteBase,
    diagnoses: z.array(diagnosisSchema).min(1).max(50),
    expectedVersion: z.number().int().positive(),
    observations: z.array(observationSchema).max(100).default([]),
  })
  .strict();
const addendumSchema = z
  .object({
    ...noteBase,
    diagnoses: z.array(diagnosisSchema).max(50).default([]),
    observations: z.array(observationSchema).max(100).default([]),
    supersedesNoteId: idSchema,
  })
  .strict();
const listSchema = z
  .object({
    cursor: z.string().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    patientId: idSchema.optional(),
  })
  .strict();

@Controller("v1/provider/clinical-encounters")
@UseGuards(AuthenticatedInternalRequestGuard)
export class ProviderClinicalEncounterController {
  constructor(
    @Inject(ClinicalEncounterService) private readonly encounters: ClinicalEncounterService,
  ) {}

  @Post()
  @PolicyProtected(AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD)
  open(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.encounters.open(
        requestContext(request),
        parse(openSchema, body),
        parse(idempotencyKeySchema, idempotencyKey),
      ),
    );
  }

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD)
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.encounters.listForPractitioner(requestContext(request), parse(listSchema, query)),
    );
  }

  @Get(":encounterId")
  @PolicyProtected(AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD)
  get(@Param("encounterId") encounterId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.encounters.get(requestContext(request), parse(idSchema, encounterId)),
    );
  }

  @Post(":encounterId/drafts")
  @PolicyProtected(AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD)
  saveDraft(
    @Param("encounterId") encounterId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.encounters.saveDraft(
        requestContext(request),
        parse(idSchema, encounterId),
        parse(draftSchema, body),
        parse(idempotencyKeySchema, idempotencyKey),
      ),
    );
  }

  @Post(":encounterId/sign")
  @PolicyProtected(AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD)
  sign(
    @Param("encounterId") encounterId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.encounters.sign(
        requestContext(request),
        parse(idSchema, encounterId),
        parse(signSchema, body),
        parse(idempotencyKeySchema, idempotencyKey),
      ),
    );
  }

  @Post(":encounterId/addenda")
  @PolicyProtected(AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD)
  addAddendum(
    @Param("encounterId") encounterId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.encounters.addAddendum(
        requestContext(request),
        parse(idSchema, encounterId),
        parse(addendumSchema, body),
        parse(idempotencyKeySchema, idempotencyKey),
      ),
    );
  }
}

@Controller("v1/patient/clinical-encounters")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PatientClinicalEncounterController {
  constructor(
    @Inject(ClinicalEncounterService) private readonly encounters: ClinicalEncounterService,
  ) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD)
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    const input = parse(listSchema.omit({ patientId: true }), query);
    return execute(() => this.encounters.listForPatient(requestContext(request), input));
  }

  @Get(":encounterId")
  @PolicyProtected(AUTHORIZATION_POLICY.ACCESS_CLINICAL_RECORD)
  get(@Param("encounterId") encounterId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.encounters.get(requestContext(request), parse(idSchema, encounterId)),
    );
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
    mapClinicalEncounterConflict(error);
    if (error instanceof ClinicalEncounterFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    throw error;
  }
}
