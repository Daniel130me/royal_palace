"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import { auditService } from "@/lib/services";
import type { AuditLog } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PageHeader, ErrorState, EmptyState, SkeletonGrid, SectionCard,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard } from "@/components/healthcare/compact-list";
import { formatDateTime, formatTime, formatDate } from "@/lib/format";
import { ScrollText, Search, Filter, Clock, Download, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = ["all", "patient", "doctor", "dentist", "pharmacy", "laboratory", "logistics", "admin"];

type TimeFilter = "today" | "week" | "all";

export function AdminAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    auditService.list()
      .then(setLogs)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load audit log"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const actions = useMemo(() => {
    const set = new Set(logs.map((l) => l.action));
    return Array.from(set).sort();
  }, [logs]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  const counts = useMemo(() => ({
    today: logs.filter((l) => l.timestamp.slice(0, 10) === todayStr).length,
    week: logs.filter((l) => l.timestamp.slice(0, 10) >= weekAgoStr).length,
    all: logs.length,
  }), [logs, todayStr, weekAgoStr]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (timeFilter === "today" && l.timestamp.slice(0, 10) !== todayStr) return false;
      if (timeFilter === "week" && l.timestamp.slice(0, 10) < weekAgoStr) return false;
      if (roleFilter !== "all" && l.actorRole !== roleFilter) return false;
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (!q) return true;
      return `${l.description} ${l.actorId} ${l.action} ${l.entityType} ${l.entityId}`.toLowerCase().includes(q);
    });
  }, [logs, search, roleFilter, actionFilter, timeFilter, todayStr, weekAgoStr]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const exportCsv = () => {
    const rows = [
      ["Timestamp", "Actor ID", "Actor Role", "Action", "Entity Type", "Entity ID", "Description"],
      ...filtered.map((l) => [l.timestamp, l.actorId, l.actorRole, l.action, l.entityType, l.entityId, `"${l.description.replace(/"/g, '""')}"`]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeFilterCount = (roleFilter !== "all" ? 1 : 0) + (actionFilter !== "all" ? 1 : 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Trail"
        description="Immutable record of every action across the platform."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Audit Trail" }]}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        }
      />

      {/* Search + mobile filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Description, actor ID, entity…" className="pl-9" />
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Filters"
          className="relative lg:hidden"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-1">
              {activeFilterCount}
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="hidden lg:flex"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          Advanced {filtersOpen ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
        </Button>
      </div>

      {/* Time filter SegmentedControl */}
      <SegmentedControl
        options={[
          { value: "today" as TimeFilter, label: "Today", badge: counts.today },
          { value: "week" as TimeFilter, label: "Week", badge: counts.week },
          { value: "all" as TimeFilter, label: "All", badge: counts.all },
        ]}
        value={timeFilter}
        onChange={setTimeFilter}
        size="sm"
      />

      {/* Filters (collapsible) */}
      {filtersOpen && (
        <SectionCard title="Advanced filters" icon={SlidersHorizontal}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Actor role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r === "all" ? "All roles" : r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Action</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit events" description="No events match your filters." compact />
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filtered.map((l) => {
            const isToday = l.timestamp.slice(0, 10) === todayStr;
            return (
              <ExpandableCard
                key={l.id}
                leading={<div className={cn("rounded-lg p-2", l.actorRole === "admin" ? "bg-emerald-50 ring-1 ring-emerald-100" : "bg-muted")}>
                  <Clock className={cn("h-4 w-4", l.actorRole === "admin" ? "text-emerald-600" : "text-muted-foreground")} />
                </div>}
                title={l.description}
                subtitle={`By ${l.actorId} · ${l.action.replace(/_/g, " ")} · ${isToday ? formatTime(l.timestamp) : formatDate(l.timestamp)}`}
              >
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Timestamp</p>
                      <p className="text-xs font-medium">{formatDateTime(l.timestamp)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Actor role</p>
                      <p className="text-xs font-medium capitalize">{l.actorRole}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Entity type</p>
                      <p className="text-xs font-mono">{l.entityType}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Entity ID</p>
                      <p className="text-xs font-mono">{l.entityId}</p>
                    </div>
                  </div>
                </div>
              </ExpandableCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
