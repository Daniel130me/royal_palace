"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { prescriptionService } from "@/lib/services";
import type { Prescription } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { FileText, Search } from "lucide-react";

const ACTIVE_STATUSES = ["issued", "awaiting_pharmacy", "partially_fulfilled"];
type TabKey = "new" | "processing" | "done";

export function PharmacyPrescriptions() {
  const { pharmacyId, loading, error, refresh } = usePharmacyContext();
  const { view } = useNav();
  const [all, setAll] = useState<Prescription[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("new");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    prescriptionService
      .list()
      .then((list) => { if (!cancelled) setAll(list); })
      .catch(() => { if (!cancelled) setAll([]); })
      .finally(() => { if (!cancelled) setLocalLoading(false); });
    return () => { cancelled = true; };
  }, [pharmacyId, view.params.refresh]);

  const PROCESSING_STATUSES = ["accepted_by_pharmacy", "partially_fulfilled"];
  const DONE_STATUSES = ["fulfilled", "rejected", "expired", "cancelled"];

  const filtered = useMemo(() => {
    let list = all;
    if (tab === "new") list = list.filter((p) => ACTIVE_STATUSES.includes(p.status));
    if (tab === "processing") list = list.filter((p) => PROCESSING_STATUSES.includes(p.status));
    if (tab === "done") list = list.filter((p) => DONE_STATUSES.includes(p.status) || !ACTIVE_STATUSES.includes(p.status));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.prescriptionNumber.toLowerCase().includes(q) ||
          p.patient?.firstName.toLowerCase().includes(q) ||
          p.patient?.lastName.toLowerCase().includes(q) ||
          p.provider?.lastName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [all, tab, query]);

  const counts = useMemo(
    () => ({
      new: all.filter((p) => ACTIVE_STATUSES.includes(p.status)).length,
      processing: all.filter((p) => PROCESSING_STATUSES.includes(p.status)).length,
      done: all.filter((p) => DONE_STATUSES.includes(p.status) || !ACTIVE_STATUSES.includes(p.status)).length,
    }),
    [all]
  );

  if (loading || localLoading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-10 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prescriptions"
        description="Review and dispense prescriptions sent to your pharmacy."
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by Rx number, patient or prescriber…"
          className="pl-9"
        />
      </div>

      {/* Segmented control */}
      <SegmentedControl
        options={[
          { value: "new" as TabKey, label: "New", badge: counts.new },
          { value: "processing" as TabKey, label: "Processing", badge: counts.processing },
          { value: "done" as TabKey, label: "Done", badge: counts.done },
        ]}
        value={tab}
        onChange={setTab}
        size="sm"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={query ? "No matching prescriptions" : "No prescriptions here yet"}
          description={query ? "Try a different search term." : "Prescriptions in this status will appear here."}
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map((rx) => (
            <CompactListItem
              key={rx.id}
              leading={
                <div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100">
                  <FileText className="h-4 w-4 text-sky-600" />
                </div>
              }
              title={rx.prescriptionNumber}
              subtitle={`${rx.patient ? `${rx.patient.firstName} ${rx.patient.lastName}` : "—"} · Dr. ${rx.provider?.lastName ?? "—"} · ${rx.items?.length ?? 0} item(s)`}
              trailing={
                <div className="flex items-center gap-1.5">
                  {rx.items?.length ? (
                    <Badge variant="outline" className="text-[10px] h-5">{rx.items.length}</Badge>
                  ) : null}
                  <StatusBadge status={rx.status} size="sm" />
                </div>
              }
              onClick={() => navigate("pharmacy", "prescription", { id: rx.id })}
              chevron
            />
          ))}
        </div>
      )}
    </div>
  );
}
