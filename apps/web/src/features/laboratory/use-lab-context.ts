"use client";

import { useCallback, useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { laboratoryService, notificationService } from "@/lib/services";
import type { Laboratory, Notification } from "@/types";

/**
 * Resolves the laboratory profile for the current session (the lab user's
 * `profileId` — `LAB-001` for MedLab Diagnostics in the seed) and the lab's
 * notifications. All lab pages consume this so they share a single source of
 * truth and a single notification badge in the AppShell.
 */
export function useLabContext() {
  const { session } = useNav();
  const labId = session?.profileId ?? null;
  const [lab, setLab] = useState<Laboratory | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!labId) {
      setLoading(false);
      setError("No laboratory profile associated with this session.");
      return;
    }
    setLoading(true);
    Promise.all([
      laboratoryService.get(labId),
      notificationService.list(labId, "laboratory").catch(() => [] as Notification[]),
    ])
      .then(([labData, notifs]) => {
        setLab(labData);
        setNotifications(notifs);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load laboratory profile.")
      )
      .finally(() => setLoading(false));
  }, [labId, reloadKey]);

  const unread = notifications.filter((n) => !n.read).length;
  return { lab, labId, notifications, unread, loading, error, reload };
}
