import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { LogisticsDeliveryService } from "./application/logistics-delivery.service.js";
import { LOGISTICS_DELIVERY_REPOSITORY } from "./domain/logistics-delivery.types.js";
import { PrismaLogisticsDeliveryRepository } from "./infrastructure/prisma-logistics-delivery.repository.js";
import {
  AdminLogisticsDeliveryController,
  LogisticsDeliveryController,
  PatientLogisticsDeliveryController,
  PharmacyLogisticsDeliveryController,
} from "./presentation/logistics-delivery.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [
    AdminLogisticsDeliveryController,
    LogisticsDeliveryController,
    PatientLogisticsDeliveryController,
    PharmacyLogisticsDeliveryController,
  ],
  providers: [
    LogisticsDeliveryService,
    { provide: LOGISTICS_DELIVERY_REPOSITORY, useClass: PrismaLogisticsDeliveryRepository },
  ],
})
export class LogisticsModule {}
