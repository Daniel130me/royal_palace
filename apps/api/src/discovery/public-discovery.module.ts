import { Module } from "@nestjs/common";

import { PublicDiscoveryService } from "./application/public-discovery.service.js";
import { PublicPractitionerDiscoveryService } from "./application/public-practitioner-discovery.service.js";
import { PUBLIC_DISCOVERY_REPOSITORY } from "./domain/public-discovery.types.js";
import { PUBLIC_PRACTITIONER_DISCOVERY_REPOSITORY } from "./domain/public-practitioner-discovery.types.js";
import { PrismaPublicDiscoveryRepository } from "./infrastructure/prisma-public-discovery.repository.js";
import { PrismaPublicPractitionerDiscoveryRepository } from "./infrastructure/prisma-public-practitioner-discovery.repository.js";
import { PublicDiscoveryController } from "./presentation/public-discovery.controller.js";
import { PublicPractitionerDiscoveryController } from "./presentation/public-practitioner-discovery.controller.js";

@Module({
  controllers: [PublicDiscoveryController, PublicPractitionerDiscoveryController],
  providers: [
    PublicDiscoveryService,
    PublicPractitionerDiscoveryService,
    { provide: PUBLIC_DISCOVERY_REPOSITORY, useClass: PrismaPublicDiscoveryRepository },
    {
      provide: PUBLIC_PRACTITIONER_DISCOVERY_REPOSITORY,
      useClass: PrismaPublicPractitionerDiscoveryRepository,
    },
  ],
})
export class PublicDiscoveryModule {}
