"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { providerService } from "@/lib/services";
import type { Provider } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Search, MapPin, Star, ShieldCheck, Clock, Languages, Stethoscope,
  ArrowRight, ChevronRight,
} from "lucide-react";
import { formatCurrency, fullName, initials } from "@/lib/format";

const SPECIALTIES = ["All", "General Practitioner", "Cardiologist", "Paediatrician", "Dentist", "Dermatologist", "Gynaecologist", "Psychiatrist"];
const CHANNELS = ["All", "video", "audio", "in_person", "chat"];
const LOCATIONS = ["All", "Ikeja", "Yaba", "Lekki", "Surulere", "Ikorodu"];
const RATINGS = ["Any rating", "4.5+", "4.0+"];

export function PatientDoctors() {
  const { view } = useNav();
  const presetSpecialty = view.params?.specialty;
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState<string>(presetSpecialty ?? "All");
  const [channel, setChannel] = useState("All");
  const [location, setLocation] = useState("All");
  const [language, setLanguage] = useState("All");
  const [rating, setRating] = useState("Any rating");

  useEffect(() => {
    providerService
      .list()
      .then((rows) => {
        // Defensive: API now serializes; legacy fallback in case
        setProviders(rows);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load providers"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return providers
      .filter((p) => p.verificationStatus === "approved")
      .filter((p) => specialty === "All" || p.specialty === specialty)
      .filter((p) => channel === "All" || (Array.isArray(p.consultationModes) && p.consultationModes.includes(channel)))
      .filter((p) => location === "All" || p.city === location)
      .filter((p) => language === "All" || (Array.isArray(p.languages) && p.languages.includes(language)))
      .filter((p) => {
        if (rating === "Any rating") return true;
        const min = parseFloat(rating);
        return p.rating >= min;
      })
      .filter((p) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          p.specialty.toLowerCase().includes(q) ||
          (Array.isArray(p.languages) && p.languages.some((l) => l.toLowerCase().includes(q)))
        );
      })
      .sort((a, b) => b.rating - a.rating);
  }, [providers, specialty, channel, location, language, rating, search]);

  const allLanguages = useMemo(() => {
    const s = new Set<string>();
    providers.forEach((p) => (Array.isArray(p.languages) ? p.languages : []).forEach((l) => s.add(l)));
    return ["All", ...Array.from(s)];
  }, [providers]);

  return (
    <div>
      <PageHeader
        title="Find a Doctor"
        description="Verified doctors and specialists across Nigeria."
        breadcrumbs={[{ label: "Find Care", onClick: () => navigate("patient", "services") }, { label: "Doctors" }]}
      />

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Doctor name or specialty…"
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Specialty</Label>
              <Select value={specialty} onValueChange={setSpecialty}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Specialty" /></SelectTrigger>
                <SelectContent>
                  {SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s === "All" ? "All specialties" : s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Consultation mode</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c === "All" ? "Any mode" : c.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Location</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l === "All" ? "Any location" : l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allLanguages.map((l) => <SelectItem key={l} value={l}>{l === "All" ? "Any language" : l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Rating</Label>
              <Select value={rating} onValueChange={setRating}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RATINGS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading…" : `${filtered.length} doctor${filtered.length === 1 ? "" : "s"} found`}
        </p>
      </div>

      {loading ? (
        <LoadingState label="Loading doctors…" />
      ) : error ? (
        <EmptyState icon={Stethoscope} title="Could not load doctors" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No doctors match your filters"
          description="Try widening your search or clearing some filters."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((p) => (
            <DoctorCard key={p.id} provider={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function DoctorCard({ provider: p }: { provider: Provider }) {
  const modes = Array.isArray(p.consultationModes) ? p.consultationModes : [];
  const languages = Array.isArray(p.languages) ? p.languages : [];
  const bookable = p.verificationStatus === "approved";
  const nextSlot = "Tomorrow · 11:00 AM";
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 font-semibold">
              {initials(`${p.firstName} ${p.lastName}`)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold leading-tight">{fullName(p)}</h3>
              {bookable && (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{p.specialty}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{p.professionalTitle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-500 fill-amber-400" /> {p.rating.toFixed(1)} ({p.reviewCount} reviews)
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {p.yearsExperience} yrs exp
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {p.city}, {p.state}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {modes.map((m) => (
                <Badge key={m} variant="secondary" className="capitalize text-[10px]">
                  {m === "in_person" ? "In-person" : m}
                </Badge>
              ))}
              {languages.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Languages className="h-3 w-3" /> {languages.slice(0, 3).join(", ")}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">From</p>
            <p className="font-bold text-emerald-700">{formatCurrency(p.consultationFee)}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t">
          <div className="text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> Next: <span className="font-medium text-foreground">{nextSlot}</span>
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("public", "provider", { id: p.id })}>
              View profile <ChevronRight className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!bookable}
              onClick={() => navigate("patient", "book", { providerId: p.id })}
            >
              Book <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
