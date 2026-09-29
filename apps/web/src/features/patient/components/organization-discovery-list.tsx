"use client";

import type {
  PublicOrganizationSummary,
  PublicOrganizationType,
  PublicService,
} from "@royal-palace/contracts";
import type { LucideIcon } from "lucide-react";
import { MapPin, Search, ShieldCheck, Stethoscope } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CompactListItem } from "@/components/healthcare/compact-list";
import { EmptyState, PageHeader, SkeletonGrid } from "@/components/healthcare/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initials } from "@/lib/format";
import { formatPublicLocation, publicLocationLabel } from "@/lib/public-location";
import { publicDiscoveryService } from "@/lib/services";

const PAGE_SIZE = 20;
const FILTER_DEBOUNCE_MS = 300;
const RESOURCE_BY_TYPE = {
  LABORATORY: "laboratories",
  PHARMACY: "pharmacies",
} as const;

interface OrganizationDiscoveryListProps {
  accentClassName: string;
  description: string;
  emptyDescription: string;
  emptyTitle: string;
  icon: LucideIcon;
  organizationType: "PHARMACY" | "LABORATORY";
  searchPlaceholder: string;
  title: string;
}

export function OrganizationDiscoveryList(props: OrganizationDiscoveryListProps) {
  const [items, setItems] = useState<readonly PublicOrganizationSummary[]>([]);
  const [services, setServices] = useState<readonly PublicService[]>([]);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [debouncedLocation, setDebouncedLocation] = useState("");
  const [service, setService] = useState("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setDebouncedLocation(location.trim());
    }, FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [location, query]);

  useEffect(() => {
    const controller = new AbortController();
    publicDiscoveryService
      .services(props.organizationType, controller.signal)
      .then((response) => setServices(response.data))
      .catch((reason: unknown) => {
        if (!isAbort(reason)) setError("Service filters could not be loaded.");
      });
    return () => controller.abort();
  }, [props.organizationType]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    publicDiscoveryService
      .organizations(
        RESOURCE_BY_TYPE[props.organizationType],
        listParameters({ debouncedLocation, debouncedQuery, service }),
        controller.signal,
      )
      .then((response) => {
        setItems(response.data);
        setCursor(response.pageInfo.hasNextPage ? response.pageInfo.endCursor : null);
      })
      .catch((reason: unknown) => {
        if (!isAbort(reason)) setError("Organizations could not be loaded. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedLocation, debouncedQuery, props.organizationType, reloadKey, service]);

  const loadMore = useCallback(async () => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await publicDiscoveryService.organizations(
        RESOURCE_BY_TYPE[props.organizationType],
        { ...listParameters({ debouncedLocation, debouncedQuery, service }), cursor },
      );
      setItems((current) => [...current, ...response.data]);
      setCursor(response.pageInfo.hasNextPage ? response.pageInfo.endCursor : null);
    } catch {
      setError("More organizations could not be loaded. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, debouncedLocation, debouncedQuery, loadingMore, props.organizationType, service]);

  const Icon = props.icon;
  return (
    <div className="space-y-5">
      <PageHeader title={props.title} description={props.description} />
      <div className="grid gap-2 md:grid-cols-[1fr_220px_180px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={`Search ${props.title.toLowerCase()}`}
            className="pl-9"
            placeholder={props.searchPlaceholder}
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
        {loading ? "Loading organizations" : `${items.length} organizations shown`}
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
      ) : items.length === 0 ? (
        <EmptyState icon={Icon} title={props.emptyTitle} description={props.emptyDescription} />
      ) : (
        <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card">
          {items.map((item) => {
            const location = item.locations[0];
            return (
              <CompactListItem
                key={item.id}
                leading={
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={props.accentClassName}>
                      {initials(item.displayName)}
                    </AvatarFallback>
                  </Avatar>
                }
                title={item.displayName}
                subtitle={location === undefined ? undefined : formatPublicLocation(location)}
                trailing={
                  <div className="flex max-w-64 flex-wrap justify-end gap-1">
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      Verified
                    </Badge>
                    {item.services.slice(0, 2).map((offering) => (
                      <Badge key={offering.id} variant="secondary">
                        <Stethoscope className="mr-1 h-3 w-3" />
                        {offering.name}
                      </Badge>
                    ))}
                    {location === undefined ? null : (
                      <Badge variant="outline">
                        <MapPin className="mr-1 h-3 w-3" />
                        {publicLocationLabel(location)}
                      </Badge>
                    )}
                  </div>
                }
              />
            );
          })}
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

function listParameters(input: {
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
