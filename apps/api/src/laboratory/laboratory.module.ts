import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { LaboratoryService } from "./application/laboratory.service.js";
import { LABORATORY_REPOSITORY } from "./domain/laboratory.types.js";
import { PrismaLaboratoryRepository } from "./infrastructure/prisma-laboratory.repository.js";
import {
  LaboratoryOperationsController,
  LaboratoryRequestReadController,
  PatientLaboratoryController,
  ProviderLaboratoryController,
} from "./presentation/laboratory.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [
    LaboratoryOperationsController,
    LaboratoryRequestReadController,
    PatientLaboratoryController,
    ProviderLaboratoryController,
  ],
  providers: [
    LaboratoryService,
    { provide: LABORATORY_REPOSITORY, useClass: PrismaLaboratoryRepository },
  ],
})
export class LaboratoryModule {}
