"use client";

import { useEffect, useState, useCallback } from "react";
import { useNav } from "@/lib/nav";
import { patientService, notificationService } from "@/lib/services";
import type { Patient, Notification } from "@/types";

// Resolves the active patient (primary or selected dependant) for the logged-in
// patient user, plus their dependants and unread notifications.
export function usePatientContext() {
  const { session, activePatientId, setActivePatient } = useNav();
  const [profile, setProfile] = useState<Patient | null>(null);
  const [primary, setPrimary] = useState<Patient | null>(null);
  const [dependants, setDependants] = useState<Patient[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.profileId) return;
    setLoading(true);
    const all = await patientService.byUser(session.userId);
    const primaryProfile = all.find((p) => !p.parentPatientId) ?? all[0];
    setPrimary(primaryProfile);
    const deps = all.filter((p) => p.parentPatientId);
    setDependants(deps);
    const activeId = activePatientId ?? primaryProfile?.id;
    const active = all.find((p) => p.id === activeId) ?? primaryProfile;
    setProfile(active ?? null);
    if (active) {
      notificationService.list(active.id, "patient").then(setNotifications).catch(() => {});
    }
    setLoading(false);
  }, [session?.profileId, session?.userId, activePatientId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unread = notifications.filter((n) => !n.read).length;

  return {
    profile,
    primary,
    dependants,
    notifications,
    unread,
    loading,
    selectPatient: (id: string) => {
      setActivePatient(id);
      refresh();
    },
    refresh,
  };
}
