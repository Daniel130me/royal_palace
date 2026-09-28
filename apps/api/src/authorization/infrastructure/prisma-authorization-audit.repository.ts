import { Inject, Injectable } from "@nestjs/common";

import type {
  AuthorizationAuditInput,
  AuthorizationAuditRepository,
} from "../domain/authorization.types.js";
import { AUTHORIZATION_POLICY_VERSION } from "../domain/authorization.types.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";

@Injectable()
export class PrismaAuthorizationAuditRepository implements AuthorizationAuditRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async append(input: AuthorizationAuditInput): Promise<void> {
    await this.database.auditEvent.create({
      data: {
        action: `authorization.${input.policy.toLowerCase()}`,
        actorPrincipalId: input.actorPrincipalId,
        ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
        effectiveRole: input.effectiveRole,
        id: createOpaqueId(),
        metadata: { policy: input.policy, policyVersion: AUTHORIZATION_POLICY_VERSION },
        ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
        ...(input.patientScopeId === undefined ? {} : { patientScopeId: input.patientScopeId }),
        reasonCode: input.reasonCode,
        requestId: input.requestId,
        resourceId: input.resourceId,
        resourceType: input.resourceType,
        result: input.result,
      },
      select: { id: true },
    });
  }
}
