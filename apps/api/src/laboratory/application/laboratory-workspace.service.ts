import { Inject, Injectable } from "@nestjs/common";
import type { CurrentSession } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import {
  LABORATORY_WORKSPACE_REPOSITORY,
  type LaboratoryWorkspaceRepository,
} from "../domain/laboratory-workspace.types.js";

interface RequestContext {
  actor: CurrentSession;
  requestId: string;
}

export class LaboratoryWorkspaceNotFoundError extends Error {}

@Injectable()
export class LaboratoryWorkspaceService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(LABORATORY_WORKSPACE_REPOSITORY)
    private readonly repository: LaboratoryWorkspaceRepository,
  ) {}

  async get(context: RequestContext, organizationId: string) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        organizationId,
        resourceId: organizationId,
        resourceType: "laboratory_workspace",
      },
      policy: AUTHORIZATION_POLICY.VIEW_ORGANIZATION,
      requestId: context.requestId,
    });
    const workspace = await this.repository.find(organizationId);
    if (workspace === null) throw new LaboratoryWorkspaceNotFoundError();
    return workspace;
  }
}
