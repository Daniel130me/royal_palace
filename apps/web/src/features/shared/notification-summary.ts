import type { NotificationComponents } from "@royal-palace/api-client";

type InboxItem = NotificationComponents["schemas"]["NotificationInboxItem"];

export const NOTIFICATIONS_UPDATED_EVENT = "royal-palace:notifications-updated";

export interface NotificationSummary {
  body: string;
  createdAt: string;
  id: string;
  read: boolean;
  title: string;
}

export function notificationTitle(templateKey: InboxItem["templateKey"]): string {
  return templateKey
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function notificationSummary(item: InboxItem): NotificationSummary {
  return {
    body: `Reference ${item.reference}`,
    createdAt: item.createdAt,
    id: item.id,
    read: item.readAt !== null,
    title: notificationTitle(item.templateKey),
  };
}

export function announceNotificationsUpdated(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}
