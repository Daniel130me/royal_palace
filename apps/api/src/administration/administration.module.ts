import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AdministrationService } from "./application/administration.service.js";
import { IdentityAdministrationService } from "./application/identity-administration.service.js";
import {
  ADMINISTRATION_REPOSITORY,
  IDENTITY_ADMINISTRATION_REPOSITORY,
} from "./domain/administration.types.js";
import { PrismaAdministrationRepository } from "./infrastructure/prisma-administration.repository.js";
import { PrismaIdentityAdministrationRepository } from "./infrastructure/prisma-identity-administration.repository.js";
import { AdministrationController } from "./presentation/administration.controller.js";
import { IdentityAdministrationController } from "./presentation/identity-administration.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [AdministrationController, IdentityAdministrationController],
  providers: [
    AdministrationService,
    IdentityAdministrationService,
    { provide: ADMINISTRATION_REPOSITORY, useClass: PrismaAdministrationRepository },
    {
      provide: IDENTITY_ADMINISTRATION_REPOSITORY,
      useClass: PrismaIdentityAdministrationRepository,
    },
  ],
})
export class AdministrationModule {}
