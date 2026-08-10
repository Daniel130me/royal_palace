"use client";

import { useEffect, useState } from "react";
import { providerService } from "@/lib/services";
import type { Provider } from "@/types";
import { formatCurrency, age } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, ShieldCheck, Clock, MapPin, Video, Search, Stethoscope } from "lucide-react";
import { navigate } from "@/lib/nav";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";

export function PublicProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("all");
  const [channel, setChannel] = useState("all");

  useEffect(() => {
    providerService.list().then((p) => {
      setProviders(p.filter((x) => x.verificationStatus === "approved"));
      setLoading(false);
    });
  }, []);

  const specialties = Array.from(new Set(providers.map((p) => p.specialty)));
  const filtered = providers.filter((p) => {
    if (specialty !== "all" && p.specialty !== specialty) return false;
    if (channel !== "all" && !p.consultationModes.includes(channel)) return false;
    if (q && !`${p.firstName} ${p.lastName} ${p.specialty} ${p.city}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader title="Find a doctor" description="Browse verified providers across our network." />
      <Card className="mb-6">
        <CardContent className="p-4 grid gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name, specialty, city…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={specialty} onValueChange={setSpecialty}>
            <SelectTrigger><SelectValue placeholder="Specialty" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All specialties</SelectItem>
              {specialties.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger><SelectValue placeholder="Consultation mode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="audio">Audio</SelectItem>
              <SelectItem value="in_person">In-person</SelectItem>
              <SelectItem value="chat">Chat</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? <LoadingState /> : filtered.length === 0 ? (
        <EmptyState icon={Stethoscope} title="No providers found" description="Try adjusting your filters." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("public", "provider", { id: p.id })}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg shrink-0">
                    {p.firstName[0]}{p.lastName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold truncate">{p.title} {p.firstName} {p.lastName}</p>
                      <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                    </div>
                    <p className="text-sm text-muted-foreground">{p.specialty}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating}</span>
                      <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{p.yearsExperience}y exp</span>
                      <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{p.city}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {p.consultationModes.slice(0, 3).map((m) => (
                      <span key={m} className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize">{m.replace("_", " ")}</span>
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-emerald-700">{formatCurrency(p.consultationFee)}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate("public", "provider", { id: p.id }); }}
                  className="mt-4 w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  View profile & book
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
