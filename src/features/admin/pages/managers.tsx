"use client";

// Admin · Managers directory (plan §3.8): every manager with their portfolio
// size, open tickets and pending applications. Data comes from the
// admin-scoped /api/admin/managers endpoint — the same { data, meta } contract
// as the manager module. Click a row for the full oversight detail.

import { useCallback, useEffect, useMemo, useState } from "react";
import { sessionApi } from "@/lib/api-client";
import { navigate } from "@/lib/nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { PageHeader, ErrorState, EmptyState, SkeletonGrid } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { ManagerStatusBadge } from "@/features/manager/components/manager-shared";
import { formatDate, initials } from "@/lib/format";
import { Building2, FlaskConical, Search, Ticket, UserCog, ClipboardList } from "lucide-react";

type StatusFilter = "all" | "pending" | "active" | "suspended";

interface ManagerRow {
  id: string;
  managerNumber: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  territory: string;
  employmentStatus: string;
  verificationStatus: string;
  joinedAt: string;
  portfolio: { total: number; pharmacies: number; laboratories: number };
  openTickets: number;
  pendingApplications: number;
}

export function AdminManagers() {
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await sessionApi.get<{ data: ManagerRow[]; meta: { total: number } }>(
        `/api/admin/managers?status=${filter}&search=${encodeURIComponent(search.trim())}&pageSize=100`
      );
      setManagers(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load managers.");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const counts = useMemo(
    () => ({
      all: managers.length, // server filters; this is the returned page size count
    }),
    [managers]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Managers"
        description="Business-relationship managers, their portfolios and support workload."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Managers" }]}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, manager ID, email…"
          className="pl-9"
          aria-label="Search managers"
        />
      </div>

      <SegmentedControl
        options={(["all", "pending", "active", "suspended"] as StatusFilter[]).map((k) => ({
          value: k,
          label: k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1),
        }))}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {loading && managers.length === 0 ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : managers.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No managers found"
          description="Try adjusting your search or status filter."
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {managers.map((m) => (
            <CompactListItem
              key={m.id}
              leading={
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
              }
              title={m.name}
              subtitle={`${m.managerNumber} · ${m.territory} · Joined ${formatDate(m.joinedAt)} · ${m.employmentStatus.replace("_", " ")}`}
              trailing={
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="hidden sm:flex items-center gap-1" title="Portfolio size">
                    <Building2 className="h-3.5 w-3.5" /> {m.portfolio.pharmacies}
                    <FlaskConical className="h-3.5 w-3.5 ml-1" /> {m.portfolio.laboratories}
                  </span>
                  <span className="hidden sm:flex items-center gap-1" title="Open tickets">
                    <Ticket className="h-3.5 w-3.5" /> {m.openTickets}
                  </span>
                  {m.pendingApplications > 0 ? (
                    <span className="flex items-center gap-1 text-amber-700" title="Pending applications">
                      <ClipboardList className="h-3.5 w-3.5" /> {m.pendingApplications}
                    </span>
                  ) : null}
                  <ManagerStatusBadge status={m.verificationStatus} />
                </div>
              }
              onClick={() => navigate("admin", "manager", { id: m.id })}
              chevron
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {counts.all} manager{counts.all === 1 ? "" : "s"} in this view · portfolio counts are organizations currently managed.
      </p>
    </div>
  );
}
