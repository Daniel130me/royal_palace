import { Module } from "@nestjs/common";

import { AuthorizationService } from "./application/authorization.service.js";
import { AUTHORIZATION_AUDIT_REPOSITORY, POLICY_ENGINE } from "./authorization.tokens.js";
import { PolicyEngine } from "./domain/policy-engine.js";
import { PrismaAuthorizationAuditRepository } from "./infrastructure/prisma-authorization-audit.repository.js";

@Module({
  providers: [
    AuthorizationService,
    { provide: POLICY_ENGINE, useClass: PolicyEngine },
    { provide: AUTHORIZATION_AUDIT_REPOSITORY, useClass: PrismaAuthorizationAuditRepository },
  ],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
