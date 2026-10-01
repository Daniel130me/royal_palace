"use client";

import type { ManagerTicketResponse } from "@royal-palace/contracts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingState, PageHeader } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { managerPortalService } from "@/lib/services";

import { ManagerStatusBadge } from "../components/manager-shared";

export function ManagerTicketDetail() {
  const id = useNav().view.params.id;
  const [ticket, setTicket] = useState<ManagerTicketResponse | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    if (id === undefined) return;
    void managerPortalService
      .ticket(id)
      .then(setTicket)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Ticket could not be loaded."),
      );
  }, [id]);
  useEffect(load, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (ticket === null) return <LoadingState label="Loading ticket reference…" />;
  async function followUp() {
    if (id === undefined || note.trim().length === 0) return;
    setBusy(true);
    try {
      setTicket(await managerPortalService.addTicketFollowUp(id, note.trim()));
      setNote("");
      toast.success("Follow-up sent.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Follow-up could not be sent.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader
        back
        description="Privacy-limited support follow-up"
        title={ticket.ticketNumber}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between">
            {ticket.subjectDisplayName}
            <ManagerStatusBadge status={ticket.status} />
          </CardTitle>
          <CardDescription>
            {ticket.category} · Updated {formatDateTime(ticket.updatedAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Do not include clinical, payment, or other sensitive information. Internal support notes
            are never visible here.
          </p>
          <div className="space-y-2">
            {ticket.followUps.map((item) => (
              <div className="rounded-lg border p-3 text-sm" key={item.id}>
                <p>{item.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(item.createdAt)}
                </p>
              </div>
            ))}
          </div>
          <Textarea
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a concise, non-sensitive follow-up."
            value={note}
          />
          <Button
            disabled={busy || note.trim().length === 0 || ticket.status === "CLOSED"}
            onClick={() => void followUp()}
          >
            Send follow-up
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
