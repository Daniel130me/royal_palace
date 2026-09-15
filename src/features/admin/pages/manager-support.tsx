"use client";

// Admin · Support escalations (plan §3.8): tickets escalated to Royal
// Palace by managers, routed to Finance/Technical/Operations/Compliance.

import { useCallback, useEffect, useState } from "react";
import { sessionApi } from "@/lib/api-client";
import { PageHeader, ErrorState, LoadingState, EmptyState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ManagerStatusBadge } from "@/features/manager/components/manager-shared";
import { formatDateTime } from "@/lib/format";
import { MANAGER_TICKET_STATUS_LABELS } from "@/lib/manager-constants";
import { Building2, FlaskConical, ArrowUpRight } from "lucide-react";
import type { SupportTicket } from "@/types";

export function AdminManagerSupport() {
  const [items, setItems] = useState<(SupportTicket & { managerName?: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const json = await sessionApi.get<{ data: (SupportTicket & { managerName?: string })[] }>("/api/admin/manager-data?view=escalations");
      setItems(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load escalations.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Support Escalations"
        description="Tickets escalated to Royal Palace by Managers (Level 2). Route them to the right department and resolve from the support console."
        actions={<ArrowUpRight className="h-5 w-5 text-muted-foreground" />}
      />
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !items ? (
        <LoadingState label="Loading escalations…" />
      ) : items.length === 0 ? (
        <EmptyState title="No escalations" description="Escalated tickets from managers will appear here." />
      ) : (
        <Card>
          <CardContent className="p-0">
            {items.map((t) => {
              const Icon = t.organizationType === "pharmacy" ? Building2 : FlaskConical;
              return (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3.5 border-b border-border/40 last:border-0">
                  <div className="rounded-lg bg-rose-50 p-2 shrink-0"><Icon className="h-4 w-4 text-rose-600" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{t.subject}</p>
                      <ManagerStatusBadge status={t.status} label={MANAGER_TICKET_STATUS_LABELS[t.status as keyof typeof MANAGER_TICKET_STATUS_LABELS]} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.ticketNumber} · {t.organizationName} · manager {t.managerName ?? t.managerId} · department {t.escalationDepartment ?? "—"} · escalated {t.escalatedAt ? formatDateTime(t.escalatedAt) : "—"}
                    </p>
                    {t.escalationReason ? <p className="text-xs text-muted-foreground mt-1 border-l-2 border-rose-300 pl-2">{t.escalationReason}</p> : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
