import { Inject, Injectable } from "@nestjs/common";
import type { AdminPrincipalScope, CurrentSession, PlatformRole } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { administrationFilterHash, decodeAdministrationCursor } from "./administration-cursor.js";
import { ADMINISTRATION_MAX_PAGE_SIZE, AdministrationFlowError } from "./administration.service.js";
import {
  IDENTITY_ADMINISTRATION_REPOSITORY,
  type IdentityAdministrationRepository,
} from "../domain/administration.types.js";

interface RequestContext {
  actor: CurrentSession;
  requestId: string;
}

@Injectable()
export class IdentityAdministrationService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(IDENTITY_ADMINISTRATION_REPOSITORY)
    private readonly repository: IdentityAdministrationRepository,
  ) {}

  async list(
    context: RequestContext,
    input: {
      cursor?: string;
      limit?: number;
      query?: string;
      role?: PlatformRole;
      scope: AdminPrincipalScope;
    },
  ) {
    await this.authorize(context, "identity_principal_list");
    const filters = { query: input.query, role: input.role, scope: input.scope };
    return this.repository.listPrincipals({
      cursor: decodeAdministrationCursor(input.cursor, administrationFilterHash(filters)),
      limit: Math.min(input.limit ?? 25, ADMINISTRATION_MAX_PAGE_SIZE),
      query: input.query,
      role: input.role,
      scope: input.scope,
    });
  }

  async transition(
    context: RequestContext,
    principalId: string,
    input: { expectedVersion: number; reason: string; status: "ACTIVE" | "DISABLED" },
  ) {
    await this.authorize(context, "identity_principal", principalId);
    const result = await this.repository.transitionPrincipal({
      actorPrincipalId: context.actor.principalId,
      ...input,
      principalId,
      requestId: context.requestId,
    });
    if (result.outcome === "UPDATED") return result.principal;
    const errors = {
      LAST_ADMINISTRATOR: [
        "last_administrator_required",
        409,
        "The final active administrator cannot be disabled",
      ],
      NO_CHANGE: ["principal_status_unchanged", 409, "Account already has that status"],
      NOT_FOUND: ["principal_not_found", 404, "Account was not found"],
      SELF_DISABLE: [
        "administrator_self_disable_forbidden",
        409,
        "You cannot disable your own account",
      ],
      VERSION_CONFLICT: ["principal_version_conflict", 409, "Account changed; reload and retry"],
    } as const;
    const [code, status, message] = errors[result.outcome];
    throw new AdministrationFlowError(code, status, message);
  }

  private async authorize(
    context: RequestContext,
    resourceType: string,
    resourceId = resourceType,
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: { resourceId, resourceType },
      policy: AUTHORIZATION_POLICY.ADMINISTER_IDENTITY_PRINCIPALS,
      requestId: context.requestId,
    });
  }
}
