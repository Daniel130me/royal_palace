"use client";

import { useEffect, useMemo, useState } from "react";
import { hospitalService } from "@/lib/services";
import type { Hospital } from "@/types";
import { PageHeader, EmptyState, SkeletonGrid } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Clock3, MapPin, Search, ShieldCheck, Siren, Stethoscope } from "lucide-react";

export function PatientHospitals() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  const [state, setState] = useState("all");

  useEffect(() => {
    hospitalService.list({ verificationStatus: "approved" }).then(setHospitals).finally(() => setLoading(false));
  }, []);

  const services = useMemo(() => [...new Set(hospitals.flatMap((h) => h.services?.filter((s) => s.active).map((s) => s.name) ?? []))].sort(), [hospitals]);
  const states = useMemo(() => [...new Set(hospitals.map((h) => h.state))].sort(), [hospitals]);
  const filtered = useMemo(() => hospitals.filter((hospital) => {
    const haystack = `${hospital.name} ${hospital.city} ${hospital.state} ${hospital.address} ${hospital.services?.map((s) => `${s.name} ${s.category}`).join(" ")}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase()))
      && (service === "all" || hospital.services?.some((item) => item.active && item.name === service))
      && (state === "all" || hospital.state === state);
  }), [hospitals, query, service, state]);

  return <div className="space-y-5">
    <PageHeader title="Find a hospital" description="Filter verified hospitals by the care or service you need." />
    <div className="grid gap-2 md:grid-cols-[1fr_220px_180px]">
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search hospital, location or service…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <Select value={service} onValueChange={setService}><SelectTrigger><SelectValue placeholder="Service needed" /></SelectTrigger><SelectContent><SelectItem value="all">All services</SelectItem>{services.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
      <Select value={state} onValueChange={setState}><SelectTrigger><SelectValue placeholder="State" /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem>{states.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
    </div>
    {loading ? <SkeletonGrid count={4} /> : filtered.length === 0 ? <EmptyState icon={Building2} title="No matching hospitals" description="Try another service, state or search term." /> : <div className="grid gap-4 md:grid-cols-2">{filtered.map((hospital) => <Card key={hospital.id}><CardContent className="p-5 space-y-3"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-lg">{hospital.name}</h2><p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{hospital.address}, {hospital.city}, {hospital.state}</p></div><Badge className="bg-emerald-50 text-emerald-700"><ShieldCheck className="mr-1 h-3 w-3" />Verified</Badge></div>{hospital.description ? <p className="text-sm text-muted-foreground">{hospital.description}</p> : null}<div className="flex flex-wrap gap-1.5">{hospital.services?.filter((item) => item.active).map((item) => <Badge key={item.id} variant="outline"><Stethoscope className="mr-1 h-3 w-3" />{item.name}</Badge>)}</div><div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{hospital.openTwentyFourHours ? <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />Open 24 hours</span> : null}{hospital.emergencyAvailable ? <span className="flex items-center gap-1 text-rose-600"><Siren className="h-3.5 w-3.5" />Emergency care</span> : null}</div></CardContent></Card>)}</div>}
  </div>;
}
