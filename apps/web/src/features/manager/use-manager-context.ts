"use client";

import type { ManagerProfileResponse } from "@royal-palace/contracts";
import { useCallback, useEffect, useState } from "react";

import { managerPortalService } from "@/lib/services";

interface ManagerContextState {
  error: string | null;
  loading: boolean;
  profile: ManagerProfileResponse | null;
  refresh: () => void;
  unread: number;
}

let cachedProfile: ManagerProfileResponse | null = null;

export function useManagerContext(): ManagerContextState {
  const [profile, setProfile] = useState(cachedProfile);
  const [loading, setLoading] = useState(cachedProfile === null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void managerPortalService
      .profile()
      .then((result) => {
        cachedProfile = result;
        setProfile(result);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Manager profile could not be loaded."),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  return { error, loading, profile, refresh: load, unread: 0 };
}
