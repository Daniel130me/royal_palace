import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Post,
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
  OrganizationTeamFlowError,
  OrganizationTeamService,
} from "../application/organization-team.service.js";

const idSchema = z.uuid();
const versionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
const acceptSchema = z.object({ token: z.string().min(32).max(512) }).strict();

@Controller("v1/organization/team")
@UseGuards(AuthenticatedInternalRequestGuard)
export class OrganizationTeamController {
  constructor(@Inject(OrganizationTeamService) private readonly team: OrganizationTeamService) {}

  @Get()
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_ORGANIZATION_TEAM)
  getTeam(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() => this.team.getTeam(context(request), parse(idSchema, organizationId)));
  }

  @Post("invitations")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_ORGANIZATION_TEAM)
  createInvitation(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.team.createInvitation(context(request), parse(idSchema, organizationId)),
    );
  }

  @Delete("invitations/:invitationId")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_ORGANIZATION_TEAM)
  revokeInvitation(
    @Param("invitationId") invitationId: string,
    @Body() body: unknown,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.team.revokeInvitation(context(request), {
        ...parse(versionSchema, body),
        invitationId: parse(idSchema, invitationId),
        organizationId: parse(idSchema, organizationId),
      }),
    );
  }

  @Delete("members/:membershipId")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_ORGANIZATION_TEAM)
  deactivateMember(
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.team.deactivateMember(context(request), {
        ...parse(versionSchema, body),
        membershipId: parse(idSchema, membershipId),
        organizationId: parse(idSchema, organizationId),
      }),
    );
  }

  @Post("invitations/accept")
  acceptInvitation(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    const { token } = parse(acceptSchema, body);
    return execute(() => this.team.acceptInvitation(context(request), token));
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

async function execute<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof OrganizationTeamFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    throw error;
  }
}
