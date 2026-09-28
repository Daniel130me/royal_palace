import { type DynamicModule, Module } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";

import { DatabaseModule } from "../platform/database/database.module.js";
import { SERVICE_CONFIG } from "../tokens.js";
import { IdentityService } from "./application/identity.service.js";
import { IDENTITY_REPOSITORY, OIDC_PROVIDER } from "./identity.tokens.js";
import { OpenIdClientAdapter } from "./infrastructure/openid-client.adapter.js";
import { PrismaIdentityRepository } from "./infrastructure/prisma-identity.repository.js";
import { InternalIdentityController } from "./presentation/internal-identity.controller.js";
import { InternalRequestGuard } from "./presentation/internal-request.guard.js";

@Module({
  providers: [],
})
export class IdentityModule {
  static register(config: ApiServiceConfig): DynamicModule {
    return {
      module: IdentityModule,
      imports: [DatabaseModule.register(config)],
      controllers: [InternalIdentityController],
      providers: [
        { provide: SERVICE_CONFIG, useValue: config },
        IdentityService,
        InternalRequestGuard,
        { provide: IDENTITY_REPOSITORY, useClass: PrismaIdentityRepository },
        { provide: OIDC_PROVIDER, useClass: OpenIdClientAdapter },
      ],
      exports: [IdentityService],
    };
  }
}
