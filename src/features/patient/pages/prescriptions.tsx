"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { prescriptionService } from "@/lib/services";
import type { Prescription, PrescriptionStatus } from "@/types";
import { PageHeader, EmptyState, LoadingState, SkeletonGrid } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Pill, ChevronRight, Plus, Search, ShoppingCart } from "lucide-react";
import { formatDate, fullName } from "@/lib/format";
import { usePatientContext } from "../use-patient-context";

const STATUSES: (PrescriptionStatus | "all")[] = ["all", "issued", "awaiting_pharmacy", "partially_fulfilled", "fulfilled", "expired"];

export function PatientPrescriptions() {
  const { profile } = usePatientContext();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: prescriptions.length };
    STATUSES.slice(1).forEach((s) => { map[s] = prescriptions.filter((p) => p.status === s).length; });
    return map;
  }, [prescriptions]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Prescriptions"
        description="View your prescriptions and order medicines."
        actions={<Button size="sm" onClick={() => navigate("patient", "doctors")}>
          <Plus className="h-4 w-4" /> Request consult
        </Button>}
      />

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by number, doctor or medicine…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <SkeletonGrid count={3} />
      ) : error ? (
        <EmptyState title="Could not load prescriptions" description={error} />
      ) : (
        <Tabs defaultValue="all">
          <div className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 py-2 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur-md">
            <TabsList className="w-full overflow-x-auto">
              {STATUSES.map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {s === "all" ? "All" : s.replace("_", " ")} ({counts[s] ?? 0})
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {STATUSES.map((s) => (
            <TabsContent key={s} value={s} className="mt-4 space-y-3">
              {filtered.filter((p) => s === "all" || p.status === s).length === 0 ? (
                <EmptyState icon={Pill} title="No prescriptions" description="Prescriptions issued by your doctors will appear here." compact />
              ) : (
                filtered.filter((p) => s === "all" || p.status === s).map((rx) => {
                  const canOrder = ["issued", "awaiting_pharmacy", "partially_fulfilled"].includes(rx.status);
                  return (
                    <Card key={rx.id} className="hover:shadow-soft-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-xl bg-violet-50 p-2 ring-1 ring-violet-100 shrink-0">
                            <Pill className="h-5 w-5 text-violet-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-sm">{rx.prescriptionNumber}</p>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                  {rx.provider ? fullName(rx.provider) : "Provider"} · {formatDate(rx.validityStartDate)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {rx.items?.length ?? 0} item(s) · expires {formatDate(rx.expiryDate)}
                                </p>
                              </div>
                              <StatusBadge status={rx.status} size="sm" />
                            </div>
                            <div className="mt-3 flex gap-2">
                              {canOrder && (
                                <Button size="sm" onClick={() => navigate("patient", "prescription", { id: rx.id })}>
                                  <ShoppingCart className="h-3.5 w-3.5" /> Order
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => navigate("patient", "prescription", { id: rx.id })}>
                                View <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
