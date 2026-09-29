"use client";

import type { PublicOrganizationSummary, PublicService } from "@royal-palace/contracts";
import { Building2, Clock3, MapPin, Search, ShieldCheck, Siren, Stethoscope } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { publicDiscoveryService } from "@/lib/services";
import { formatPublicLocation } from "@/lib/public-location";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

export function PatientHospitals() {
  const [hospitals, setHospitals] = useState<readonly PublicOrganizationSummary[]>([]);
  const [services, setServices] = useState<readonly PublicService[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [service, setService] = useState("all");
  const [location, setLocation] = useState("");
  const [debouncedLocation, setDebouncedLocation] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setDebouncedLocation(location.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [location, query]);

  useEffect(() => {
    const controller = new AbortController();
    publicDiscoveryService
      .services("HOSPITAL", controller.signal)
      .then((response) => setServices(response.data))
      .catch((reason: unknown) => {
        if (!isAbort(reason)) {
          setError("Services could not be loaded. You can still search hospitals.");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    publicDiscoveryService
      .hospitals(
        discoveryParameters({ debouncedLocation, debouncedQuery, service }),
        controller.signal,
      )
      .then((response) => {
        setHospitals(response.data);
        setCursor(response.pageInfo.hasNextPage ? response.pageInfo.endCursor : null);
      })
      .catch((reason: unknown) => {
        if (!isAbort(reason)) setError("Hospitals could not be loaded. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedLocation, debouncedQuery, reloadKey, service]);

  const loadMore = useCallback(async () => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await publicDiscoveryService.hospitals({
        ...discoveryParameters({ debouncedLocation, debouncedQuery, service }),
        cursor,
      });
      setHospitals((current) => [...current, ...response.data]);
      setCursor(response.pageInfo.hasNextPage ? response.pageInfo.endCursor : null);
    } catch {
      setError("More hospitals could not be loaded. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, debouncedLocation, debouncedQuery, loadingMore, service]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Find a hospital"
        description="Filter verified hospitals by the care or service you need."
      />
      <div className="grid gap-2 md:grid-cols-[1fr_220px_180px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search hospitals"
            className="pl-9"
            placeholder="Search hospital, location or service…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select value={service} onValueChange={setService}>
          <SelectTrigger aria-label="Filter by service">
            <SelectValue placeholder="Service needed" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {services.map((item) => (
              <SelectItem key={item.id} value={item.code}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="Filter by location"
          maxLength={200}
          placeholder="City, region or postal code"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
      </div>
      <div aria-live="polite" className="sr-only">
        {loading ? "Loading hospitals" : `${hospitals.length} hospitals shown`}
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
        <SkeletonGrid count={4} />
      ) : hospitals.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No matching hospitals"
          description="Try another service, location or search term."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {hospitals.map((hospital) => (
            <HospitalCard key={hospital.id} hospital={hospital} />
          ))}
        </div>
      )}
      {!loading && cursor !== null ? (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Load more hospitals"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function HospitalCard({ hospital }: { hospital: PublicOrganizationSummary }) {
  const location = hospital.locations[0];
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{hospital.displayName}</h2>
            {location === undefined ? null : (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {formatPublicLocation(location)}
              </p>
            )}
          </div>
          <Badge className="bg-emerald-50 text-emerald-700">
            <ShieldCheck className="mr-1 h-3 w-3" />
            Verified
          </Badge>
        </div>
        {hospital.summary === null ? null : (
          <p className="text-sm text-muted-foreground">{hospital.summary}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {hospital.services.map((item) => (
            <Badge key={item.id} variant="outline">
              <Stethoscope className="mr-1 h-3 w-3" />
              {item.name}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {hospital.openTwentyFourHours ? (
            <span className="flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              Open 24 hours
            </span>
          ) : null}
          {hospital.emergencyAvailable ? (
            <span className="flex items-center gap-1 text-rose-600">
              <Siren className="h-3.5 w-3.5" />
              Emergency care
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function discoveryParameters(input: {
  debouncedLocation: string;
  debouncedQuery: string;
  service: string;
}) {
  return {
    limit: PAGE_SIZE,
    q: input.debouncedQuery || undefined,
    service: input.service === "all" ? undefined : input.service,
    location: input.debouncedLocation || undefined,
  };
}

function isAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}
