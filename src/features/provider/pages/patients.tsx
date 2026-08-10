"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { appointmentService, patientService } from "@/lib/services";
import { normalizePatient } from "../normalize";
import type { Appointment, Patient } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { CompactListItem } from "@/components/healthcare/compact-list";
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
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map((p) => {
            const lastAppt = lastVisitByPatient[p.id];
            const apptCount = appointments.filter((a) => a.patientId === p.id).length;
            const activeAllergies = p.allergies.filter((a) => a.status === "active");
            return (
              <CompactListItem
                key={p.id}
                leading={
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {initials(fullName(p))}
                    </AvatarFallback>
                  </Avatar>
                }
                title={fullName(p)}
                subtitle={`${p.patientNumber} · ${age(p.dateOfBirth) ?? "—"}y · ${p.gender} · ${apptCount} visit(s) · last ${lastAppt ? formatDate(lastAppt.date) : "—"}`}
                onClick={() => navigate("provider", "patient", { id: p.id })}
                trailing={
                  <div className="flex items-center gap-1.5">
                    {activeAllergies.length > 0 ? (
                      <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 h-5 text-[10px]">
                        {activeAllergies.length} allergy{activeAllergies.length > 1 ? "ies" : ""}
                      </Badge>
                    ) : null}
                  </div>
                }
                chevron
              />
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{filtered.length} patient(s)</p>
        <Button size="sm" variant="ghost" onClick={() => navigate("provider", "appointments")}>
          View appointments <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
