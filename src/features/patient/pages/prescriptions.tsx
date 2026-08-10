"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { prescriptionService } from "@/lib/services";
import type { Prescription, PrescriptionStatus } from "@/types";
import { PageHeader, EmptyState, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { Pill, Plus, Search, ShoppingCart } from "lucide-react";
import { formatDate, fullName } from "@/lib/format";
import { usePatientContext } from "../use-patient-context";

const ACTIVE: PrescriptionStatus[] = ["issued", "awaiting_pharmacy", "partially_fulfilled"];
const FULFILLED: PrescriptionStatus[] = ["fulfilled"];

type RxTab = "active" | "fulfilled" | "all";

export function PatientPrescriptions() {
  const { profile } = usePatientContext();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<RxTab>("active");

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);
    prescriptionService.list({ patientId: profile.id })
      .then((rows) => { if (!cancelled) setPrescriptions(rows); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load prescriptions"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const filtered = useMemo(() => {
    return prescriptions
      .filter((p) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return p.prescriptionNumber.toLowerCase().includes(q) ||
          (p.provider && fullName(p.provider).toLowerCase().includes(q)) ||
          (p.items ?? []).some((i) => i.medicine.toLowerCase().includes(q));
      })
      .sort((a, b) => b.validityStartDate.localeCompare(a.validityStartDate));
  }, [prescriptions, search]);

  const counts = useMemo(() => ({
    active: prescriptions.filter((p) => ACTIVE.includes(p.status)).length,
    fulfilled: prescriptions.filter((p) => FULFILLED.includes(p.status)).length,
    all: prescriptions.length,
  }), [prescriptions]);

  const rows = filtered.filter((p) =>
    tab === "all" ? true : tab === "active" ? ACTIVE.includes(p.status) : FULFILLED.includes(p.status)
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Prescriptions"
        description="View your prescriptions and order medicines."
        actions={
          <Button size="sm" onClick={() => navigate("patient", "doctors")}>
            <Plus className="h-4 w-4" /> Request consult
          </Button>
        }
      />

      {/* Sticky search bar */}
      <div className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 py-2 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number, doctor or medicine…"
            className="pl-9"
          />
        </div>
      </div>

      <SegmentedControl<RxTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "active", label: "Active", badge: counts.active || undefined },
          { value: "fulfilled", label: "Fulfilled", badge: counts.fulfilled || undefined },
          { value: "all", label: "All" },
        ]}
      />

      {loading ? (
        <SkeletonGrid count={3} />
      ) : error ? (
        <EmptyState title="Could not load prescriptions" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Pill}
          title={search ? "No matches" : "No prescriptions"}
          description={search ? "Try a different search term." : "Prescriptions issued by your doctors will appear here."}
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {rows.map((rx) => {
            const canOrder = ACTIVE.includes(rx.status);
            return (
              <CompactListItem
                key={rx.id}
                leading={
                  <div className="rounded-lg bg-violet-50 p-2 ring-1 ring-violet-100">
                    <Pill className="h-4 w-4 text-violet-600" />
                  </div>
                }
                title={rx.prescriptionNumber}
                subtitle={`${rx.provider ? fullName(rx.provider) : "Provider"} · ${formatDate(rx.validityStartDate)} · ${rx.items?.length ?? 0} item(s)`}
                trailing={
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge status={rx.status} size="sm" />
                    {canOrder && (
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={(e) => { e.stopPropagation(); navigate("patient", "prescription", { id: rx.id }); }}
                      >
                        <ShoppingCart className="h-3 w-3" /> Order
                      </Button>
                    )}
                  </div>
                }
                onClick={() => navigate("patient", "prescription", { id: rx.id })}
                chevron
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
