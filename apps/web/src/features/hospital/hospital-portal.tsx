"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/healthcare/app-shell";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNav } from "@/lib/nav";
import { hospitalService } from "@/lib/services";
import { Building2, Clock3, Hospital as HospitalIcon, MapPin, Siren, Stethoscope } from "lucide-react";
import type { Hospital } from "@/types";

export function HospitalPortal() {
  return <AppShell portal="hospital" brand="Royal Palace Hospital" navItems={[{ label: "Hospital Profile", page: "dashboard", icon: HospitalIcon, mobile: true }]}><HospitalDashboard /></AppShell>;
}

function HospitalDashboard() {
  const { session } = useNav(); const [hospital, setHospital] = useState<Hospital | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!session?.profileId) return; hospitalService.get(session.profileId).then(setHospital).catch((e) => setError(e instanceof Error ? e.message : "Failed to load hospital.")); }, [session?.profileId]);
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />; if (!hospital) return <LoadingState label="Loading hospital profile…" />;
  return <div><PageHeader title={hospital.name} description="Verified hospital profile and patient-facing service catalogue." />
    <div className="grid md:grid-cols-3 gap-3"><Card className="md:col-span-2"><CardHeader><CardTitle className="text-sm flex gap-2"><Stethoscope className="h-4 w-4" />Services offered</CardTitle><CardDescription>Patients use these services to find your hospital.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{hospital.services?.filter((s) => s.active).map((service) => <Badge key={service.id} variant="outline">{service.name}<span className="ml-1 text-muted-foreground">· {service.category}</span></Badge>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm flex gap-2"><Building2 className="h-4 w-4" />Facility</CardTitle></CardHeader><CardContent className="text-sm space-y-2"><p className="flex gap-1"><MapPin className="h-4 w-4" />{hospital.address}, {hospital.city}, {hospital.state}</p>{hospital.openTwentyFourHours ? <p className="flex gap-1"><Clock3 className="h-4 w-4" />Open 24 hours</p> : null}{hospital.emergencyAvailable ? <p className="flex gap-1 text-rose-600"><Siren className="h-4 w-4" />Emergency care available</p> : null}</CardContent></Card></div>
  </div>;
}
