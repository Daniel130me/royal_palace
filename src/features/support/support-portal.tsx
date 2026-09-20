"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/healthcare/app-shell";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { sessionApi } from "@/lib/api-client";
import { Building2, ClipboardList, Headphones, Hospital, UserRound } from "lucide-react";

type Row = { id: string; name?: string; firstName?: string; lastName?: string; patientNumber?: string; pharmacyNumber?: string; laboratoryNumber?: string; hospitalNumber?: string; email: string; phone: string; city: string; state: string; onboardingStatus?: string; verificationStatus?: string; services?: { name: string }[] };
type Payload = { patients: Row[]; pharmacies: Row[]; laboratories: Row[]; hospitals: Row[] };

export function SupportPortal() {
  return <AppShell portal="support" brand="Royal Palace Support" navItems={[{ label: "Enrollments", page: "dashboard", icon: ClipboardList }]}><SupportEnrollments /></AppShell>;
}

function SupportEnrollments() {
  const [data, setData] = useState<Payload | null>(null); const [error, setError] = useState<string | null>(null); const [tab, setTab] = useState<keyof Payload>("patients");
  useEffect(() => { sessionApi.get<{ data: Payload }>("/api/support/enrollments").then((r) => setData(r.data)).catch((e) => setError(e instanceof Error ? e.message : "Failed to load enrollments.")); }, []);
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />; if (!data) return <LoadingState label="Loading enrollment records…" />;
  const icons = { patients: UserRound, pharmacies: Building2, laboratories: Headphones, hospitals: Hospital }; const Icon = icons[tab];
  return <div><PageHeader title="Enrollment records" description="Support has operational read access. Approval, rejection and information requests remain Admin-only." />
    <div className="flex gap-2 mb-4 flex-wrap">{(Object.keys(data) as (keyof Payload)[]).map((key) => <Button key={key} size="sm" variant={tab === key ? "default" : "outline"} onClick={() => setTab(key)} className="capitalize">{key} ({data[key].length})</Button>)}</div>
    <div className="grid md:grid-cols-2 gap-3">{data[tab].map((row) => <Card key={row.id}><CardContent className="p-4 flex gap-3"><Icon className="h-5 w-5 text-primary" /><div><p className="font-semibold">{row.name ?? `${row.firstName} ${row.lastName}`}</p><p className="text-xs text-muted-foreground">{row.patientNumber ?? row.pharmacyNumber ?? row.laboratoryNumber ?? row.hospitalNumber} · {row.city}, {row.state}</p><p className="text-sm">{row.email} · {row.phone}</p><p className="text-xs capitalize">Status: {row.onboardingStatus ?? row.verificationStatus}</p>{row.services?.length ? <p className="text-xs mt-1">Services: {row.services.map((s) => s.name).join(", ")}</p> : null}</div></CardContent></Card>)}</div>
  </div>;
}
