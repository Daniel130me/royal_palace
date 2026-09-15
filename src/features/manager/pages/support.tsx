"use client";

// Support hub (plan §3.7): first-level tickets for the manager's portfolio
// with views for open / escalated / resolved queues and headline stats.

import { useCallback, useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManagerStatusBadge, ManagerEmptyState } from "../components/manager-shared";
import { formatDateTime } from "@/lib/format";
import { MANAGER_TICKET_PRIORITY_LABELS, MANAGER_TICKET_STATUS_LABELS, OPEN_TICKET_STATUSES } from "@/lib/manager-constants";
import { Building2, FlaskConical, LifeBuoy, Search, TicketCheck, ArrowUpRight, MessageSquare } from "lucide-react";
import { navigate } from "@/lib/nav";
import type { SupportTicket } from "@/types";

type TicketsResponse = { data: (SupportTicket & { messageCount: number })[]; meta: { page: number; pageSize: number; total: number; statusCounts: Record<string, number> } };
type View = "all" | "open" | "escalated" | "resolved";

export function ManagerSupport() {
  const [res, setRes] = useState<TicketsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRes((await managerService.tickets({ view, search, pageSize: "30" })) as unknown as TicketsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tickets.");
    } finally {
      setLoading(false);
    }
  }, [view, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const counts = res?.meta.statusCounts ?? {};
  const sum = (keys: string[]) => keys.reduce((acc, k) => acc + (counts[k] ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Support"
        description="First-level support for your portfolio. Resolve what you can, escalate to Royal Palace with a reason when you cannot."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Open" value={sum(OPEN_TICKET_STATUSES)} icon={LifeBuoy} tone="info" onClick={() => setView("open")} />
        <MetricCard label="Awaiting your response" value={sum(["new", "assigned_to_manager", "reopened"])} icon={MessageSquare} tone="warning" onClick={() => setView("open")} />
        <MetricCard label="Escalated" value={sum(["escalated_to_royal_palace", "royal_palace_investigating"])} icon={ArrowUpRight} tone="danger" onClick={() => setView("escalated")} />
        <MetricCard label="Resolved / closed" value={sum(["resolved", "closed"])} icon={TicketCheck} tone="success" onClick={() => setView("resolved")} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject or organization…" className="pl-9" aria-label="Search tickets" />
        </div>
        <div className="flex gap-2">
          {(["all", "open", "escalated", "resolved"] as View[]).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)} className="capitalize">
              {v}
            </Button>
          ))}
        </div>
      </div>

      {loading && !res ? (
        <LoadingState label="Loading tickets…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !res || res.data.length === 0 ? (
        <ManagerEmptyState title="No tickets here" description="Tickets from your organizations will appear in this queue." />
      ) : (
        <Card>
          <CardContent className="p-0">
            {res.data.map((t) => {
              const Icon = t.organizationType === "pharmacy" ? Building2 : FlaskConical;
              return (
                <button
                  key={t.id}
                  onClick={() => navigate("manager", "ticket", { id: t.id })}
                  className="w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-border/40 last:border-0 hover:bg-muted/40 transition-colors"
                >
                  <div className="rounded-lg bg-primary/10 p-2 shrink-0"><Icon className="h-4 w-4 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{t.subject}</p>
                      <ManagerStatusBadge status={t.status} label={MANAGER_TICKET_STATUS_LABELS[t.status as keyof typeof MANAGER_TICKET_STATUS_LABELS]} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {t.ticketNumber} · {t.organizationName} · {MANAGER_TICKET_PRIORITY_LABELS[t.priority as keyof typeof MANAGER_TICKET_PRIORITY_LABELS]} priority
                      {t.escalationDepartment ? ` · ${t.escalationDepartment}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end"><MessageSquare className="h-3 w-3" />{t.messageCount}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDateTime(t.lastActivityAt)}</p>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
