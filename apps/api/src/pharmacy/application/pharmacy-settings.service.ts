import { Inject, Injectable } from "@nestjs/common";
import type { CurrentSession } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import {
  PHARMACY_SETTINGS_REPOSITORY,
  type PharmacySettingsRepository,
} from "../domain/pharmacy-settings.types.js";

interface RequestContext {
  actor: CurrentSession;
  requestId: string;
}

export class PharmacySettingsNotFoundError extends Error {}
export class PharmacySettingsConflictError extends Error {}

@Injectable()
export class PharmacySettingsService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(PHARMACY_SETTINGS_REPOSITORY)
    private readonly repository: PharmacySettingsRepository,
  ) {}

  async get(context: RequestContext, organizationId: string) {
    await this.authorize(context, organizationId);
    const settings = await this.repository.find(organizationId);
    if (settings === null) throw new PharmacySettingsNotFoundError();
    return settings;
  }

  async update(
    context: RequestContext,
    organizationId: string,
    input: {
      deliveryEnabled: boolean;
      expectedVersion: number;
      pickupEnabled: boolean;
      preparationTargetMinutes: number;
    },
  ) {
    await this.authorize(context, organizationId);
    const result = await this.repository.update({
      ...input,
      organizationId,
      principalId: context.actor.principalId,
      updatedAt: new Date(),
    });
    if (result.outcome === "NOT_FOUND") throw new PharmacySettingsNotFoundError();
    if (result.outcome === "VERSION_CONFLICT") throw new PharmacySettingsConflictError();
    return result.settings;
  }

  private async authorize(context: RequestContext, organizationId: string) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        organizationId,
        resourceId: organizationId,
        resourceType: "pharmacy_operational_settings",
      },
      policy: AUTHORIZATION_POLICY.MANAGE_PHARMACY_SETTINGS,
      requestId: context.requestId,
    });
  }
}
