import { type DynamicModule, Module } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import { type DependencyReadiness, RuntimeDependencies } from "@royal-palace/config/readiness";

import { HealthController } from "./health.controller.js";
import { IdentityModule } from "./identity/identity.module.js";
import { DEPENDENCY_READINESS, SERVICE_CONFIG } from "./tokens.js";

@Module({})
export class AppModule {
  static register(
    config: ApiServiceConfig,
    dependencies: DependencyReadiness = new RuntimeDependencies(config),
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [IdentityModule.register(config)],
      controllers: [HealthController],
      providers: [
        { provide: SERVICE_CONFIG, useValue: config },
        { provide: DEPENDENCY_READINESS, useValue: dependencies },
      ],
    };
  }
}
