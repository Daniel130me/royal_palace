import type { NotificationChannel, RenderedNotification } from "./notification-policy.js";
import { syntheticProviderMessageId } from "./notification-policy.js";

export interface NotificationProviderInput extends RenderedNotification {
  channel: NotificationChannel;
  deliveryId: string;
  destination: string;
  recipientPrincipalId: string;
}

export interface NotificationProviderResult {
  providerCode: string;
  providerMessageId: string;
}

export interface NotificationProvider {
  send(input: NotificationProviderInput): Promise<NotificationProviderResult>;
}

export type NotificationFailureKind = "PERMANENT" | "TRANSIENT" | "UNKNOWN";

export class NotificationProviderError extends Error {
  constructor(
    readonly code: string,
    readonly kind: NotificationFailureKind,
  ) {
    super(code);
    this.name = "NotificationProviderError";
  }
}

/**
 * Local/test adapter. It records a deterministic acknowledgement and never contacts a user.
 * The delivery id is the provider idempotency key, so a crash/retry returns the same result.
 */
export class SyntheticNotificationProvider implements NotificationProvider {
  async send(input: NotificationProviderInput): Promise<NotificationProviderResult> {
    return {
      providerCode: "synthetic",
      providerMessageId: syntheticProviderMessageId(input.deliveryId),
    };
  }
}
