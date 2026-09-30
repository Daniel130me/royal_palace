import { type DynamicModule, Module } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import { type DependencyReadiness, RuntimeDependencies } from "@royal-palace/config/readiness";

import { AuthorizationModule } from "./authorization/authorization.module.js";
import { HealthController } from "./health.controller.js";
import { IdentityModule } from "./identity/identity.module.js";
import { OnboardingModule } from "./onboarding/onboarding.module.js";
import { DatabaseModule } from "./platform/database/database.module.js";
import { PublicDiscoveryModule } from "./discovery/public-discovery.module.js";
import { DEPENDENCY_READINESS } from "./tokens.js";

@Module({})
export class AppModule {
  static register(
    config: ApiServiceConfig,
    dependencies: DependencyReadiness = new RuntimeDependencies(config),
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.register(config),
        AuthorizationModule,
        IdentityModule,
        OnboardingModule,
        PublicDiscoveryModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: DEPENDENCY_READINESS, useValue: dependencies }],
    };
  }
}
