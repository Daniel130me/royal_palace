import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AdministrationService } from "./application/administration.service.js";
import { ADMINISTRATION_REPOSITORY } from "./domain/administration.types.js";
import { PrismaAdministrationRepository } from "./infrastructure/prisma-administration.repository.js";
import { AdministrationController } from "./presentation/administration.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [AdministrationController],
  providers: [
    AdministrationService,
    { provide: ADMINISTRATION_REPOSITORY, useClass: PrismaAdministrationRepository },
  ],
})
export class AdministrationModule {}
