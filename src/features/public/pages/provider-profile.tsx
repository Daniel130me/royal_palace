"use client";

import { useEffect, useState } from "react";
import { providerService, serviceService } from "@/lib/services";
import type { Provider, Service, ServicePrice } from "@/types";
import { formatCurrency, age } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, ShieldCheck, MapPin, Clock, GraduationCap, Languages, Video, Calendar, ArrowLeft } from "lucide-react";
import { useNav, navigate } from "@/lib/nav";
import { LoadingState } from "@/components/healthcare/states";
import { consultationChannelLabel, onlineConsultationModes, SPECIALIST_COUNTRY } from "@/lib/consultation-policy";
import { patientConsultationTotal } from "@/lib/pricing-policy";

export function PublicProviderProfile() {
  const { view, session } = useNav();
  const id = view.params.id;
  const [provider, setProvider] = useState<Provider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    providerService.get(id).then((p) => {
      setProvider(p);
      setLoading(false);
    });
    serviceService.byCategory("consultation").then(setServices);
  }, [id]);

  if (loading) return <LoadingState />;
  if (!provider)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <p className="text-muted-foreground">Provider not found.</p>
        <Button variant="link" onClick={() => navigate("public", "providers")}>Back to all providers</Button>
      </div>
    );

  const slots = ["09:00", "10:30", "13:00", "15:30", "17:00"];
  const totalCost = patientConsultationTotal(provider, services);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <button onClick={() => navigate("public", "providers")} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All providers
      </button>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="h-24 w-24 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-2xl shrink-0">
              {provider.firstName[0]}{provider.lastName[0]}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{provider.title} {provider.firstName} {provider.lastName}</h1>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  <ShieldCheck className="h-3 w-3 mr-1" /> Verified
                </Badge>
              </div>
              <p className="text-muted-foreground">{provider.specialty} · {provider.professionalTitle}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{provider.rating} ({provider.reviewCount} reviews)</span>
                <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{provider.yearsExperience} years exp.</span>
                <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{SPECIALIST_COUNTRY}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {onlineConsultationModes(provider.consultationModes).map((m) => (
                  <span key={m} className="rounded-full bg-muted px-2.5 py-1 text-xs capitalize flex items-center gap-1">
                    {m === "video" && <Video className="h-3 w-3" />}{consultationChannelLabel(m)}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">Total consultation cost</p>
              <p className="text-2xl font-bold text-emerald-700 tabular-nums">{formatCurrency(totalCost)}</p>
              <Button
                className="mt-3 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  if (session?.role === "patient") navigate("patient", "book", { providerId: provider.id });
                  else navigate("login", "login");
                }}
              >
                <Calendar className="h-4 w-4 mr-1" /> Book appointment
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>About</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">{provider.biography}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Qualifications & experience</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1"><GraduationCap className="h-3.5 w-3.5" /> Qualifications</p>
                <ul className="text-sm space-y-1">
                  {provider.qualifications.map((q, i) => <li key={i} className="flex items-start gap-2"><span className="text-emerald-500 mt-1">•</span>{q}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1"><Languages className="h-3.5 w-3.5" /> Languages</p>
                <div className="flex flex-wrap gap-1.5">
                  {provider.languages.map((l) => <Badge key={l} variant="secondary">{l}</Badge>)}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Registration</p>
                <p className="text-sm">Reg. No: {provider.registrationNumber}</p>
                <p className="text-sm">Licence: {provider.licenceNumber} (expires {provider.licenceExpiry})</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Next available slots</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {slots.map((s) => (
                <div key={s} className="flex items-center justify-between rounded-md border p-2.5">
                  <span className="text-sm">Today · {s}</span>
                  <Button size="sm" variant="outline" onClick={() => session?.role === "patient" ? navigate("patient", "book", { providerId: provider.id, time: s }) : navigate("login", "login")}>
                    Book
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Consultation cost</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between gap-4"><span className="text-sm text-muted-foreground">Total payable</span><span className="text-lg font-semibold tabular-nums">{formatCurrency(totalCost)}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
