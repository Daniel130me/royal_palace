"use client";

import type { AdminAuditEventListItem, PlatformRole } from "@royal-palace/contracts";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Filter,
  Search,
  SlidersHorizontal,
  ScrollText,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ExpandableCard } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SectionCard,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { administrationService } from "@/lib/services";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: readonly (PlatformRole | "ALL")[] = [
  "ALL",
  "PATIENT",
  "MANAGER",
  "ORGANIZATION_ADMIN",
  "ORGANIZATION_STAFF",
  "PROVIDER",
  "SUPPORT",
  "ADMINISTRATOR",
  "FINANCE",
  "LOGISTICS",
  "SYSTEM_WORKER",
];
type TimeFilter = "TODAY" | "WEEK" | "ALL";

export function AdminAudit() {
  const [events, setEvents] = useState<readonly AdminAuditEventListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<PlatformRole | "ALL">("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const range = useMemo(() => auditRange(timeFilter), [timeFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const load = useCallback(
    async (nextCursor?: string) => {
      if (nextCursor === undefined) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const response = await administrationService.auditEvents({
          action: actionFilter === "ALL" ? undefined : actionFilter,
          cursor: nextCursor,
          effectiveRole: roleFilter === "ALL" ? undefined : roleFilter,
          from: range.from,
          limit: 25,
          query: debouncedSearch || undefined,
          to: range.to,
        });
        setEvents((current) =>
          nextCursor === undefined ? response.data : [...current, ...response.data],
        );
        setCursor(response.pageInfo.endCursor);
        setHasNextPage(response.pageInfo.hasNextPage);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to load the audit trail");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [actionFilter, debouncedSearch, range, roleFilter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo(() => [...new Set(events.map((event) => event.action))].sort(), [events]);
  const activeFilterCount = Number(roleFilter !== "ALL") + Number(actionFilter !== "ALL");

  if (loading)
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={4} />
      </div>
    );
  if (error !== null && events.length === 0)
    return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Trail"
        description="Immutable, privacy-minimized record of security and business actions across the platform."
        breadcrumbs={[
          { label: "Admin", onClick: () => navigate("admin", "dashboard") },
          { label: "Audit Trail" },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(events)}
            disabled={events.length === 0}
          >
            <Download className="h-4 w-4" /> CSV (loaded)
          </Button>
        }
      />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Action, actor ID, resource…"
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Filters"
          className="relative lg:hidden"
          onClick={() => setFiltersOpen((value) => !value)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="hidden lg:flex"
          onClick={() => setFiltersOpen((value) => !value)}
        >
          Advanced{" "}
          {filtersOpen ? (
            <ChevronUp className="ml-1 h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <SegmentedControl
        options={[
          { value: "TODAY" as const, label: "Today" },
          { value: "WEEK" as const, label: "Week" },
          { value: "ALL" as const, label: "All" },
        ]}
        value={timeFilter}
        onChange={setTimeFilter}
        size="sm"
      />
      {filtersOpen && (
        <SectionCard title="Advanced filters" icon={SlidersHorizontal}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 text-xs">
                <Filter className="h-3 w-3" /> Actor role
              </Label>
              <Select
                value={roleFilter}
                onValueChange={(value) => setRoleFilter(value as PlatformRole | "ALL")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role === "ALL" ? "All roles" : role.replaceAll("_", " ").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 text-xs">
                <Filter className="h-3 w-3" /> Action
              </Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All loaded actions</SelectItem>
                  {actions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>
      )}
      {error !== null && <ErrorState message={error} onRetry={() => void load()} />}
      {events.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit events"
          description="No events match your filters."
          compact
        />
      ) : (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {events.map((event) => {
            const description = describeAuditEvent(event);
            const isToday = new Date(event.occurredAt).toDateString() === new Date().toDateString();
            return (
              <ExpandableCard
                key={event.id}
                leading={
                  <div
                    className={cn(
                      "rounded-lg p-2",
                      event.effectiveRole === "ADMINISTRATOR"
                        ? "bg-emerald-50 ring-1 ring-emerald-100"
                        : "bg-muted",
                    )}
                  >
                    <Clock
                      className={cn(
                        "h-4 w-4",
                        event.effectiveRole === "ADMINISTRATOR"
                          ? "text-emerald-600"
                          : "text-muted-foreground",
                      )}
                    />
                  </div>
                }
                title={description}
                subtitle={`By ${event.actorPrincipalId ?? "system"} · ${event.action.replaceAll("_", " ")} · ${isToday ? formatTime(event.occurredAt) : formatDate(event.occurredAt)}`}
              >
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <AuditField label="Timestamp" value={formatDateTime(event.occurredAt)} />
                  <AuditField
                    label="Actor role"
                    value={(event.effectiveRole ?? "SYSTEM").replaceAll("_", " ")}
                  />
                  <AuditField label="Resource type" value={event.resourceType} mono />
                  <AuditField label="Resource ID" value={event.resourceId} mono />
                  <AuditField label="Result" value={event.result} />
                  <AuditField label="Reason" value={event.reasonCode ?? "—"} />
                </div>
              </ExpandableCard>
            );
          })}
        </div>
      )}
      {hasNextPage && cursor !== null && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void load(cursor)} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function AuditField({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-xs font-medium", mono && "font-mono break-all")}>{value}</p>
    </div>
  );
}

function describeAuditEvent(event: AdminAuditEventListItem): string {
  const action = event.action.replaceAll("_", " ").toLowerCase();
  const outcome =
    event.result === "SUCCEEDED" ? "Completed" : event.result === "DENIED" ? "Denied" : "Failed";
  return `${outcome} ${action} on ${event.resourceType}`;
}

function auditRange(filter: TimeFilter): { from?: string; to?: string } {
  if (filter === "ALL") return {};
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (filter === "WEEK") from.setDate(from.getDate() - 6);
  const to = new Date();
  to.setHours(24, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function exportCsv(events: readonly AdminAuditEventListItem[]): void {
  const rows = [
    [
      "Timestamp",
      "Actor ID",
      "Actor Role",
      "Action",
      "Resource Type",
      "Resource ID",
      "Result",
      "Reason",
    ],
    ...events.map((event) => [
      event.occurredAt,
      event.actorPrincipalId ?? "system",
      event.effectiveRole ?? "SYSTEM",
      event.action,
      event.resourceType,
      event.resourceId,
      event.result,
      event.reasonCode ?? "",
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
