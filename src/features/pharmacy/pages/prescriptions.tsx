"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { prescriptionService } from "@/lib/services";
import type { Prescription } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatDate, initials } from "@/lib/format";
import { FileText, Search, ArrowRight, ChevronRight } from "lucide-react";

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

  const counts = useMemo(
    () => ({
      active: all.filter((p) => ACTIVE_STATUSES.includes(p.status)).length,
      history: all.filter((p) => !ACTIVE_STATUSES.includes(p.status)).length,
      all: all.length,
    }),
    [all]
  );

  if (loading || localLoading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-10 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "active", label: "Active", count: counts.active },
    { key: "all", label: "All", count: counts.all },
    { key: "history", label: "History", count: counts.history },
  ];

  return (
    <div className="space-y-5">
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

      {/* Sticky tabs */}
      <div className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 py-2 bg-background/90 backdrop-blur-md">
        <div className="inline-flex rounded-lg border bg-card p-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                tab === t.key ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {t.label}
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${tab === t.key ? "bg-primary-foreground/20" : "bg-muted"}`}>
                {t.count}
              </span>
            </button>
          ))}
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
            <Card key={rx.id} className="hover:shadow-soft-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{rx.prescriptionNumber}</p>
                      <StatusBadge status={rx.status} size="sm" />
                      {rx.items?.length ? (
                        <Badge variant="outline" className="text-[10px] h-5">{rx.items.length} item(s)</Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                          {rx.patient ? initials(`${rx.patient.firstName} ${rx.patient.lastName}`) : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-sm text-muted-foreground leading-relaxed min-w-0">
                        <span className="font-medium text-foreground">
                          {rx.patient ? `${rx.patient.firstName} ${rx.patient.lastName}` : "—"}
                        </span>
                        {" · "}
                        Prescriber:{" "}
                        <span className="font-medium text-foreground">
                          {rx.provider ? `${rx.provider.title} ${rx.provider.lastName}` : "—"}
                        </span>
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Issued {formatDate(rx.validityStartDate)} · Expires {formatDate(rx.expiryDate)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigate("pharmacy", "prescription", { id: rx.id })}>
                    Review <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
