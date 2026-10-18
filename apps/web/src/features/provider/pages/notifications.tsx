"use client";

import { ProductionNotificationInbox } from "@/features/shared/production-notification-inbox";

export function ProviderNotifications() {
  return (
    <ProductionNotificationInbox
      description="Appointments, prescriptions, laboratory workflows, security, and platform updates."
      emptyDescription="New practice updates will appear here without placing clinical details in notification content."
    />
  );
}
