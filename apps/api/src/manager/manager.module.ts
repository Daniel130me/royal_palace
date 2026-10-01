import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { ManagerService } from "./application/manager.service.js";
import { ReferralClaimService } from "./application/referral-claim.service.js";
import { MANAGER_REPOSITORY } from "./domain/manager-repository.types.js";
import { PrismaManagerRepository } from "./infrastructure/prisma-manager.repository.js";
import {
  AdminManagerController,
  ManagerController,
  SupportManagerTicketController,
} from "./presentation/manager.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [AdminManagerController, ManagerController, SupportManagerTicketController],
  providers: [
    ManagerService,
    ReferralClaimService,
    { provide: MANAGER_REPOSITORY, useClass: PrismaManagerRepository },
  ],
  exports: [ManagerService, ReferralClaimService],
})
export class ManagerModule {}
