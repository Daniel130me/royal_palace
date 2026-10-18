"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import {
  NOTIFICATIONS_UPDATED_EVENT,
  type NotificationSummary,
  notificationSummary,
} from "@/features/shared/notification-summary";
import { useNav } from "@/lib/nav";
import { productionNotificationService, providerService } from "@/lib/services";
import type { Provider } from "@/types";

import { normalizeProvider } from "./normalize";

interface ProviderContextValue {
  loading: boolean;
  notifications: NotificationSummary[];
  profile: Provider | null;
  providerId: string | null;
  refresh: () => Promise<void>;
  unread: number;
}

const ProviderContext = createContext<ProviderContextValue | null>(null);

export function ProviderContextProvider({ children }: { children: ReactNode }) {
  const { session } = useNav();
  const profileId = session?.profileId ?? null;
  const [profile, setProfile] = useState<Provider | null>(null);
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (profileId === null) {
      setNotifications([]);
      return;
    }
    try {
      const response = await productionNotificationService.list({ limit: 50 });
      setNotifications(response.data.map(notificationSummary));
    } catch {
      // Notification availability must not make the clinical portal unusable.
      setNotifications([]);
    }
  }, [profileId]);

  const refresh = useCallback(async () => {
    if (profileId === null) {
      setProfile(null);
      setNotifications([]);
      setLoading(false);
      return;
    }
    // Never retain one authenticated subject's portal data across a session transition.
    setProfile(null);
    setNotifications([]);
    setLoading(true);
    try {
      const [provider] = await Promise.all([providerService.get(profileId), loadNotifications()]);
      setProfile(normalizeProvider(provider));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [loadNotifications, profileId]);

  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const listener = () => void loadNotifications();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, listener);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, listener);
  }, [loadNotifications]);

  return (
    <ProviderContext.Provider
      value={{
        loading,
        notifications,
        profile,
        providerId: profileId,
        refresh,
        unread: notifications.filter((item) => !item.read).length,
      }}
    >
      {children}
    </ProviderContext.Provider>
  );
}

export function useProviderContext(): ProviderContextValue {
  const context = useContext(ProviderContext);
  if (context === null) {
    throw new Error("useProviderContext must be used within ProviderContextProvider");
  }
  return context;
}
