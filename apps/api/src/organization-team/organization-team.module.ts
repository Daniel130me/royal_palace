import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { OrganizationTeamService } from "./application/organization-team.service.js";
import { ORGANIZATION_TEAM_REPOSITORY } from "./domain/organization-team.types.js";
import { PrismaOrganizationTeamRepository } from "./infrastructure/prisma-organization-team.repository.js";
import { OrganizationTeamController } from "./presentation/organization-team.controller.js";

@Module({
  controllers: [OrganizationTeamController],
  imports: [AuthorizationModule, IdentityModule],
  providers: [
    OrganizationTeamService,
    { provide: ORGANIZATION_TEAM_REPOSITORY, useClass: PrismaOrganizationTeamRepository },
  ],
})
export class OrganizationTeamModule {}
