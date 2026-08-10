"use client";

import { useEffect, useState, useCallback } from "react";
import { useNav } from "@/lib/nav";
import { providerService, notificationService } from "@/lib/services";
import { normalizeProvider } from "./normalize";
import type { Provider, Notification } from "@/types";

// Resolves the active provider profile (from session.profileId) plus their
// unread notifications. Used by ProviderPortal to wire the AppShell bell and
// to give every page a single source of truth for "the logged-in doctor".
export function useProviderContext() {
  const { session } = useNav();
  const profileId = session?.profileId ?? null;
  const [profile, setProfile] = useState<Provider | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!profileId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const p = await providerService.get(profileId);
      setProfile(normalizeProvider(p));
      notificationService
        .list(profileId, "provider")
        .then(setNotifications)
        .catch(() => setNotifications([]));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unread = notifications.filter((n) => !n.read).length;

  return {
    profile,
    providerId: profileId,
    notifications,
    unread,
    loading,
    refresh,
  };
}
