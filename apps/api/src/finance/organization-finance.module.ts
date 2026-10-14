import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { OrganizationFinanceService } from "./application/organization-finance.service.js";
import { ORGANIZATION_FINANCE_REPOSITORY } from "./domain/organization-finance.types.js";
import { PrismaOrganizationFinanceRepository } from "./infrastructure/prisma-organization-finance.repository.js";
import {
  AdminOrganizationFinanceController,
  OrganizationFinanceController,
} from "./presentation/organization-finance.controller.js";

@Module({
  imports: [AuthorizationModule, IdentityModule],
  controllers: [OrganizationFinanceController, AdminOrganizationFinanceController],
  providers: [
    OrganizationFinanceService,
    { provide: ORGANIZATION_FINANCE_REPOSITORY, useClass: PrismaOrganizationFinanceRepository },
  ],
})
export class OrganizationFinanceModule {}
