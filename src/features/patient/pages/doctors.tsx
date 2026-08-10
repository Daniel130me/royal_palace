"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { providerService } from "@/lib/services";
import type { Provider } from "@/types";
import { PageHeader, EmptyState, LoadingState, SkeletonGrid } from "@/components/healthcare/page-header";
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
  ArrowRight, ChevronRight, SlidersHorizontal,
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    providerService
      .list()
      .then((rows) => { if (!cancelled) setProviders(rows); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load providers"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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

  const activeFilters = [
    specialty !== "All",
    channel !== "All",
    location !== "All",
    language !== "All",
    rating !== "Any rating",
  ].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Find a Doctor"
        description="Verified doctors and specialists across Nigeria."
        breadcrumbs={[{ label: "Find Care", onClick: () => navigate("patient", "services") }, { label: "Doctors" }]}
      />

      {/* Search bar — always visible */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search doctor name or specialty…"
          className="pl-9"
        />
      </div>

      {/* Mobile filter toggle */}
      <div className="lg:hidden">
        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeFilters > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">{activeFilters}</Badge>
            )}
          </span>
          <span className="text-xs text-muted-foreground">{filtersOpen ? "Hide" : "Show"}</span>
        </Button>
      </div>

      {/* Filters — collapsible on mobile, always visible on desktop */}
      <Card className={`${filtersOpen ? "block" : "hidden"} lg:block`}>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label className="text-xs text-muted-foreground">Specialty</Label>
              <Select value={specialty} onValueChange={setSpecialty}>
                <SelectTrigger className="w-full mt-1"><SelectValue placeholder="Specialty" /></SelectTrigger>
                <SelectContent>
                  {SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s === "All" ? "All specialties" : s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Consultation mode</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c === "All" ? "Any mode" : c.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Location</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l === "All" ? "Any location" : l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allLanguages.map((l) => <SelectItem key={l} value={l}>{l === "All" ? "Any language" : l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Rating</Label>
              <Select value={rating} onValueChange={setRating}>
                <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RATINGS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading…" : `${filtered.length} doctor${filtered.length === 1 ? "" : "s"} found`}
        </p>
      </div>

      {loading ? (
        <SkeletonGrid count={4} className="lg:grid-cols-2" />
      ) : error ? (
        <EmptyState icon={Stethoscope} title="Could not load doctors" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No doctors match your filters"
          description="Try widening your search or clearing some filters."
          action={activeFilters > 0 ? <Button variant="outline" onClick={() => {
            setSpecialty("All"); setChannel("All"); setLocation("All"); setLanguage("All"); setRating("Any rating");
          }}>Clear filters</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
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
    <Card className="hover:shadow-soft-md transition-shadow flex flex-col">
      <CardContent className="p-5 flex flex-col h-full">
        <div className="flex items-start gap-3">
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {initials(`${p.firstName} ${p.lastName}`)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold leading-tight tracking-tight">{fullName(p)}</h3>
              {bookable && (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-0.5 h-5 px-1.5 text-[10px]">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{p.specialty}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{p.professionalTitle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-500 fill-amber-400" /> {p.rating.toFixed(1)} ({p.reviewCount})
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {p.yearsExperience} yrs
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {p.city}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {modes.map((m) => (
                <Badge key={m} variant="secondary" className="capitalize text-[10px] h-5 px-1.5">
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
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">From</p>
            <p className="font-bold text-primary text-base">{formatCurrency(p.consultationFee)}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-border/60">
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1 min-w-0">
            <Clock className="h-3 w-3 shrink-0" /> <span className="truncate">Next: <span className="font-medium text-foreground">{nextSlot}</span></span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => navigate("public", "provider", { id: p.id })}>
              Profile
            </Button>
            <Button
              size="sm"
              disabled={!bookable}
              onClick={() => navigate("patient", "book", { providerId: p.id })}
            >
              Book <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
