import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { DocumentStorageModule } from "../platform/documents/document-storage.module.js";
import { LaboratoryService } from "./application/laboratory.service.js";
import { LaboratoryReviewService } from "./application/laboratory-review.service.js";
import { LaboratoryResultService } from "./application/laboratory-result.service.js";
import { LaboratoryWorkspaceService } from "./application/laboratory-workspace.service.js";
import { ServicePricingService } from "./application/service-pricing.service.js";
import { LABORATORY_WORKSPACE_REPOSITORY } from "./domain/laboratory-workspace.types.js";
import { LABORATORY_RESULT_REPOSITORY } from "./domain/laboratory-result.types.js";
import { LABORATORY_REVIEW_REPOSITORY } from "./domain/laboratory-review.types.js";
import { LABORATORY_REPOSITORY } from "./domain/laboratory.types.js";
import { PrismaLaboratoryResultRepository } from "./infrastructure/prisma-laboratory-result.repository.js";
import { PrismaLaboratoryReviewRepository } from "./infrastructure/prisma-laboratory-review.repository.js";
import { PrismaLaboratoryWorkspaceRepository } from "./infrastructure/prisma-laboratory-workspace.repository.js";
import { PrismaLaboratoryRepository } from "./infrastructure/prisma-laboratory.repository.js";
import { PrismaServicePricingRepository } from "./infrastructure/prisma-service-pricing.repository.js";
import { SERVICE_PRICING_REPOSITORY } from "./domain/service-pricing.types.js";
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
import {
  AdminLaboratoryReviewController,
  PatientLaboratoryReviewController,
} from "./presentation/laboratory-review.controller.js";
import { AdminServicePricingController } from "./presentation/service-pricing.controller.js";

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
    AdminServicePricingController,
    PatientLaboratoryReviewController,
    AdminLaboratoryReviewController,
  ],
  providers: [
    LaboratoryService,
    LaboratoryResultService,
    LaboratoryWorkspaceService,
    ServicePricingService,
    LaboratoryReviewService,
    { provide: LABORATORY_REPOSITORY, useClass: PrismaLaboratoryRepository },
    { provide: LABORATORY_RESULT_REPOSITORY, useClass: PrismaLaboratoryResultRepository },
    { provide: LABORATORY_REVIEW_REPOSITORY, useClass: PrismaLaboratoryReviewRepository },
    { provide: LABORATORY_WORKSPACE_REPOSITORY, useClass: PrismaLaboratoryWorkspaceRepository },
    { provide: SERVICE_PRICING_REPOSITORY, useClass: PrismaServicePricingRepository },
  ],
})
export class LaboratoryModule {}
