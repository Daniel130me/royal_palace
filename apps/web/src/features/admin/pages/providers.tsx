"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate, useNav } from "@/lib/nav";
import { providerService } from "@/lib/services";
import type { Provider } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatDate, initials } from "@/lib/format";
import { Stethoscope, Search, BadgeCheck, ChevronDown, ChevronUp } from "lucide-react";

type StatusFilter = "pending" | "verified" | "all";

const STATUS_MAP: Record<StatusFilter, string[]> = {
  pending: ["submitted", "under_review", "additional_information_requested", "suspended", "rejected"],
  verified: ["approved"],
  all: [],
};

const STATUS_LABELS: Record<StatusFilter, string> = {
  pending: "Pending",
  verified: "Verified",
  all: "All",
};

export function AdminProviders() {
  const { view } = useNav();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  const counts = useMemo(() => ({
    pending: providers.filter((p) => STATUS_MAP.pending.includes(p.verificationStatus)).length,
    verified: providers.filter((p) => STATUS_MAP.verified.includes(p.verificationStatus)).length,
    all: providers.length,
  }), [providers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const statuses = STATUS_MAP[filter];
    return providers.filter((p) => {
      if (statuses.length > 0 && !statuses.includes(p.verificationStatus)) return false;
      if (!q) return true;
      const haystack = `${p.firstName} ${p.lastName} ${p.specialty} ${p.city} ${p.providerNumber}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [providers, search, filter]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Providers"
        description="Verify and manage healthcare providers."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Providers" }]}
      />

      {/* Search always visible */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, specialty, city, provider no…"
          className="pl-9"
        />
      </div>

      {/* Segmented control */}
      <SegmentedControl
        options={(Object.keys(STATUS_MAP) as StatusFilter[]).map((k) => ({
          value: k,
          label: STATUS_LABELS[k],
          badge: counts[k],
        }))}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {/* Advanced filter toggle (desktop) */}
      <Button
        variant="ghost"
        size="sm"
        className="hidden lg:flex"
        onClick={() => setAdvancedOpen((v) => !v)}
      >
        Advanced filters {advancedOpen ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
      </Button>

      {loading ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No providers found"
          description="Try adjusting your search or filter."
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map((p) => {
            const days = Math.ceil((new Date(p.licenceExpiry).getTime() - Date.now()) / 86400000);
            const licenceCritical = days < 30;
            return (
              <CompactListItem
                key={p.id}
                leading={
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {initials(`${p.firstName} ${p.lastName}`)}
                    </AvatarFallback>
                  </Avatar>
                }
                title={`${p.title} ${p.firstName} ${p.lastName}`}
                subtitle={`${p.specialty} · ${p.city}, ${p.state} · ★ ${p.rating.toFixed(1)} · ${licenceCritical ? `Licence critical` : days < 90 ? `${days}d left` : `Licence ${formatDate(p.licenceExpiry)}`}`}
                trailing={
                  <div className="flex items-center gap-1.5">
                    {p.verificationStatus === "approved" && <BadgeCheck className="h-4 w-4 text-emerald-600" />}
                    <StatusBadge status={p.verificationStatus} size="sm" />
                  </div>
                }
                onClick={() => navigate("admin", "provider", { id: p.id })}
                chevron
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
