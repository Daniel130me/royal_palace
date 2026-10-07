import { Module } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { PrescriptionService } from "./application/prescription.service.js";
import { PharmacyCommercialService } from "./application/pharmacy-commercial.service.js";
import {
  INVENTORY_GATEWAY,
  PHARMACY_COMMERCIAL_REPOSITORY,
} from "./domain/pharmacy-commercial.types.js";
import { PRESCRIPTION_REPOSITORY } from "./domain/prescription.types.js";
import {
  DisabledInventoryGateway,
  SyntheticInventoryGateway,
} from "./infrastructure/inventory-gateway.adapters.js";
import { PrismaPharmacyCommercialRepository } from "./infrastructure/prisma-pharmacy-commercial.repository.js";
import { PrismaPrescriptionRepository } from "./infrastructure/prisma-prescription.repository.js";
import { SERVICE_CONFIG } from "../tokens.js";
import {
  PatientPharmacyCommercialController,
  PharmacyCommercialController,
} from "./presentation/pharmacy-commercial.controller.js";
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
    PatientPharmacyCommercialController,
    PatientPrescriptionController,
    PharmacyCommercialController,
    PharmacyPrescriptionController,
    PrescriptionReadController,
    ProviderPrescriptionController,
  ],
  providers: [
    PrescriptionService,
    PharmacyCommercialService,
    { provide: PRESCRIPTION_REPOSITORY, useClass: PrismaPrescriptionRepository },
    { provide: PHARMACY_COMMERCIAL_REPOSITORY, useClass: PrismaPharmacyCommercialRepository },
    {
      provide: INVENTORY_GATEWAY,
      inject: [SERVICE_CONFIG],
      useFactory: (config: ApiServiceConfig) =>
        config.inventoryGateway.mode === "synthetic"
          ? new SyntheticInventoryGateway()
          : new DisabledInventoryGateway(),
    },
  ],
})
export class PharmacyModule {}
