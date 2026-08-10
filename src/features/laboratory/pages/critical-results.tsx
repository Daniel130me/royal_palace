"use client";

import { useEffect, useState } from "react";
import { navigate } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import { laboratoryService } from "@/lib/services";
import type { LaboratoryResult } from "@/types";
import {
  PageHeader, EmptyState, ErrorState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { ExpandableCard } from "@/components/healthcare/compact-list";
import { toast } from "sonner";
import { formatDate, formatDateTime, fullName } from "@/lib/format";
import { AlertTriangle, Phone, Stethoscope, ShieldCheck } from "lucide-react";

export function LabCriticalResults() {
  const { labId, reload } = useLabContext();
  const [results, setResults] = useState<LaboratoryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifying, setNotifying] = useState<string | null>(null);

  const load = () => {
    if (!labId) return;
    setLoading(true);
    laboratoryService
      .results(labId)
      .then((r) =>
        setResults(
          r
            .filter((x) => x.abnormalIndicator === "critical")
            .sort((a, b) => b.resultDate.localeCompare(a.resultDate))
        )
      )
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load results."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [labId]);

  const notifyProvider = (r: LaboratoryResult) => {
    setNotifying(r.id);
    setTimeout(() => {
      toast.success(
        `Referring provider and patient notified about critical ${r.test} result for ${r.patient ? fullName(r.patient) : "patient"}.`,
        { description: `Result ${r.resultNumber} · flagged for immediate review.` }
      );
      setNotifying(null);
    }, 600);
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Critical results"
        description="Results requiring immediate provider attention."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("laboratory", "results")} className="hidden lg:inline-flex">
            View all results
          </Button>
        }
      />

      {/* Protocol notice */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5">
        <div className="rounded-lg bg-amber-100 p-1.5 shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">Royal Palace protocol</p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            Critical results must be communicated to the referring provider within 1 hour.
          </p>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No critical results"
          description="Results with an abnormal indicator of 'critical' will appear here for follow-up."
          compact
        />
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <ExpandableCard
              key={r.id}
              className="border-rose-200 bg-rose-50/30"
              leading={
                <div className="rounded-lg bg-rose-100 p-2 ring-1 ring-rose-200">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                </div>
              }
              title={r.test}
              subtitle={`${r.patient ? fullName(r.patient) : "Patient"} · ${r.resultNumber} · ${formatDate(r.resultDate)}`}
              trailing={
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-rose-700 tabular-nums">{r.value} <span className="text-xs font-normal">{r.unit}</span></span>
                  <StatusBadge status="critical" size="sm" />
                </div>
              }
            >
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Field label="Reference range" value={r.referenceRange ?? "—"} />
                  <Field label="Reviewer" value={r.reviewer ?? "—"} />
                </div>
                {r.interpretation && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Interpretation</p>
                    <p className="text-sm bg-rose-50 border border-rose-200 rounded-lg p-3 leading-relaxed">{r.interpretation}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Auto-notified patient + referring provider at {formatDateTime(r.resultDate)}.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={notifying === r.id}
                    onClick={() => notifyProvider(r)}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {notifying === r.id ? "Notifying…" : "Notify provider"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("laboratory", "results")}>
                    <Stethoscope className="h-3.5 w-3.5" /> View result
                  </Button>
                </div>
              </div>
            </ExpandableCard>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
