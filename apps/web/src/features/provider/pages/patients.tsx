"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Search, Users } from "lucide-react";

import { CompactListItem } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, initials } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { productionClinicalService, type ProviderClinicalPatient } from "@/lib/services";

export function ProviderPatients() {
  const [patients, setPatients] = useState<ProviderClinicalPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async (search: string) => {
    setLoading(true);
    setError(null);
    try {
      const normalized = search.trim();
      const page = await productionClinicalService.provider.listPatients(
        normalized.length >= 2 ? normalized : undefined,
      );
      setPatients([...page.data]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load patients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(query), 250);
    return () => window.clearTimeout(timeout);
  }, [load, query]);

  if (error !== null) return <ErrorState message={error} onRetry={() => void load(query)} />;

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Patients you have treated, derived from your protected clinical encounters."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search patient name…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        }
      />

      {loading ? (
        <SkeletonGrid count={6} className="sm:grid-cols-2 lg:grid-cols-3" />
      ) : patients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No patients found"
          description={
            query.trim()
              ? "Try a different patient name."
              : "Patients will appear after you open a clinical encounter."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
          {patients.map((patient) => (
            <CompactListItem
              key={patient.id}
              leading={
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {initials(patient.name)}
                  </AvatarFallback>
                </Avatar>
              }
              title={patient.name}
              subtitle={`${patient.encounterCount} encounter${patient.encounterCount === 1 ? "" : "s"} · last ${formatDate(patient.lastEncounterAt)}`}
              onClick={() => navigate("provider", "patient", { id: patient.id })}
              chevron
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{patients.length} patient(s) on this page</p>
        <Button size="sm" variant="ghost" onClick={() => navigate("provider", "appointments")}>
          View appointments <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
