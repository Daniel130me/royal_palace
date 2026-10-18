"use client";

import { ProductionNotificationInbox } from "@/features/shared/production-notification-inbox";

export function PatientNotifications() {
  return (
    <ProductionNotificationInbox
      description="Appointment, prescription, laboratory, pharmacy, delivery, security, and platform updates."
      emptyDescription="New care and service updates will appear here without exposing clinical details externally."
    />
  );
}
