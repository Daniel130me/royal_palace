import type {
  NotificationInboxListResponse,
  NotificationMarkAllReadResponse,
  NotificationPreferenceListResponse,
  NotificationPreferenceResponse,
  NotificationReadResponse,
} from "@royal-palace/contracts";

export interface NotificationInboxScope {
  organizationIds: readonly string[];
  principalId: string;
}

export interface NotificationInboxRepository {
  list(
    input: NotificationInboxScope & {
      cursor?: { createdAt: Date; id: string };
      limit: number;
      unreadOnly: boolean;
    },
  ): Promise<NotificationInboxListResponse>;
  markAllRead(
    input: NotificationInboxScope & { limit: number; readAt: Date },
  ): Promise<NotificationMarkAllReadResponse>;
  markRead(
    input: NotificationInboxScope & { itemId: string; readAt: Date },
  ): Promise<NotificationReadResponse | null>;
  listPreferences(principalId: string): Promise<NotificationPreferenceListResponse>;
  updateMarketingPreference(input: {
    enabled: boolean;
    expectedVersion: number;
    principalId: string;
    updatedAt: Date;
  }): Promise<NotificationPreferenceResponse | null>;
}

export const NOTIFICATION_INBOX_REPOSITORY = Symbol("NOTIFICATION_INBOX_REPOSITORY");
