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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { formatDate, fullName } from "@/lib/format";
import {
  FileText, Search, ChevronDown, ChevronUp, FileCheck2, AlertTriangle,
} from "lucide-react";

type TabKey = "all" | "critical" | "abnormal" | "normal";

export function LabResults() {
  const { labId, reload } = useLabContext();
  const [results, setResults] = useState<LaboratoryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

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
    <div className="space-y-5">
      <PageHeader
        title="Results"
        description="Laboratory results published by your lab."
        actions={
          <Button variant="outline" onClick={() => navigate("laboratory", "bookings")}>
            <FileCheck2 className="h-4 w-4" /> Upload new result
          </Button>
        }
      />

      <div className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 py-2 bg-background/95 backdrop-blur-md">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="flex-wrap h-auto overflow-x-auto">
            <TabsTrigger value="all">All ({results.length})</TabsTrigger>
            <TabsTrigger value="critical">Critical ({critical.length})</TabsTrigger>
            <TabsTrigger value="abnormal">Abnormal ({abnormal.length})</TabsTrigger>
            <TabsTrigger value="normal">Normal ({normal.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by test, patient or result number…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No results"
          description="Published results will appear here. Open a booking to upload a new result."
          action={<Button size="sm" onClick={() => navigate("laboratory", "bookings")}>Go to bookings</Button>}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const isOpen = expanded === r.id;
            const isCritical = r.abnormalIndicator === "critical";
            return (
              <Collapsible key={r.id} open={isOpen} onOpenChange={(o) => setExpanded(o ? r.id : null)}>
                <Card className={isCritical ? "border-rose-200 bg-rose-50/30" : "hover:shadow-soft-md transition-shadow"}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full text-left tap-highlight-none">
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-semibold text-sm">{r.test}</span>
                              {r.abnormalIndicator ? <StatusBadge status={r.abnormalIndicator} size="sm" /> : <StatusBadge status="normal" size="sm" />}
                              <span className="text-xs text-muted-foreground">· {r.resultNumber}</span>
                              {isCritical && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200 rounded-md px-1.5 py-0.5">
                                  <AlertTriangle className="h-3 w-3" /> Notify provider
                                </span>
                              )}
                            </div>
                            <p className="text-sm">
                              <span className="font-medium">{r.value}</span>
                              {r.unit && <span className="text-muted-foreground"> {r.unit}</span>}
                              {r.referenceRange && (
                                <span className="text-xs text-muted-foreground ml-2">ref {r.referenceRange}</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {r.patient ? fullName(r.patient) : "Patient"} · Reported {formatDate(r.resultDate)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                            <span className="text-xs hidden sm:inline">View detail</span>
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                      </CardContent>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4">
                      <Separator className="mb-3" />
                      <div className="grid gap-3 sm:grid-cols-2 text-sm">
                        <Field label="Result number" value={r.resultNumber} />
                        <Field label="Sample collected" value={formatDate(r.sampleCollectionDate)} />
                        <Field label="Result date" value={formatDate(r.resultDate)} />
                        <Field label="Test" value={r.test} />
                        <Field label="Value" value={`${r.value} ${r.unit ?? ""}`} />
                        <Field label="Reference range" value={r.referenceRange ?? "—"} />
                        <Field label="Abnormal indicator" value={r.abnormalIndicator ?? "normal"} />
                        <Field label="Reviewer" value={r.reviewer ?? "—"} />
                      </div>
                      {r.interpretation && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Interpretation</p>
                          <p className="text-sm bg-muted/40 rounded-lg p-3 leading-relaxed">{r.interpretation}</p>
                        </div>
                      )}
                      {isCritical && (
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toastNotifyProvider(r.patient ? fullName(r.patient) : "patient", r.test)}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" /> Notify provider
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
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
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}

function toastNotifyProvider(patientName: string, test: string) {
  toast.success(`Referring provider notified about critical ${test} result for ${patientName}.`);
}
