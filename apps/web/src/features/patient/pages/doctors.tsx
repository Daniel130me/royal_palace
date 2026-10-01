"use client";

import type {
  PublicConsultationMode,
  PublicPractitionerSummary,
  PublicProfession,
  PublicSpecialty,
} from "@royal-palace/contracts";
import {
  Clock,
  Languages,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initials } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { formatPractitionerLocation } from "@/lib/public-location";
import { publicDiscoveryService } from "@/lib/services";

const PAGE_SIZE = 20;
const FILTER_DEBOUNCE_MS = 300;
const ALL = "all";
const MODES: readonly { label: string; value: PublicConsultationMode }[] = [
  { label: "Video", value: "VIDEO" },
  { label: "Audio", value: "AUDIO" },
  { label: "Chat", value: "CHAT" },
  { label: "In person", value: "IN_PERSON" },
  { label: "Home visit", value: "HOME_VISIT" },
];

export function PatientDoctors() {
  const { view } = useNav();
  const presetSpecialty = view.params?.specialty;
  const initialSpecialty =
    presetSpecialty !== undefined && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(presetSpecialty)
      ? presetSpecialty
      : ALL;
  const [items, setItems] = useState<readonly PublicPractitionerSummary[]>([]);
  const [professions, setProfessions] = useState<readonly PublicProfession[]>([]);
  const [specialties, setSpecialties] = useState<readonly PublicSpecialty[]>([]);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [language, setLanguage] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [debouncedLocation, setDebouncedLocation] = useState("");
  const [debouncedLanguage, setDebouncedLanguage] = useState("");
  const [profession, setProfession] = useState(ALL);
  const [specialty, setSpecialty] = useState(initialSpecialty);
  const [mode, setMode] = useState(ALL);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedLanguage(language.trim());
      setDebouncedLocation(location.trim());
      setDebouncedQuery(query.trim());
    }, FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [language, location, query]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      publicDiscoveryService.professions(controller.signal),
      publicDiscoveryService.specialties(controller.signal),
    ])
      .then(([professionResponse, specialtyResponse]) => {
        setProfessions(professionResponse.data);
        setSpecialties(specialtyResponse.data);
      })
      .catch((reason: unknown) => {
        if (!isAbort(reason)) setError("Practitioner filters could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    publicDiscoveryService
      .practitioners(
        listParameters({
          language: debouncedLanguage,
          location: debouncedLocation,
          mode,
          profession,
          query: debouncedQuery,
          specialty,
        }),
        controller.signal,
      )
      .then((response) => {
        setItems(response.data);
        setCursor(response.pageInfo.hasNextPage ? response.pageInfo.endCursor : null);
      })
      .catch((reason: unknown) => {
        if (!isAbort(reason)) setError("Practitioners could not be loaded. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    debouncedLanguage,
    debouncedLocation,
    debouncedQuery,
    mode,
    profession,
    reloadKey,
    specialty,
  ]);

  const loadMore = useCallback(async () => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await publicDiscoveryService.practitioners({
        ...listParameters({
          language: debouncedLanguage,
          location: debouncedLocation,
          mode,
          profession,
          query: debouncedQuery,
          specialty,
        }),
        cursor,
      });
      setItems((current) => [...current, ...response.data]);
      setCursor(response.pageInfo.hasNextPage ? response.pageInfo.endCursor : null);
    } catch {
      setError("More practitioners could not be loaded. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [
    cursor,
    debouncedLanguage,
    debouncedLocation,
    debouncedQuery,
    loadingMore,
    mode,
    profession,
    specialty,
  ]);

  const activeFilters = [
    profession !== ALL,
    specialty !== ALL,
    mode !== ALL,
    language,
    location,
  ].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Find a Practitioner"
        description="Search independently verified healthcare practitioners by profession, specialty, language, service mode, and location."
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search practitioners"
          className="pl-9"
          maxLength={100}
          placeholder="Search practitioner name, profession or specialty"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="lg:hidden">
        <Button
          className="w-full justify-between"
          variant="outline"
          onClick={() => setFiltersOpen((value) => !value)}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeFilters > 0 ? <Badge variant="secondary">{activeFilters}</Badge> : null}
          </span>
          <span className="text-xs text-muted-foreground">{filtersOpen ? "Hide" : "Show"}</span>
        </Button>
      </div>
      <Card className={`${filtersOpen ? "block" : "hidden"} lg:block`}>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <FilterSelect label="Profession" value={profession} onValueChange={setProfession}>
            <SelectItem value={ALL}>All professions</SelectItem>
            {professions.map((item) => (
              <SelectItem key={item.id} value={item.code}>
                {item.name}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Specialty" value={specialty} onValueChange={setSpecialty}>
            <SelectItem value={ALL}>All specialties</SelectItem>
            {specialties.map((item) => (
              <SelectItem key={item.id} value={item.code}>
                {item.name}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Service mode" value={mode} onValueChange={setMode}>
            <SelectItem value={ALL}>Any service mode</SelectItem>
            {MODES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </FilterSelect>
          <div>
            <Label className="text-xs text-muted-foreground">Language</Label>
            <Input
              className="mt-1"
              maxLength={35}
              placeholder="BCP 47 tag, e.g. en"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Location</Label>
            <Input
              className="mt-1"
              maxLength={200}
              placeholder="City, region or postal code"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      <div aria-live="polite" className="sr-only">
        {loading ? "Loading practitioners" : `${items.length} practitioners shown`}
      </div>
      {error === null ? null : (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            Retry
          </Button>
        </div>
      )}
      {loading ? (
        <SkeletonGrid count={6} className="lg:grid-cols-2 xl:grid-cols-3" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No practitioners match your filters"
          description="Try widening the location, profession, specialty, language, or service-mode filters."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {items.map((practitioner) => (
            <PractitionerCard key={practitioner.id} practitioner={practitioner} />
          ))}
        </div>
      )}
      {!loading && cursor !== null ? (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect(props: {
  children: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{props.label}</Label>
      <Select value={props.value} onValueChange={props.onValueChange}>
        <SelectTrigger className="mt-1 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{props.children}</SelectContent>
      </Select>
    </div>
  );
}

function PractitionerCard({ practitioner }: { practitioner: PublicPractitionerSummary }) {
  const primaryLocation = practitioner.locations[0];
  return (
    <Card className="flex flex-col transition-shadow hover:shadow-soft-md">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarFallback className="bg-primary/10 font-semibold text-primary">
              {initials(practitioner.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="font-semibold leading-tight tracking-tight">
                {practitioner.displayName}
              </h3>
              <Badge
                variant="outline"
                className="gap-0.5 border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                <ShieldCheck className="h-3 w-3" /> Independently verified
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {practitioner.specialties.map(({ name }) => name).join(" · ") ||
                practitioner.professions.map(({ name }) => name).join(" · ")}
            </p>
            {practitioner.headline === null ? null : (
              <p className="mt-1 text-xs text-muted-foreground">{practitioner.headline}</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {practitioner.serviceModes.map((serviceMode) => (
            <Badge key={serviceMode} variant="secondary">
              {modeLabel(serviceMode)}
            </Badge>
          ))}
        </div>
        <div className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          {primaryLocation === undefined ? null : (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {formatPractitionerLocation(primaryLocation)}
            </span>
          )}
          {practitioner.languages.length === 0 ? null : (
            <span className="flex items-center gap-1">
              <Languages className="h-3 w-3" /> {practitioner.languages.join(", ")}
            </span>
          )}
          {practitioner.yearsExperience === null ? null : (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {practitioner.yearsExperience} years of experience
            </span>
          )}
        </div>
        <div className="mt-auto pt-4">
          {practitioner.acceptingPatients ? (
            <Button
              className="w-full"
              onClick={() => navigate("patient", "book", { providerId: practitioner.id })}
            >
              View availability
            </Button>
          ) : (
            <Badge variant="secondary">Not currently accepting patients</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function listParameters(input: {
  language: string;
  location: string;
  mode: string;
  profession: string;
  query: string;
  specialty: string;
}) {
  return {
    language: input.language || undefined,
    limit: PAGE_SIZE,
    location: input.location || undefined,
    mode: input.mode === ALL ? undefined : (input.mode as PublicConsultationMode),
    profession: input.profession === ALL ? undefined : input.profession,
    q: input.query || undefined,
    specialty: input.specialty === ALL ? undefined : input.specialty,
  };
}

function modeLabel(mode: PublicConsultationMode): string {
  return MODES.find(({ value }) => value === mode)?.label ?? mode;
}

function isAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}
