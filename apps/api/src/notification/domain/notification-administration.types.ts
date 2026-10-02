import type { NotificationReplayResponse } from "@royal-palace/contracts";

export interface ReplayNotificationInput {
  actorPrincipalId: string;
  deliveryId: string;
  reason: string;
}

export interface NotificationAdministrationRepository {
  replay(input: ReplayNotificationInput): Promise<NotificationReplayResponse>;
}

export const NOTIFICATION_ADMINISTRATION_REPOSITORY = Symbol(
  "NOTIFICATION_ADMINISTRATION_REPOSITORY",
);
