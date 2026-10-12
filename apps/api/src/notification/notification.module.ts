import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { NotificationAdministrationService } from "./application/notification-administration.service.js";
import { NotificationInboxService } from "./application/notification-inbox.service.js";
import { NOTIFICATION_ADMINISTRATION_REPOSITORY } from "./domain/notification-administration.types.js";
import { NOTIFICATION_INBOX_REPOSITORY } from "./domain/notification-inbox.types.js";
import { PrismaNotificationAdministrationRepository } from "./infrastructure/prisma-notification-administration.repository.js";
import { PrismaNotificationInboxRepository } from "./infrastructure/prisma-notification-inbox.repository.js";
import { NotificationAdministrationController } from "./presentation/notification-administration.controller.js";
import { NotificationInboxController } from "./presentation/notification-inbox.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [NotificationAdministrationController, NotificationInboxController],
  providers: [
    NotificationAdministrationService,
    NotificationInboxService,
    {
      provide: NOTIFICATION_ADMINISTRATION_REPOSITORY,
      useClass: PrismaNotificationAdministrationRepository,
    },
    {
      provide: NOTIFICATION_INBOX_REPOSITORY,
      useClass: PrismaNotificationInboxRepository,
    },
  ],
})
export class NotificationModule {}
