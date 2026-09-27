import { type DynamicModule, Module } from "@nestjs/common";
import type { ServiceConfig } from "@royal-palace/config/environment";

import { SERVICE_CONFIG } from "../../tokens.js";
import { PrismaService } from "./prisma.service.js";

/** Infrastructure-only database boundary used by capability-owned repositories. */
@Module({})
export class DatabaseModule {
  static register(config: ServiceConfig): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: SERVICE_CONFIG, useValue: config }, PrismaService],
      exports: [PrismaService],
    };
  }
}
