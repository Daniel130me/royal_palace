"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate, useNav } from "@/lib/nav";
import { providerService } from "@/lib/services";
import type { Provider } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, LoadingState, ErrorState, EmptyState, SkeletonGrid, SectionCard,
} from "@/components/healthcare/page-header";
import { formatDate, initials } from "@/lib/format";
import { Stethoscope, Search, MapPin, Star, ArrowRight, BadgeCheck, SlidersHorizontal } from "lucide-react";

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Approved", value: "approved" },
  { label: "Submitted", value: "submitted" },
  { label: "Under review", value: "under_review" },
  { label: "Suspended", value: "suspended" },
  { label: "Rejected", value: "rejected" },
  { label: "Info requested", value: "additional_information_requested" },
];

export function AdminProviders() {
  const { view } = useNav();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(
    view.params.status ?? "all"
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = () => {
    providerService.list()
      .then(setProviders)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load providers"))
      .finally(() => setLoading(false));
  };

  const refetch = () => {
    setLoading(true);
    setError(null);
    load();
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers.filter((p) => {
      if (statusFilter !== "all" && p.verificationStatus !== statusFilter) return false;
      if (!q) return true;
      const haystack = `${p.firstName} ${p.lastName} ${p.specialty} ${p.city} ${p.providerNumber}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [providers, search, statusFilter]);

  const activeFilterCount = (statusFilter !== "all" ? 1 : 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Providers"
        description="Verify, search and manage healthcare providers on the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Providers" }]}
      />

      {/* Always-visible search input + mobile filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, specialty, city, provider number…"
            className="pl-9"
          />
        </div>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="lg:hidden">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Filters" className="relative">
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-1">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Mobile collapsible filter */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="lg:hidden">
        <CollapsibleContent>
          <SectionCard title="Filters" icon={SlidersHorizontal}>
            <div className="space-y-1.5">
              <Label className="text-xs">Verification status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </SectionCard>
        </CollapsibleContent>
      </Collapsible>

      {/* Desktop inline filter */}
      <div className="hidden lg:block">
        <SectionCard title="Filters" icon={SlidersHorizontal}>
          <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
            <div className="space-y-1.5">
              <Label htmlFor="search-desktop" className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-desktop"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, specialty, city, provider number…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Verification status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>
      </div>

      {loading ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No providers found"
          description="Try adjusting your search or filter."
        />
      ) : (
        <SectionCard dense>
          <ul className="divide-y divide-border/60">
            {filtered.map((p) => {
              const days = Math.ceil((new Date(p.licenceExpiry).getTime() - Date.now()) / 86400000);
              const licenceCritical = days < 30;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => navigate("admin", "provider", { id: p.id })}
                    className="w-full text-left p-4 hover:bg-accent/40 transition-colors flex items-center gap-3 tap-highlight-none"
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {initials(`${p.firstName} ${p.lastName}`)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{p.title} {p.firstName} {p.lastName}</p>
                        <StatusBadge status={p.verificationStatus} size="sm" />
                        {p.verificationStatus === "approved" && (
                          <BadgeCheck className="h-4 w-4 text-emerald-600" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{p.specialty} · {p.professionalTitle}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.city}, {p.state}</span>
                        <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500" /> {p.rating.toFixed(1)} ({p.reviewCount})</span>
                        <span className={licenceCritical ? "text-rose-600 font-medium" : days < 90 ? "text-amber-600 font-medium" : ""}>
                          Licence {formatDate(p.licenceExpiry)} {days < 90 ? `· ${days < 0 ? `expired ${Math.abs(days)}d ago` : `${days}d left`}` : ""}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
