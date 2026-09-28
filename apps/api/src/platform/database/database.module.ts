import { type DynamicModule, Global, Module } from "@nestjs/common";
import type { ServiceConfig } from "@royal-palace/config/environment";

import { SERVICE_CONFIG } from "../../tokens.js";
import { PrismaService } from "./prisma.service.js";

/**
 * Process-wide database pool and validated runtime configuration. Capability modules
 * still access Prisma only through their own repositories.
 */
@Global()
@Module({})
export class DatabaseModule {
  static register(config: ServiceConfig): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [{ provide: SERVICE_CONFIG, useValue: config }, PrismaService],
      exports: [PrismaService, SERVICE_CONFIG],
    };
  }
}
