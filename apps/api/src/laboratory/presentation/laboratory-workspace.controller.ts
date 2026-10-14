import { Controller, Get, Headers, HttpException, Inject, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  LaboratoryWorkspaceNotFoundError,
  LaboratoryWorkspaceService,
} from "../application/laboratory-workspace.service.js";

@Controller("v1/laboratory/workspace")
@UseGuards(AuthenticatedInternalRequestGuard)
export class LaboratoryWorkspaceController {
  constructor(
    @Inject(LaboratoryWorkspaceService) private readonly workspace: LaboratoryWorkspaceService,
  ) {}

  @Get()
  async get(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const requestId = request.headers["x-request-id"];
    if (typeof requestId !== "string") {
      throw new HttpException(
        { error: "missing_request_id", message: "Request ID is required" },
        400,
      );
    }
    const parsedOrganizationId = z.uuid().safeParse(organizationId);
    if (!parsedOrganizationId.success) {
      throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
    }
    try {
      return await this.workspace.get(
        { actor: request.currentSession, requestId },
        parsedOrganizationId.data,
      );
    } catch (error) {
      if (error instanceof AuthorizationDeniedError) {
        throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
      }
      if (error instanceof LaboratoryWorkspaceNotFoundError) {
        throw new HttpException(
          { error: "laboratory_not_found", message: "Laboratory was not found" },
          404,
        );
      }
      throw error;
    }
  }
}
