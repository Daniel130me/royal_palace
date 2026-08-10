"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { appointmentService, patientService } from "@/lib/services";
import { normalizePatient } from "../normalize";
import { intakeReason } from "./dashboard";
import type { Appointment, Patient } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatDate, formatTime, relativeDay, fullName, age } from "@/lib/format";
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

  if (loading) return <LoadingState label="Loading patients…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Patients"
        description="People you have consulted, derived from your appointments."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
              <Card key={p.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("provider", "patient", { id: p.id })}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold shrink-0">
                      {p.firstName[0]}{p.lastName[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{fullName(p)}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.patientNumber} · {age(p.dateOfBirth) ?? "—"}y · {p.gender}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Visits</p>
                      <p className="font-medium">{apptCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last visit</p>
                      <p className="font-medium">{lastAppt ? formatDate(lastAppt.date) : "—"}</p>
                    </div>
                  </div>
                  {activeAllergies.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] text-rose-600 uppercase font-semibold">Allergies</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {activeAllergies.slice(0, 3).map((a, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] border-rose-200 text-rose-700">{a.name}</Badge>
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
