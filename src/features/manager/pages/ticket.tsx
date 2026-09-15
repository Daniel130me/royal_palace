"use client";

// Ticket detail (plan §3.7): shared timeline + manager-only notes and the
// Level-1 action set (reply, note, request info, resolve, escalate).
// admin_internal notes never reach this page — filtered server-side.

import { useCallback, useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { ApiError } from "@/lib/api-client";
import { useNav } from "@/lib/nav";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ManagerStatusBadge } from "../components/manager-shared";
import { formatDateTime } from "@/lib/format";
import { MANAGER_TICKET_PRIORITY_LABELS, MANAGER_TICKET_STATUS_LABELS } from "@/lib/manager-constants";
import { Building2, FlaskConical, ShieldAlert, Lock, Send, Undo2, MessageSquarePlus, TicketCheck } from "lucide-react";
import { toast } from "sonner";
import type { SupportTicket, SupportTicketMessage } from "@/types";

const ESCALATION_DEPARTMENTS = ["Finance", "Technical", "Operations", "Compliance"] as const;

type ActionKind = "reply" | "note" | "request_info" | "resolve" | "escalate";

const ACTION_META: Record<ActionKind, { label: string; description: string; buttonLabel: string; destructive?: boolean }> = {
  reply: { label: "Reply to organization", description: "Your reply is visible to the organization.", buttonLabel: "Send reply" },
  note: { label: "Add manager-only note", description: "Working notes are never shown to the organization.", buttonLabel: "Save note" },
  request_info: { label: "Request information", description: "The organization will be asked to provide the details you need. Status moves to waiting.", buttonLabel: "Request information" },
  resolve: { label: "Resolve ticket", description: "Provide a short resolution summary — it is shared with the organization.", buttonLabel: "Resolve ticket" },
  escalate: { label: "Escalate to Royal Palace", description: "Escalation requires a reason and a department. Royal Palace takes over as Level 2.", buttonLabel: "Escalate", destructive: true },
};

export function ManagerTicketDetail() {
  const { view } = useNav();
  const id = view.params.id;
  const [ticket, setTicket] = useState<(SupportTicket & { messages: SupportTicketMessage[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ActionKind | null>(null);
  const [message, setMessage] = useState("");
  const [resolution, setResolution] = useState("");
  const [department, setDepartment] = useState<string>("Finance");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setTicket(await managerService.ticket(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ticket.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction() {
    if (!ticket || !dialog) return;
    setSubmitting(true);
    try {
      await managerService.updateTicket({
        ticketId: ticket.id,
        action: dialog,
        message: message || undefined,
        resolution: resolution || undefined,
        department: dialog === "escalate" ? department : undefined,
      });
      toast.success(ACTION_META[dialog].buttonLabel + " — done.");
      setDialog(null);
      setMessage("");
      setResolution("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !ticket) return <LoadingState label="Loading ticket…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!ticket) return null;

  const Icon = ticket.organizationType === "pharmacy" ? Building2 : FlaskConical;
  const closed = ticket.status === "closed";
  const OrgIcon = Icon;

  return (
    <div>
      <PageHeader title={ticket.ticketNumber} description={ticket.subject} back />

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        {/* Timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><MessageSquarePlus className="h-4 w-4 text-primary" /> Conversation</CardTitle>
            <CardDescription>Shared messages and your working notes. Admin-internal notes are not visible here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ticket.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              ticket.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl border p-3 ${m.visibility === "manager_internal" ? "border-amber-200 bg-amber-50/50 border-l-4 border-l-amber-400" : "border-border/60"}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{m.actorName}</p>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{m.actorRole}</span>
                    {m.visibility === "manager_internal" ? (
                      <span className="text-[11px] text-amber-700 flex items-center gap-1"><Lock className="h-3 w-3" /> Manager-only note</span>
                    ) : null}
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{m.body}</p>
                  <p className="text-[11px] text-muted-foreground mt-1.5">{formatDateTime(m.createdAt)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Meta + actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><OrgIcon className="h-4 w-4 text-primary" /> {ticket.organizationName}</CardTitle>
              <CardDescription className="capitalize">{ticket.organizationType} · created by {ticket.creatorName}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Status</span><ManagerStatusBadge status={ticket.status} label={MANAGER_TICKET_STATUS_LABELS[ticket.status as keyof typeof MANAGER_TICKET_STATUS_LABELS]} /></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Priority</span><span className="font-medium">{MANAGER_TICKET_PRIORITY_LABELS[ticket.priority as keyof typeof MANAGER_TICKET_PRIORITY_LABELS]}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Category</span><span className="font-medium capitalize">{ticket.category}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium">{formatDateTime(ticket.createdAt)}</span></div>
              {ticket.escalationDepartment ? (
                <>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Escalated to</span><span className="font-medium">{ticket.escalationDepartment}</span></div>
                  <p className="text-xs text-muted-foreground border-l-2 border-rose-300 pl-2">{ticket.escalationReason}</p>
                </>
              ) : null}
              {ticket.resolution ? (
                <p className="text-xs text-muted-foreground border-l-2 border-emerald-300 pl-2"><strong className="text-foreground">Resolution:</strong> {ticket.resolution}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /> Manager actions</CardTitle>
              <CardDescription>{closed ? "This ticket is closed." : "Resolve what you can — escalate with a reason when you cannot."}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button size="sm" variant="outline" disabled={closed} onClick={() => { setMessage(""); setDialog("reply"); }}><Send className="h-4 w-4" /> Reply</Button>
              <Button size="sm" variant="outline" disabled={closed} onClick={() => { setMessage(""); setDialog("note"); }}><Lock className="h-4 w-4" /> Manager note</Button>
              <Button size="sm" variant="outline" disabled={closed} onClick={() => { setMessage(""); setDialog("request_info"); }}><MessageSquarePlus className="h-4 w-4" /> Request information</Button>
              <Button size="sm" variant="outline" disabled={closed || ticket.status === "resolved"} onClick={() => { setMessage(""); setResolution(""); setDialog("resolve"); }}><TicketCheck className="h-4 w-4" /> Resolve</Button>
              <Button size="sm" variant="destructive" disabled={closed || ticket.status.startsWith("escalated") || ticket.status.startsWith("royal_palace")} onClick={() => { setMessage(""); setDialog("escalate"); }}><Undo2 className="h-4 w-4" /> Escalate to Royal Palace</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          {dialog ? (
            <>
              <DialogHeader>
                <DialogTitle>{ACTION_META[dialog].label}</DialogTitle>
                <DialogDescription>{ACTION_META[dialog].description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {dialog !== "resolve" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="ticket-message">{dialog === "escalate" ? "Escalation reason (required)" : "Message"}</Label>
                    <Textarea id="ticket-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={dialog === "escalate" ? "Why does this need Royal Palace?" : "Write your message…"} />
                  </div>
                ) : null}
                {dialog === "resolve" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="ticket-resolution">Resolution summary (required)</Label>
                    <Textarea id="ticket-resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} placeholder="How was this resolved?" />
                  </div>
                ) : null}
                {dialog === "escalate" ? (
                  <div className="space-y-1.5">
                    <Label>Department</Label>
                    <Select value={department} onValueChange={setDepartment}>
                      <SelectTrigger aria-label="Escalation department"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ESCALATION_DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
                <Button
                  variant={ACTION_META[dialog].destructive ? "destructive" : "default"}
                  onClick={() => void runAction()}
                  disabled={submitting || (dialog === "resolve" ? !resolution.trim() : !message.trim())}
                >
                  {submitting ? "Working…" : ACTION_META[dialog].buttonLabel}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
