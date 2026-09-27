import { type DynamicModule, Module } from "@nestjs/common";
import type { ServiceConfig } from "@royal-palace/config/environment";
import { type DependencyReadiness, RuntimeDependencies } from "@royal-palace/config/readiness";

import { HealthController } from "./health.controller.js";
import { DatabaseModule } from "./platform/database/database.module.js";
import { DEPENDENCY_READINESS, SERVICE_CONFIG } from "./tokens.js";

@Module({})
export class AppModule {
  static register(
    config: ServiceConfig,
    dependencies: DependencyReadiness = new RuntimeDependencies(config),
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [DatabaseModule.register(config)],
      controllers: [HealthController],
      providers: [
        { provide: SERVICE_CONFIG, useValue: config },
        { provide: DEPENDENCY_READINESS, useValue: dependencies },
      ],
    };
  }
}
