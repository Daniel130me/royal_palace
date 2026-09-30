import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { OnboardingService } from "./application/onboarding.service.js";
import { ClinicalCatalogueService } from "./application/clinical-catalogue.service.js";
import { ONBOARDING_REPOSITORY } from "./domain/onboarding-repository.types.js";
import { PrismaOnboardingRepository } from "./infrastructure/prisma-onboarding.repository.js";
import {
  AdminOnboardingController,
  ApplicantOnboardingController,
  SupportOnboardingController,
} from "./presentation/onboarding.controller.js";
import { ClinicalCatalogueController } from "./presentation/clinical-catalogue.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
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
  ],
})
export class OnboardingModule {}
