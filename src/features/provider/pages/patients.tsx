"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { appointmentService, patientService } from "@/lib/services";
import { normalizePatient } from "../normalize";
import type { Appointment, Patient } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatDate, fullName, age, initials } from "@/lib/format";
import { Search, Users, ArrowRight } from "lucide-react";

export function ProviderPatients() {
  const { providerId } = useProviderContext();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    if (!providerId) return;
    setLoading(true);
    setError(null);
    try {
      const appts = await appointmentService.list({ providerId });
      setAppointments(appts);
      // Unique patients from appointments
      const ids = Array.from(new Set(appts.map((a) => a.patientId).filter(Boolean))) as string[];
      const resolved = await Promise.all(ids.map((id) => patientService.get(id).catch(() => null)));
      setPatients(resolved.filter((p): p is Patient => p !== null).map(normalizePatient));
    } catch (e) {
      setError((e as Error).message ?? "Failed to load patients.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.patientNumber} ${p.phone} ${p.email}`.toLowerCase().includes(term)
    );
  }, [patients, q]);

  const lastVisitByPatient = useMemo(() => {
    const map: Record<string, Appointment | undefined> = {};
    for (const a of appointments) {
      const existing = map[a.patientId];
      if (!existing || a.date > existing.date) map[a.patientId] = a;
    }
    return map;
  }, [appointments]);

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Patients" description="People you have consulted, derived from your appointments." />
        <SkeletonGrid count={6} className="sm:grid-cols-2 lg:grid-cols-3" />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Patients"
        description="People you have consulted, derived from your appointments."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input className="pl-9" placeholder="Search patient name, number…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No patients yet" description="Patients you consult will appear here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const lastAppt = lastVisitByPatient[p.id];
            const apptCount = appointments.filter((a) => a.patientId === p.id).length;
            const activeAllergies = p.allergies.filter((a) => a.status === "active");
            return (
              <Card key={p.id} className="hover:shadow-soft-md transition-shadow cursor-pointer" onClick={() => navigate("provider", "patient", { id: p.id })}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                        {initials(fullName(p))}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{fullName(p)}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{p.patientNumber} · {age(p.dateOfBirth) ?? "—"}y · {p.gender}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Visits</p>
                      <p className="font-semibold text-base mt-0.5">{apptCount}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Last visit</p>
                      <p className="font-semibold text-base mt-0.5">{lastAppt ? formatDate(lastAppt.date) : "—"}</p>
                    </div>
                  </div>
                  {activeAllergies.length > 0 && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2">
                      <p className="text-[10px] text-rose-600 uppercase font-semibold tracking-wider flex items-center gap-1">
                        ⚠ Allergies
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {activeAllergies.slice(0, 3).map((a, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] border-rose-200 bg-white text-rose-700">{a.name}</Badge>
                        ))}
                        {activeAllergies.length > 3 && <Badge variant="outline" className="text-[10px]">+{activeAllergies.length - 3}</Badge>}
                      </div>
                    </div>
                  )}
                  <Button size="sm" variant="ghost" className="w-full mt-3" onClick={(e) => { e.stopPropagation(); navigate("provider", "patient", { id: p.id }); }}>
                    Open record <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
