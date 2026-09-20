"use client";

import { useCallback, useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { useNav } from "@/lib/nav";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ManagerStatusBadge } from "../components/manager-shared";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";

type SafeTicket = { id: string; ticketNumber: string; displayName: string; category: string; status: string; lastActivityAt: string; escalationDepartment?: string | null };

export function ManagerTicketDetail() {
  const { view } = useNav(); const id = view.params.id; const [ticket, setTicket] = useState<SafeTicket | null>(null); const [note, setNote] = useState(""); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(() => id ? managerService.ticket(id).then((v) => setTicket(v as unknown as SafeTicket)).catch((e) => setError(e instanceof Error ? e.message : "Failed to load ticket.")) : Promise.resolve(), [id]);
  useEffect(() => { void load(); }, [load]);
  const act = async (action: "follow_up" | "escalate") => { setBusy(true); try { await managerService.updateTicket({ ticketId: id, action, message: note }); toast.success(action === "escalate" ? "Ticket escalated." : "Follow-up sent."); setNote(""); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Action failed."); } finally { setBusy(false); } };
  if (error) return <ErrorState message={error} onRetry={load} />; if (!ticket) return <LoadingState label="Loading ticket reference…" />;
  return <div><PageHeader title={ticket.ticketNumber} description="Privacy-limited support follow-up" back />
    <Card><CardHeader><CardTitle className="flex justify-between">{ticket.displayName}<ManagerStatusBadge status={ticket.status} /></CardTitle><CardDescription>Category: {ticket.category} · Last update {formatDateTime(ticket.lastActivityAt)}</CardDescription></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Patient, organization, payment and conversation details are restricted to Royal Palace support and admin staff.</p><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a concise follow-up or escalation reason. Do not include sensitive information." /><div className="flex gap-2"><Button variant="outline" disabled={busy || !note.trim()} onClick={() => void act("follow_up")}>Send follow-up</Button><Button variant="destructive" disabled={busy || !note.trim()} onClick={() => void act("escalate")}>Escalate</Button></div></CardContent></Card>
  </div>;
}
