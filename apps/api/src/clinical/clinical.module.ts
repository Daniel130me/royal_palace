import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { ClinicalEncounterService } from "./application/clinical-encounter.service.js";
import { CLINICAL_ENCOUNTER_REPOSITORY } from "./domain/clinical-encounter.types.js";
import { PrismaClinicalEncounterRepository } from "./infrastructure/prisma-clinical-encounter.repository.js";
import {
  PatientClinicalEncounterController,
  ProviderClinicalEncounterController,
} from "./presentation/clinical-encounter.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [ProviderClinicalEncounterController, PatientClinicalEncounterController],
  providers: [
    ClinicalEncounterService,
    { provide: CLINICAL_ENCOUNTER_REPOSITORY, useClass: PrismaClinicalEncounterRepository },
  ],
})
export class ClinicalModule {}
