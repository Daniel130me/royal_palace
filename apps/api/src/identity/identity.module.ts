import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityService } from "./application/identity.service.js";
import { IDENTITY_REPOSITORY, OIDC_PROVIDER } from "./identity.tokens.js";
import { OpenIdClientAdapter } from "./infrastructure/openid-client.adapter.js";
import { PrismaIdentityRepository } from "./infrastructure/prisma-identity.repository.js";
import { InternalIdentityController } from "./presentation/internal-identity.controller.js";
import { InternalRequestGuard } from "./presentation/internal-request.guard.js";

@Module({
  imports: [AuthorizationModule],
  controllers: [InternalIdentityController],
  providers: [
    IdentityService,
    InternalRequestGuard,
    { provide: IDENTITY_REPOSITORY, useClass: PrismaIdentityRepository },
    { provide: OIDC_PROVIDER, useClass: OpenIdClientAdapter },
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
