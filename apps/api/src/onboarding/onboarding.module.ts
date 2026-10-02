import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { ManagerModule } from "../manager/manager.module.js";
import { OnboardingService } from "./application/onboarding.service.js";
import { ClinicalCatalogueService } from "./application/clinical-catalogue.service.js";
import { ONBOARDING_REPOSITORY } from "./domain/onboarding-repository.types.js";
import { DOCUMENT_STORAGE } from "./domain/document-storage.port.js";
import { PrismaOnboardingRepository } from "./infrastructure/prisma-onboarding.repository.js";
import { S3DocumentStorage } from "./infrastructure/s3-document-storage.js";
import {
  AdminOnboardingController,
  ApplicantOnboardingController,
  SupportOnboardingController,
} from "./presentation/onboarding.controller.js";
import { ClinicalCatalogueController } from "./presentation/clinical-catalogue.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule, ManagerModule],
  controllers: [
    ApplicantOnboardingController,
    SupportOnboardingController,
    AdminOnboardingController,
    ClinicalCatalogueController,
  ],
  providers: [
    OnboardingService,
    ClinicalCatalogueService,
    { provide: ONBOARDING_REPOSITORY, useClass: PrismaOnboardingRepository },
    { provide: DOCUMENT_STORAGE, useClass: S3DocumentStorage },
  ],
})
export class OnboardingModule {}
