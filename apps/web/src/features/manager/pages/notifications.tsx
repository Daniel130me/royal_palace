"use client";

import { ProductionNotificationInbox } from "@/features/shared/production-notification-inbox";

export function ManagerNotifications() {
  return (
    <ProductionNotificationInbox
      description="Referral status, earnings, support, security, and platform updates without clinical details."
      emptyDescription="New manager updates will appear here."
    />
  );
}
