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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-5">
      <PageHeader
        title="Critical results"
        description="Results flagged as critical and requiring immediate provider attention."
        actions={
          <Button variant="outline" onClick={() => navigate("laboratory", "results")}>
            View all results
          </Button>
        }
      />

      {/* Protocol notice */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
        <div className="rounded-xl bg-amber-100 p-2 shrink-0">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">Royal Palace protocol</p>
          <p className="text-sm text-amber-700 mt-0.5 leading-relaxed">
            Critical results must be communicated to the referring provider within 1 hour of publication.
            The patient also receives an automated notification when the result is published.
          </p>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No critical results"
          description="Results with an abnormal indicator of 'critical' will appear here for follow-up."
        />
      ) : (
        <div className="space-y-3">
          {results.map((r) => (
            <Card key={r.id} className="border-rose-200 bg-rose-50/30 overflow-hidden">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <div className="rounded-md bg-rose-100 p-1.5 shrink-0">
                        <AlertTriangle className="h-4 w-4 text-rose-600" />
                      </div>
                      <span className="font-semibold text-sm">{r.test}</span>
                      <StatusBadge status="critical" size="sm" />
                      <span className="text-xs text-muted-foreground">· {r.resultNumber}</span>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3 text-sm">
                      <Field label="Patient" value={r.patient ? fullName(r.patient) : "—"} />
                      <Field label="Value" value={`${r.value} ${r.unit ?? ""}`} />
                      <Field label="Reference range" value={r.referenceRange ?? "—"} />
                      <Field label="Reported" value={formatDate(r.resultDate)} />
                      <Field label="Reviewer" value={r.reviewer ?? "—"} />
                      <Field label="Sample collected" value={formatDate(r.sampleCollectionDate)} />
                    </div>
                    {r.interpretation && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Interpretation</p>
                        <p className="text-sm bg-rose-50 border border-rose-200 rounded-lg p-3 leading-relaxed">{r.interpretation}</p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Auto-notified patient + referring provider at {formatDateTime(r.resultDate)}.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0 sm:w-52">
                    <Button
                      variant="destructive"
                      disabled={notifying === r.id}
                      onClick={() => notifyProvider(r)}
                    >
                      <Phone className="h-4 w-4" />
                      {notifying === r.id ? "Notifying…" : "Notify provider"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate("laboratory", "results")}>
                      <Stethoscope className="h-3.5 w-3.5" /> View result
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
