import { Module } from "@nestjs/common";

import { PublicDiscoveryService } from "./application/public-discovery.service.js";
import { PUBLIC_DISCOVERY_REPOSITORY } from "./domain/public-discovery.types.js";
import { PrismaPublicDiscoveryRepository } from "./infrastructure/prisma-public-discovery.repository.js";
import { PublicDiscoveryController } from "./presentation/public-discovery.controller.js";

@Module({
  controllers: [PublicDiscoveryController],
  providers: [
    PublicDiscoveryService,
    { provide: PUBLIC_DISCOVERY_REPOSITORY, useClass: PrismaPublicDiscoveryRepository },
  ],
})
export class PublicDiscoveryModule {}
