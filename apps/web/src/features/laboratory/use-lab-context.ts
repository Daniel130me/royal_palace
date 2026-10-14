"use client";

import type { LaboratoryComponents } from "@royal-palace/api-client";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNav } from "@/lib/nav";
import { productionLaboratoryService } from "@/lib/services";

type LaboratoryWorkspace = LaboratoryComponents["schemas"]["LaboratoryWorkspace"];

interface LaboratorySummary {
  address: string;
  city: string;
  laboratoryNumber: string;
  name: string;
}

interface LaboratoryContextValue {
  error: string | null;
  lab: LaboratorySummary | null;
  labId: string | null;
  loading: boolean;
  reload: () => void;
  workspace: LaboratoryWorkspace | null;
}

const LaboratoryContext = createContext<LaboratoryContextValue | null>(null);

export function LaboratoryContextProvider({ children }: { children: React.ReactNode }) {
  const { session } = useNav();
  const labId = session?.profileId ?? null;
  const [workspace, setWorkspace] = useState<LaboratoryWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!labId) {
      setWorkspace(null);
      setLoading(false);
      setError("No laboratory membership is associated with this session.");
      return;
    }
    let active = true;
    setLoading(true);
    void productionLaboratoryService.laboratory
      .workspace(labId)
      .then((value) => {
        if (!active) return;
        setWorkspace(value);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setWorkspace(null);
        setError(
          reason instanceof Error ? reason.message : "Laboratory profile could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [labId, reloadKey]);

  const lab = useMemo(() => (workspace === null ? null : summary(workspace)), [workspace]);
  const value = useMemo(
    () => ({ error, lab, labId, loading, reload, workspace }),
    [error, lab, labId, loading, reload, workspace],
  );
  return createElement(LaboratoryContext.Provider, { value }, children);
}

export function useLabContext(): LaboratoryContextValue {
  const value = useContext(LaboratoryContext);
  if (value === null) {
    throw new Error("useLabContext must be used within LaboratoryContextProvider");
  }
  return value;
}

function summary(workspace: LaboratoryWorkspace): LaboratorySummary {
  const location = workspace.primaryLocation;
  return {
    address:
      [location?.addressLine1, location?.addressLine2].filter(Boolean).join(", ") ||
      "Address not published",
    city: location?.locality ?? location?.countryCode ?? "Location not published",
    laboratoryNumber: workspace.registration?.registrationNumber ?? "Registration pending",
    name: workspace.organization.displayName,
  };
}
