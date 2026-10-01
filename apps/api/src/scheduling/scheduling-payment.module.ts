import { Module } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { SERVICE_CONFIG } from "../tokens.js";
import { SchedulingPaymentService } from "./application/scheduling-payment.service.js";
import {
  PAYMENT_GATEWAY,
  SCHEDULING_PAYMENT_REPOSITORY,
} from "./domain/scheduling-payment.types.js";
import {
  DisabledPaymentGateway,
  SyntheticPaymentGateway,
} from "./infrastructure/payment-gateway.adapters.js";
import { PrismaSchedulingPaymentRepository } from "./infrastructure/prisma-scheduling-payment.repository.js";
import {
  AdminSchedulingPaymentController,
  InternalSchedulingPaymentController,
  PatientSchedulingPaymentController,
  PaymentWebhookController,
  ProviderAvailabilityController,
  PublicSchedulingController,
} from "./presentation/scheduling-payment.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [
    AdminSchedulingPaymentController,
    InternalSchedulingPaymentController,
    PatientSchedulingPaymentController,
    PaymentWebhookController,
    ProviderAvailabilityController,
    PublicSchedulingController,
  ],
  providers: [
    SchedulingPaymentService,
    { provide: SCHEDULING_PAYMENT_REPOSITORY, useClass: PrismaSchedulingPaymentRepository },
    {
      provide: PAYMENT_GATEWAY,
      inject: [SERVICE_CONFIG],
      useFactory(config: ApiServiceConfig) {
        return config.paymentGateway.mode === "synthetic"
          ? new SyntheticPaymentGateway(config.paymentGateway)
          : new DisabledPaymentGateway();
      },
    },
  ],
})
export class SchedulingPaymentModule {}
