import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AccountProfileService } from "./application/account-profile.service.js";
import { ACCOUNT_PROFILE_REPOSITORY } from "./domain/account-profile.types.js";
import { PrismaAccountProfileRepository } from "./infrastructure/prisma-account-profile.repository.js";
import { AccountProfileController } from "./presentation/account-profile.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [AccountProfileController],
  providers: [
    AccountProfileService,
    { provide: ACCOUNT_PROFILE_REPOSITORY, useClass: PrismaAccountProfileRepository },
  ],
})
export class AccountProfileModule {}
