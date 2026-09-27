"use client";

// Shared client context for the Manager Portal: loads the signed-in
// manager's profile and headline stats once per session and exposes an
// unread-notification count for the shell badge.

import { useCallback, useEffect, useState } from "react";
import { managerService, notificationService, type ManagerMePayload } from "@/lib/services";
import type { Notification } from "@/types";

interface ManagerContextState {
  me: ManagerMePayload | null;
  unread: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

let cache: { me: ManagerMePayload; unread: number } | null = null;

export function useManagerContext(): ManagerContextState {
  const [state, setState] = useState<ManagerContextState>({
    me: cache?.me ?? null,
    unread: cache?.unread ?? 0,
    loading: !cache,
    error: null,
    refresh: () => {},
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const me = await managerService.me();
      const notifications = await notificationService.list(me.manager.id, "manager");
      const unread = notifications.filter((n: Notification) => !n.read).length;
      cache = { me, unread };
      setState({ me, unread, loading: false, error: null, refresh: load });
    } catch (error) {
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load manager profile.",
        refresh: load,
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return state;
}
