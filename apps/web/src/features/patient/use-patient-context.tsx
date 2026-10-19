"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import {
  NOTIFICATIONS_UPDATED_EVENT,
  type NotificationSummary,
  notificationSummary,
} from "@/features/shared/notification-summary";
import { useNav } from "@/lib/nav";
import { productionAccountProfileService, productionNotificationService } from "@/lib/services";
import type { Patient } from "@/types";

interface PatientContextValue {
  dependants: Patient[];
  loading: boolean;
  notifications: NotificationSummary[];
  primary: Patient | null;
  profile: Patient | null;
  refresh: () => Promise<void>;
  selectPatient: (id: string) => void;
  unread: number;
}

const PatientContext = createContext<PatientContextValue | null>(null);

export function PatientContextProvider({ children }: { children: ReactNode }) {
  const { session, activePatientId, setActivePatient } = useNav();
  const [profile, setProfile] = useState<Patient | null>(null);
  const [primary, setPrimary] = useState<Patient | null>(null);
  const [dependants, setDependants] = useState<Patient[]>([]);
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (session?.profileId === undefined) {
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
  }, [session?.profileId]);

  const refresh = useCallback(async () => {
    if (session?.profileId === undefined || session.userId === undefined) {
      setProfile(null);
      setPrimary(null);
      setDependants([]);
      setLoading(false);
      return;
    }
    // Never retain one authenticated subject's portal data across a session transition.
    setProfile(null);
    setPrimary(null);
    setDependants([]);
    setNotifications([]);
    setLoading(true);
    try {
      const [owner] = await Promise.all([
        productionAccountProfileService.patient.get(),
        loadNotifications(),
      ]);
      const primaryProfile: Patient = {
        id: owner.id,
        userId: session.userId,
        patientNumber: owner.id,
        firstName: owner.givenName,
        lastName: owner.familyName,
        dateOfBirth: owner.dateOfBirth ?? "",
        gender: "Not provided",
        phone: owner.phoneE164 ?? "",
        email: "",
        city: "",
        state: "",
        country: owner.countryCode ?? "",
        allergies: [],
        conditions: [],
        medications: [],
        emergencyName: owner.emergencyContact?.displayName ?? null,
        emergencyPhone: owner.emergencyContact?.phoneE164 ?? null,
        emergencyRel: owner.emergencyContact?.relationship ?? null,
      };
      const dependentProfiles: Patient[] = [];
      const activeId = activePatientId ?? primaryProfile.id;
      setPrimary(primaryProfile);
      setDependants(dependentProfiles);
      setProfile(activeId === primaryProfile.id ? primaryProfile : primaryProfile);
    } catch {
      setProfile(null);
      setPrimary(null);
      setDependants([]);
    } finally {
      setLoading(false);
    }
  }, [activePatientId, loadNotifications, session?.profileId, session?.userId]);

  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const listener = () => void loadNotifications();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, listener);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, listener);
  }, [loadNotifications]);

  return (
    <PatientContext.Provider
      value={{
        dependants,
        loading,
        notifications,
        primary,
        profile,
        refresh,
        selectPatient: setActivePatient,
        unread: notifications.filter((item) => !item.read).length,
      }}
    >
      {children}
    </PatientContext.Provider>
  );
}

export function usePatientContext(): PatientContextValue {
  const context = useContext(PatientContext);
  if (context === null) {
    throw new Error("usePatientContext must be used within PatientContextProvider");
  }
  return context;
}
