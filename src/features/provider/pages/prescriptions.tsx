"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { prescriptionService } from "@/lib/services";
import { WithTimestamps } from "../normalize";
import type { Prescription } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatDate, relativeDay, fullName, initials } from "@/lib/format";
import { Search, Pill, ArrowRight } from "lucide-react";

export function ProviderPrescriptions() {
  const { providerId } = useProviderContext();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

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

  const filtered = useMemo(() => {
    const sorted = [...prescriptions].sort((a, b) => ((b as WithTimestamps<Prescription>).createdAt ?? "").localeCompare((a as WithTimestamps<Prescription>).createdAt ?? ""));
    const term = q.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter((rx) =>
      `${rx.prescriptionNumber} ${rx.patient ? fullName(rx.patient) : ""} ${rx.items?.map((i) => i.medicine).join(" ")}`.toLowerCase().includes(term)
    );
  }, [prescriptions, q]);

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

      {filtered.length === 0 ? (
        <EmptyState icon={Pill} title="No prescriptions" description="Prescriptions you issue during encounters will appear here." />
      ) : (
        <div className="space-y-3">
          {filtered.map((rx) => (
            <Card key={rx.id} className="hover:shadow-soft-md transition-shadow">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Pill className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{rx.prescriptionNumber}</p>
                      <StatusBadge status={rx.status} size="sm" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {rx.patient ? fullName(rx.patient) : "Patient"} · Issued {formatDate((rx as WithTimestamps<Prescription>).createdAt)} · {relativeDay((rx as WithTimestamps<Prescription>).createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Valid: {formatDate(rx.validityStartDate)} → {formatDate(rx.expiryDate)}
                    </p>
                    {rx.items && rx.items.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {rx.items.slice(0, 4).map((it) => (
                          <Badge key={it.id} variant="secondary" className="text-[10px] h-5">{it.medicine} {it.strength}</Badge>
                        ))}
                        {rx.items.length > 4 && <Badge variant="outline" className="text-[10px] h-5">+{rx.items.length - 4}</Badge>}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate("provider", "patient", { id: rx.patientId })}>
                    Open patient <ArrowRight className="h-3 w-3 ml-1" />
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
