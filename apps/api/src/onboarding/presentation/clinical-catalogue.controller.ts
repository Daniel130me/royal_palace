import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { ClinicalCatalogueKind } from "@royal-palace/contracts";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  CatalogueConflictError,
  ClinicalCatalogueService,
  MAX_CATALOGUE_PAGE_SIZE,
} from "../application/clinical-catalogue.service.js";
import { InvalidCatalogueCursorError } from "../application/catalogue-cursor.js";

const idSchema = z.uuid();
const statusSchema = z.enum(["ACTIVE", "INACTIVE"]);
const listSchema = z
  .object({
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_CATALOGUE_PAGE_SIZE).optional(),
    status: statusSchema.optional(),
  })
  .strict();
const createSchema = z
  .object({
    category: z.string().trim().min(1).max(120).optional(),
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
    description: z.string().trim().min(1).max(1000).nullable(),
    name: z.string().trim().min(1).max(180),
    parentId: idSchema.nullable().optional(),
    sourceUri: z.url().max(2048).nullable(),
  })
  .strict();
const updateSchema = z
  .object({
    category: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(1000).nullable(),
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(180),
    parentId: idSchema.nullable().optional(),
    status: statusSchema,
  })
  .strict();

@Controller("v1/admin/catalogue")
@UseGuards(AuthenticatedInternalRequestGuard)
export class ClinicalCatalogueController {
  constructor(
    @Inject(ClinicalCatalogueService) private readonly catalogue: ClinicalCatalogueService,
  ) {}

  @Get("professions")
  listProfessions(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return this.list(request, "PROFESSION", query);
  }

  @Post("professions")
  createProfession(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    return this.create(request, "PROFESSION", body);
  }

  @Patch("professions/:id")
  updateProfession(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return this.update(request, "PROFESSION", id, body);
  }

  @Get("specialties")
  listSpecialties(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return this.list(request, "SPECIALTY", query);
  }

  @Post("specialties")
  createSpecialty(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    return this.create(request, "SPECIALTY", body);
  }

  @Patch("specialties/:id")
  updateSpecialty(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return this.update(request, "SPECIALTY", id, body);
  }

  private list(
    request: AuthenticatedInternalRequest,
    kind: ClinicalCatalogueKind,
    rawQuery: unknown,
  ) {
    const query = parse(listSchema, rawQuery);
    return execute(() => this.catalogue.list({ ...context(request), kind, status: query.status }));
  }

  private create(
    request: AuthenticatedInternalRequest,
    kind: ClinicalCatalogueKind,
    rawBody: unknown,
  ) {
    const body = parse(createSchema, rawBody);
    return execute(() => this.catalogue.create({ ...context(request), ...body, kind }));
  }

  private update(
    request: AuthenticatedInternalRequest,
    kind: ClinicalCatalogueKind,
    rawId: string,
    rawBody: unknown,
  ) {
    const body = parse(updateSchema, rawBody);
    return execute(() =>
      this.catalogue.update({ ...context(request), ...body, id: parse(idSchema, rawId), kind }),
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
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    if (error instanceof CatalogueConflictError) {
      throw new HttpException({ error: "catalogue_conflict", message: error.message }, 409);
    }
    if (error instanceof InvalidCatalogueCursorError) {
      throw new HttpException({ error: "invalid_cursor", message: error.message }, 400);
    }
    throw error;
  }
}
