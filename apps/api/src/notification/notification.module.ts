import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { NotificationAdministrationService } from "./application/notification-administration.service.js";
import { NOTIFICATION_ADMINISTRATION_REPOSITORY } from "./domain/notification-administration.types.js";
import { PrismaNotificationAdministrationRepository } from "./infrastructure/prisma-notification-administration.repository.js";
import { NotificationAdministrationController } from "./presentation/notification-administration.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [NotificationAdministrationController],
  providers: [
    NotificationAdministrationService,
    {
      provide: NOTIFICATION_ADMINISTRATION_REPOSITORY,
      useClass: PrismaNotificationAdministrationRepository,
    },
  ],
})
export class NotificationModule {}
