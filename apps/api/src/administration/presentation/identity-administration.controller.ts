import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
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
import { InvalidAdministrationCursorError } from "../application/administration-cursor.js";
import {
  ADMINISTRATION_MAX_PAGE_SIZE,
  AdministrationFlowError,
} from "../application/administration.service.js";
import { IdentityAdministrationService } from "../application/identity-administration.service.js";

const platformRoleSchema = z.enum([
  "PATIENT",
  "MANAGER",
  "ORGANIZATION_APPLICANT",
  "ORGANIZATION_ADMIN",
  "ORGANIZATION_STAFF",
  "PROVIDER",
  "SUPPORT",
  "ADMINISTRATOR",
  "FINANCE",
  "LOGISTICS",
  "SYSTEM_WORKER",
]);
const listSchema = z
  .object({
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(ADMINISTRATION_MAX_PAGE_SIZE).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    role: platformRoleSchema.optional(),
    scope: z.enum(["ALL", "ACTIVE", "DISABLED"]).default("ALL"),
  })
  .strict();
const transitionSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    reason: z.string().trim().min(3).max(500),
    status: z.enum(["ACTIVE", "DISABLED"]),
  })
  .strict();

@Controller("v1/admin/principals")
@UseGuards(AuthenticatedInternalRequestGuard)
export class IdentityAdministrationController {
  constructor(
    @Inject(IdentityAdministrationService)
    private readonly administration: IdentityAdministrationService,
  ) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.ADMINISTER_IDENTITY_PRINCIPALS)
  list(@Query() rawQuery: unknown, @Req() request: AuthenticatedInternalRequest) {
    const query = parse(listSchema, rawQuery);
    return execute(() =>
      this.administration.list(context(request), {
        cursor: query.cursor,
        limit: query.limit,
        query: query.q,
        role: query.role,
        scope: query.scope,
      }),
    );
  }

  @Patch(":principalId/status")
  @PolicyProtected(AUTHORIZATION_POLICY.ADMINISTER_IDENTITY_PRINCIPALS)
  transition(
    @Param("principalId") rawPrincipalId: string,
    @Body() rawBody: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.administration.transition(
        context(request),
        parse(z.uuid(), rawPrincipalId),
        parse(transitionSchema, rawBody),
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
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    if (error instanceof InvalidAdministrationCursorError) {
      throw new HttpException({ error: "invalid_cursor", message: "Cursor is invalid" }, 400);
    }
    if (error instanceof AdministrationFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    throw error;
  }
}
