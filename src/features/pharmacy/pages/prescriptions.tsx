"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { prescriptionService } from "@/lib/services";
import type { Prescription } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatDate } from "@/lib/format";
import { FileText, Search, ArrowRight } from "lucide-react";

const ACTIVE_STATUSES = ["issued", "awaiting_pharmacy", "partially_fulfilled"];
type TabKey = "active" | "all" | "history";

export function PharmacyPrescriptions() {
  const { pharmacyId, loading, error, refresh } = usePharmacyContext();
  const { view } = useNav();
  const [all, setAll] = useState<Prescription[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("active");
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

  // In this prototype, prescriptions are not pre-filtered by pharmacy in the
  // database (a prescription is "sent to a pharmacy" once an order is created
  // against it). We surface all prescriptions so the pharmacy can accept any
  // prescription presented by the patient.
  const filtered = useMemo(() => {
    let list = all;
    if (tab === "active") list = list.filter((p) => ACTIVE_STATUSES.includes(p.status));
    if (tab === "history") list = list.filter((p) => !ACTIVE_STATUSES.includes(p.status));
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

  if (loading || localLoading) return <LoadingState label="Loading prescriptions…" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "active", label: "Active" },
    { key: "all", label: "All" },
    { key: "history", label: "History" },
  ];

  return (
    <div>
      <PageHeader
        title="Prescriptions"
        description="Review and dispense prescriptions sent to your pharmacy."
        breadcrumbs={[{ label: "Pharmacy" }, { label: "Prescriptions" }]}
      />

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-lg border bg-background p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Rx number, patient or prescriber…"
            className="pl-8"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={query ? "No matching prescriptions" : "No prescriptions yet"}
          description={query ? "Try a different search term." : "When a prescription is sent to your pharmacy it will appear here for review."}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((rx) => (
            <Card key={rx.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{rx.prescriptionNumber}</p>
                      <StatusBadge status={rx.status} />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Patient:{" "}
                      <span className="font-medium text-foreground">
                        {rx.patient ? `${rx.patient.firstName} ${rx.patient.lastName}` : "—"}
                      </span>
                      {" · "}
                      Prescriber:{" "}
                      <span className="font-medium text-foreground">
                        {rx.provider ? `${rx.provider.title} ${rx.provider.lastName}` : "—"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Issued {formatDate(rx.validityStartDate)} · Expires {formatDate(rx.expiryDate)} ·{" "}
                      {rx.items?.length ?? 0} item(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => navigate("pharmacy", "prescription", { id: rx.id })}>
                      Review <ArrowRight className="h-3 w-3 ml-1" />
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
