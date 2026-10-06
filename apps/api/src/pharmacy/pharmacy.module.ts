import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { PrescriptionService } from "./application/prescription.service.js";
import { PRESCRIPTION_REPOSITORY } from "./domain/prescription.types.js";
import { PrismaPrescriptionRepository } from "./infrastructure/prisma-prescription.repository.js";
import {
  InternalPrescriptionController,
  PatientPrescriptionController,
  PharmacyPrescriptionController,
  PrescriptionReadController,
  ProviderPrescriptionController,
} from "./presentation/prescription.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [
    InternalPrescriptionController,
    PatientPrescriptionController,
    PharmacyPrescriptionController,
    PrescriptionReadController,
    ProviderPrescriptionController,
  ],
  providers: [
    PrescriptionService,
    { provide: PRESCRIPTION_REPOSITORY, useClass: PrismaPrescriptionRepository },
  ],
})
export class PharmacyModule {}
