import { Inject, Injectable } from "@nestjs/common";
import type {
  CurrentSession,
  UpdatePatientProfileInput,
  UpdatePractitionerSettingsInput,
} from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import {
  ACCOUNT_PROFILE_REPOSITORY,
  type AccountProfileRepository,
  type ProfileUpdateResult,
} from "../domain/account-profile.types.js";

interface RequestContext {
  actor: CurrentSession;
  requestId: string;
}

export class AccountProfileNotFoundError extends Error {}
export class AccountProfileConflictError extends Error {}

@Injectable()
export class AccountProfileService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(ACCOUNT_PROFILE_REPOSITORY) private readonly repository: AccountProfileRepository,
  ) {}

  async getPatient(context: RequestContext) {
    await this.authorize(context, "PATIENT");
    const profile = await this.repository.findPatient(context.actor.principalId);
    if (profile === null) throw new AccountProfileNotFoundError();
    return profile;
  }

  async updatePatient(context: RequestContext, input: UpdatePatientProfileInput) {
    await this.authorize(context, "PATIENT");
    return this.resolve(
      await this.repository.updatePatient({
        ...input,
        principalId: context.actor.principalId,
        requestId: context.requestId,
      }),
    );
  }

  async getPractitioner(context: RequestContext) {
    await this.authorize(context, "PRACTITIONER");
    const profile = await this.repository.findPractitioner(context.actor.principalId);
    if (profile === null) throw new AccountProfileNotFoundError();
    return profile;
  }

  async getPractitionerVerification(context: RequestContext) {
    await this.authorize(context, "PRACTITIONER");
    const verification = await this.repository.findPractitionerVerification(
      context.actor.principalId,
    );
    if (verification === null) throw new AccountProfileNotFoundError();
    return verification;
  }

  async updatePractitioner(context: RequestContext, input: UpdatePractitionerSettingsInput) {
    await this.authorize(context, "PRACTITIONER");
    return this.resolve(
      await this.repository.updatePractitioner({
        ...input,
        principalId: context.actor.principalId,
      }),
    );
  }

  private async authorize(context: RequestContext, profileKind: "PATIENT" | "PRACTITIONER") {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        ownerPrincipalId: context.actor.principalId,
        profileKind,
        resourceId: context.actor.principalId,
        resourceType: "account_profile",
      },
      policy: AUTHORIZATION_POLICY.MANAGE_OWN_PROFILE,
      requestId: context.requestId,
    });
  }

  private resolve<T>(result: ProfileUpdateResult<T>): T {
    if (result.outcome === "NOT_FOUND") throw new AccountProfileNotFoundError();
    if (result.outcome === "VERSION_CONFLICT") throw new AccountProfileConflictError();
    return result.profile;
  }
}
