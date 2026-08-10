"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { useLabContext } from "../use-lab-context";
import { laboratoryService } from "@/lib/services";
import type { LaboratoryResult } from "@/types";
import {
  PageHeader, EmptyState, ErrorState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard } from "@/components/healthcare/compact-list";
import { toast } from "sonner";
import { formatDate, fullName } from "@/lib/format";
import {
  FileText, Search, FileCheck2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "all" | "critical" | "abnormal" | "normal";

export function LabResults() {
  const { labId, reload } = useLabContext();
  const [results, setResults] = useState<LaboratoryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");

  const load = () => {
    if (!labId) return;
    setLoading(true);
    laboratoryService
      .results(labId)
      .then((r) => setResults([...r].sort((a, b) => b.resultDate.localeCompare(a.resultDate))))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load results."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [labId]);

  const critical = useMemo(() => results.filter((r) => r.abnormalIndicator === "critical"), [results]);
  const abnormal = useMemo(() => results.filter((r) => r.abnormalIndicator === "high" || r.abnormalIndicator === "low"), [results]);
  const normal = useMemo(() => results.filter((r) => !r.abnormalIndicator || r.abnormalIndicator === "normal"), [results]);

  const visible = useMemo(() => {
    const base = tab === "critical" ? critical : tab === "abnormal" ? abnormal : tab === "normal" ? normal : results;
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((r) =>
      r.test.toLowerCase().includes(q) ||
      r.resultNumber.toLowerCase().includes(q) ||
      (r.patient && `${r.patient.firstName} ${r.patient.lastName}`.toLowerCase().includes(q)) ||
      (r.value ?? "").toLowerCase().includes(q)
    );
  }, [tab, query, results, critical, abnormal, normal]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-9 bg-muted/40 animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Results"
        description="Laboratory results published by your lab."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("laboratory", "bookings")} className="hidden lg:inline-flex">
            <FileCheck2 className="h-4 w-4" /> Upload new
          </Button>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by test, patient or result number…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <SegmentedControl
        options={[
          { value: "all" as TabKey, label: "All", badge: results.length },
          { value: "critical" as TabKey, label: "Critical", badge: critical.length },
          { value: "abnormal" as TabKey, label: "Abnormal", badge: abnormal.length },
          { value: "normal" as TabKey, label: "Normal", badge: normal.length },
        ]}
        value={tab}
        onChange={setTab}
        size="sm"
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No results"
          description="Published results will appear here. Open a booking to upload a new result."
          action={<Button size="sm" onClick={() => navigate("laboratory", "bookings")}>Go to bookings</Button>}
          compact
        />
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const isCritical = r.abnormalIndicator === "critical";
            const isAbnormal = r.abnormalIndicator === "high" || r.abnormalIndicator === "low";
            return (
              <ExpandableCard
                key={r.id}
                className={cn(isCritical && "border-rose-200 bg-rose-50/30")}
                leading={
                  <div className={cn(
                    "rounded-lg p-2 ring-1",
                    isCritical ? "bg-rose-50 ring-rose-100" : isAbnormal ? "bg-amber-50 ring-amber-100" : "bg-emerald-50 ring-emerald-100"
                  )}>
                    {isCritical ? <AlertTriangle className="h-4 w-4 text-rose-600" /> : <FileText className={cn("h-4 w-4", isAbnormal ? "text-amber-600" : "text-emerald-600")} />}
                  </div>
                }
                title={r.test}
                subtitle={`${r.patient ? fullName(r.patient) : "Patient"} · ${r.resultNumber} · ${formatDate(r.resultDate)}`}
                trailing={
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums">{r.value} <span className="text-xs text-muted-foreground font-normal">{r.unit}</span></span>
                    {r.abnormalIndicator ? <StatusBadge status={r.abnormalIndicator} size="sm" /> : <StatusBadge status="normal" size="sm" />}
                  </div>
                }
              >
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Field label="Reference range" value={r.referenceRange ?? "—"} />
                    <Field label="Sample collected" value={formatDate(r.sampleCollectionDate)} />
                    <Field label="Result date" value={formatDate(r.resultDate)} />
                    <Field label="Reviewer" value={r.reviewer ?? "—"} />
                  </div>
                  {r.interpretation && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Interpretation</p>
                      <p className="text-sm bg-muted/40 rounded-lg p-3 leading-relaxed">{r.interpretation}</p>
                    </div>
                  )}
                  {isCritical && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-700 border-rose-200 hover:bg-rose-50"
                      onClick={() => toast.success(`Referring provider notified about critical ${r.test} result for ${r.patient ? fullName(r.patient) : "patient"}.`)}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" /> Notify provider
                    </Button>
                  )}
                </div>
              </ExpandableCard>
            );
          })}
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
