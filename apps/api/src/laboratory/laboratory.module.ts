import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { DocumentStorageModule } from "../platform/documents/document-storage.module.js";
import { LaboratoryService } from "./application/laboratory.service.js";
import { LaboratoryResultService } from "./application/laboratory-result.service.js";
import { LaboratoryWorkspaceService } from "./application/laboratory-workspace.service.js";
import { LABORATORY_WORKSPACE_REPOSITORY } from "./domain/laboratory-workspace.types.js";
import { LABORATORY_RESULT_REPOSITORY } from "./domain/laboratory-result.types.js";
import { LABORATORY_REPOSITORY } from "./domain/laboratory.types.js";
import { PrismaLaboratoryResultRepository } from "./infrastructure/prisma-laboratory-result.repository.js";
import { PrismaLaboratoryWorkspaceRepository } from "./infrastructure/prisma-laboratory-workspace.repository.js";
import { PrismaLaboratoryRepository } from "./infrastructure/prisma-laboratory.repository.js";
import {
  LaboratoryOperationsController,
  LaboratoryRequestReadController,
  PatientLaboratoryController,
  ProviderLaboratoryController,
} from "./presentation/laboratory.controller.js";
import {
  LaboratoryResultOperationsController,
  PatientLaboratoryResultController,
  ProviderLaboratoryResultController,
} from "./presentation/laboratory-result.controller.js";
import { LaboratoryWorkspaceController } from "./presentation/laboratory-workspace.controller.js";

@Module({
  imports: [AuthorizationModule, DocumentStorageModule, IdentityModule],
  controllers: [
    LaboratoryOperationsController,
    LaboratoryRequestReadController,
    PatientLaboratoryController,
    ProviderLaboratoryController,
    LaboratoryResultOperationsController,
    PatientLaboratoryResultController,
    ProviderLaboratoryResultController,
    LaboratoryWorkspaceController,
  ],
  providers: [
    LaboratoryService,
    LaboratoryResultService,
    LaboratoryWorkspaceService,
    { provide: LABORATORY_REPOSITORY, useClass: PrismaLaboratoryRepository },
    { provide: LABORATORY_RESULT_REPOSITORY, useClass: PrismaLaboratoryResultRepository },
    { provide: LABORATORY_WORKSPACE_REPOSITORY, useClass: PrismaLaboratoryWorkspaceRepository },
  ],
})
export class LaboratoryModule {}
