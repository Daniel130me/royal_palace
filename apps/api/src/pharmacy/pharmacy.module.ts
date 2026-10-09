import { Module } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { PrescriptionService } from "./application/prescription.service.js";
import { PharmacyCommercialService } from "./application/pharmacy-commercial.service.js";
import { PharmacyInventoryService } from "./application/pharmacy-inventory.service.js";
import {
  INVENTORY_GATEWAY,
  PHARMACY_COMMERCIAL_REPOSITORY,
} from "./domain/pharmacy-commercial.types.js";
import { PRESCRIPTION_REPOSITORY } from "./domain/prescription.types.js";
import { PHARMACY_INVENTORY_REPOSITORY } from "./domain/pharmacy-inventory.types.js";
import {
  DisabledInventoryGateway,
  SyntheticInventoryGateway,
} from "./infrastructure/inventory-gateway.adapters.js";
import { PrismaPharmacyCommercialRepository } from "./infrastructure/prisma-pharmacy-commercial.repository.js";
import { PrismaPharmacyInventoryRepository } from "./infrastructure/prisma-pharmacy-inventory.repository.js";
import { PrismaPrescriptionRepository } from "./infrastructure/prisma-prescription.repository.js";
import { SERVICE_CONFIG } from "../tokens.js";
import {
  AdminPharmacyCommercialController,
  PatientPharmacyCommercialController,
  PharmacyCommercialController,
} from "./presentation/pharmacy-commercial.controller.js";
import { PharmacyInventoryController } from "./presentation/pharmacy-inventory.controller.js";
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
    AdminPharmacyCommercialController,
    InternalPrescriptionController,
    PatientPharmacyCommercialController,
    PatientPrescriptionController,
    PharmacyCommercialController,
    PharmacyInventoryController,
    PharmacyPrescriptionController,
    PrescriptionReadController,
    ProviderPrescriptionController,
  ],
  providers: [
    PrescriptionService,
    PharmacyCommercialService,
    PharmacyInventoryService,
    { provide: PRESCRIPTION_REPOSITORY, useClass: PrismaPrescriptionRepository },
    { provide: PHARMACY_COMMERCIAL_REPOSITORY, useClass: PrismaPharmacyCommercialRepository },
    { provide: PHARMACY_INVENTORY_REPOSITORY, useClass: PrismaPharmacyInventoryRepository },
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
