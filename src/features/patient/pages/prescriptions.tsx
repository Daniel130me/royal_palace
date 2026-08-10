"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { prescriptionService } from "@/lib/services";
import type { Prescription, PrescriptionStatus } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Pill, ChevronRight, Plus, Search } from "lucide-react";
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
    setLoading(true);
    prescriptionService.list({ patientId: profile.id })
      .then(setPrescriptions)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load prescriptions"))
      .finally(() => setLoading(false));
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
    <div>
      <PageHeader
        title="My Prescriptions"
        description="View your prescriptions and order medicines."
        actions={<Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("patient", "doctors")}>
          <Plus className="h-4 w-4 mr-1" /> Request consult
        </Button>}
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by number, doctor or medicine…"
          className="w-full rounded-md border bg-background pl-8 pr-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <LoadingState label="Loading prescriptions…" />
      ) : error ? (
        <EmptyState title="Could not load prescriptions" description={error} />
      ) : (
        <Tabs defaultValue="all">
          <TabsList className="w-full overflow-x-auto">
            {STATUSES.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize">
                {s === "all" ? "All" : s.replace("_", " ")} ({counts[s] ?? 0})
              </TabsTrigger>
            ))}
          </TabsList>
          {STATUSES.map((s) => (
            <TabsContent key={s} value={s} className="mt-4 space-y-3">
              {filtered.filter((p) => s === "all" || p.status === s).length === 0 ? (
                <EmptyState icon={Pill} title="No prescriptions" description="Prescriptions issued by your doctors will appear here." />
              ) : (
                filtered.filter((p) => s === "all" || p.status === s).map((rx) => (
                  <Card key={rx.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-violet-50 p-2 shrink-0">
                        <Pill className="h-5 w-5 text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{rx.prescriptionNumber}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {rx.provider ? fullName(rx.provider) : "Provider"} · {formatDate(rx.validityStartDate)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {rx.items?.length ?? 0} item(s) · expires {formatDate(rx.expiryDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={rx.status} />
                        <Button size="sm" variant="outline" onClick={() => navigate("patient", "prescription", { id: rx.id })}>
                          View <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
