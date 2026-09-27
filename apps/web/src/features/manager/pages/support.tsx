"use client";

import { useCallback, useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ManagerStatusBadge } from "../components/manager-shared";
import { navigate } from "@/lib/nav";
import { formatDateTime } from "@/lib/format";

type SafeTicket = { id: string; ticketNumber: string; displayName: string; category: string; status: string; lastActivityAt: string };
type Response = { data: SafeTicket[]; meta: { total: number } };

export function ManagerSupport() {
  const [res, setRes] = useState<Response | null>(null); const [view, setView] = useState("all"); const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => managerService.tickets({ view, pageSize: "30" }).then((v) => setRes(v as unknown as Response)).catch((e) => setError(e instanceof Error ? e.message : "Failed to load tickets.")), [view]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />; if (!res) return <LoadingState label="Loading ticket references…" />;
  return <div><PageHeader title="Support follow-up" description="For confidentiality, this queue shows only the ticket reference, display name, category and status. Royal Palace support handles the full record." />
    <div className="flex gap-2 mb-4">{["all", "open", "escalated", "resolved"].map((item) => <Button key={item} size="sm" variant={view === item ? "default" : "outline"} onClick={() => setView(item)} className="capitalize">{item}</Button>)}</div>
    <Card><CardContent className="p-0">{res.data.map((ticket) => <button key={ticket.id} onClick={() => navigate("manager", "ticket", { id: ticket.id })} className="w-full text-left grid sm:grid-cols-[1fr_1fr_auto] gap-2 p-4 border-b last:border-0 hover:bg-muted/40"><div><p className="font-semibold">{ticket.ticketNumber}</p><p className="text-xs text-muted-foreground">{ticket.displayName}</p></div><div><p className="text-sm capitalize">{ticket.category}</p><p className="text-xs text-muted-foreground">Updated {formatDateTime(ticket.lastActivityAt)}</p></div><ManagerStatusBadge status={ticket.status} /></button>)}</CardContent></Card>
  </div>;
}
