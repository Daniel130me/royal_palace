import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { CurrentSession, NotificationReplayResponse } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import {
  NOTIFICATION_ADMINISTRATION_REPOSITORY,
  type NotificationAdministrationRepository,
} from "../domain/notification-administration.types.js";
import { SERVICE_CONFIG } from "../../tokens.js";

interface RequestContext {
  actor: CurrentSession;
  correlationId?: string;
  requestId: string;
}

export class NotificationDeliveryDisabledError extends Error {
  constructor() {
    super("Notification delivery is not enabled in this environment");
  }
}

@Injectable()
export class NotificationAdministrationService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(NOTIFICATION_ADMINISTRATION_REPOSITORY)
    private readonly repository: NotificationAdministrationRepository,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async replay(
    context: RequestContext,
    deliveryId: string,
    reason: string,
  ): Promise<NotificationReplayResponse> {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        resourceId: deliveryId,
        resourceType: "notification_delivery",
      },
      policy: AUTHORIZATION_POLICY.ADMINISTER_NOTIFICATION_DELIVERY,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      requestId: context.requestId,
    });
    if (this.config.notificationDelivery.mode === "disabled") {
      throw new NotificationDeliveryDisabledError();
    }
    return this.repository.replay({
      actorPrincipalId: context.actor.principalId,
      deliveryId,
      reason,
    });
  }
}
