"use client";

import { useEffect, useState, useCallback } from "react";
import { useNav } from "@/lib/nav";
import { logisticsService, notificationService } from "@/lib/services";
import type { LogisticsProvider, Notification, Delivery } from "@/types";

// Resolves the logistics provider profile for the logged-in logistics user,
// their deliveries and unread notifications.
//
// IMPORTANT: This context never exposes patient clinical, diagnosis, or
// laboratory information. Only delivery-relevant fields are surfaced to UI.
export function useLogisticsContext() {
  const { session } = useNav();
  const logisticsId = session?.profileId ?? null;

  const [profile, setProfile] = useState<LogisticsProvider | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!logisticsId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [p, delivs, notifs] = await Promise.all([
        logisticsService.get(logisticsId),
        logisticsService.deliveries(logisticsId),
        notificationService.list(logisticsId, "logistics").catch(() => [] as Notification[]),
      ]);
      setProfile(p);
      setDeliveries(delivs);
      setNotifications(notifs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logistics data.");
    } finally {
      setLoading(false);
    }
  }, [logisticsId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unread = notifications.filter((n) => !n.read).length;

  // Categorise deliveries by workflow stage. Only delivery-level fields
  // are exposed here — UI must never pull patient/order clinical info.
  const available = deliveries.filter((d) => d.status === "assigned");
  const pickupPhase = deliveries.filter((d) =>
    ["accepted", "heading_to_pickup", "arrived_at_pickup", "pickup_verified"].includes(d.status)
  );
  const inTransit = deliveries.filter((d) =>
    ["picked_up", "in_transit", "arrived_at_destination"].includes(d.status)
  );
  const active = deliveries.filter((d) =>
    [
      "accepted",
      "heading_to_pickup",
      "arrived_at_pickup",
      "pickup_verified",
      "picked_up",
      "in_transit",
      "arrived_at_destination",
    ].includes(d.status)
  );
  const completed = deliveries.filter((d) =>
    ["delivered", "failed", "returned", "cancelled"].includes(d.status)
  );

  return {
    logisticsId,
    profile,
    deliveries,
    available,
    pickupPhase,
    inTransit,
    active,
    completed,
    notifications,
    unread,
    loading,
    error,
    refresh,
  };
}
