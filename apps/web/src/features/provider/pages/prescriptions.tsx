"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { prescriptionService } from "@/lib/services";
import { WithTimestamps } from "../normalize";
import type { Prescription } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatDate, relativeDay, fullName } from "@/lib/format";
import { Search, Pill, ArrowRight } from "lucide-react";

type Tab = "all" | "active" | "fulfilled" | "expired";

const ACTIVE_STATUSES = ["issued", "awaiting_pharmacy", "partially_fulfilled"];
const FULFILLED_STATUSES = ["fulfilled"];
const EXPIRED_STATUSES = ["expired", "cancelled"];

export function ProviderPrescriptions() {
  const { providerId } = useProviderContext();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  const load = useCallback(async () => {
    if (!providerId) return;
    setLoading(true);
    setError(null);
    try {
      const rxs = await prescriptionService.list({ providerId });
      setPrescriptions(rxs);
    } catch (e) {
      setError((e as Error).message ?? "Failed to load prescriptions.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () => [...prescriptions].sort((a, b) => ((b as WithTimestamps<Prescription>).createdAt ?? "").localeCompare((a as WithTimestamps<Prescription>).createdAt ?? "")),
    [prescriptions]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matches = (rx: Prescription) => {
      if (!term) return true;
      return `${rx.prescriptionNumber} ${rx.patient ? fullName(rx.patient) : ""} ${rx.items?.map((i) => i.medicine).join(" ")}`.toLowerCase().includes(term);
    };
    return sorted.filter(matches);
  }, [sorted, q]);

  const active = filtered.filter((rx) => ACTIVE_STATUSES.includes(rx.status));
  const fulfilled = filtered.filter((rx) => FULFILLED_STATUSES.includes(rx.status));
  const expired = filtered.filter((rx) => EXPIRED_STATUSES.includes(rx.status));

  const current = tab === "all" ? filtered : tab === "active" ? active : tab === "fulfilled" ? fulfilled : expired;

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Prescriptions" description="All prescriptions you have issued on the platform." />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Prescriptions"
        description="All prescriptions you have issued on the platform."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input className="pl-9" placeholder="Search number, patient, medicine…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />

      <div className="sticky top-14 lg:top-16 z-20 bg-background/95 backdrop-blur-md pb-3 mb-2">
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "all", label: "All", badge: filtered.length },
            { value: "active", label: "Active", badge: active.length },
            { value: "fulfilled", label: "Filled", badge: fulfilled.length },
            { value: "expired", label: "Expired", badge: expired.length },
          ]}
        />
      </div>

      {current.length === 0 ? (
        <EmptyState
          icon={Pill}
          title={
            tab === "all" ? "No prescriptions" :
            tab === "active" ? "No active prescriptions" :
            tab === "fulfilled" ? "No fulfilled prescriptions" :
            "No expired prescriptions"
          }
          description="Prescriptions you issue during encounters will appear here."
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {current.map((rx) => (
            <CompactListItem
              key={rx.id}
              leading={
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Pill className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              }
              title={rx.prescriptionNumber}
              subtitle={`${rx.patient ? fullName(rx.patient) : "Patient"} · ${formatDate((rx as WithTimestamps<Prescription>).createdAt)} · ${relativeDay((rx as WithTimestamps<Prescription>).createdAt)} · valid until ${formatDate(rx.expiryDate)}`}
              onClick={() => navigate("provider", "patient", { id: rx.patientId })}
              trailing={
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={rx.status} size="sm" />
                </div>
              }
              chevron
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{current.length} prescription(s)</p>
        <Button size="sm" variant="ghost" onClick={() => navigate("provider", "appointments")}>
          New from encounter <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
