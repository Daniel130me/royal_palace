"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import {
  NOTIFICATIONS_UPDATED_EVENT,
  type NotificationSummary,
  notificationSummary,
} from "@/features/shared/notification-summary";
import { useNav } from "@/lib/nav";
import { productionAccountProfileService, productionNotificationService } from "@/lib/services";
import type { Provider } from "@/types";

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
      const [settings, verification] = await Promise.all([
        productionAccountProfileService.practitioner.get(),
        productionAccountProfileService.practitioner.verification(),
        loadNotifications(),
      ]);
      const primaryCredential = verification.credentials[0];
      setProfile({
        id: settings.id,
        userId: session?.userId ?? "",
        providerNumber: settings.id,
        firstName: settings.displayName,
        lastName: "",
        title: "",
        specialty:
          settings.primarySpecialty ?? verification.primarySpecialty ?? "Specialty not listed",
        professionalTitle: verification.primaryProfession ?? "Healthcare practitioner",
        qualifications: verification.credentials.map((credential) => credential.credentialType),
        yearsExperience: verification.yearsExperience ?? 0,
        biography: settings.biography ?? "",
        languages: [...settings.languageTags],
        registrationNumber: primaryCredential?.registrationNumber ?? "",
        licenceNumber: primaryCredential?.registrationNumber ?? "",
        licenceExpiry: primaryCredential?.expiresAt ?? "",
        verificationStatus:
          verification.verificationStatus === "VERIFIED"
            ? "approved"
            : verification.verificationStatus === "PENDING"
              ? "under_review"
              : verification.verificationStatus === "SUSPENDED"
                ? "suspended"
                : "rejected",
        consultationModes: [],
        city: "",
        state: "",
        rating: 0,
        reviewCount: 0,
        consultationFee: 0,
      });
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [loadNotifications, profileId, session?.userId]);

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
