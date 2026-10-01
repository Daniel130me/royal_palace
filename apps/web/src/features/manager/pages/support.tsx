"use client";

import type { ManagerTicketResponse } from "@royal-palace/contracts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingState, PageHeader } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { managerPortalService } from "@/lib/services";

import { ManagerStatusBadge } from "../components/manager-shared";

export function ManagerSupport() {
  const [tickets, setTickets] = useState<ManagerTicketResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjectDisplayName, setSubjectDisplayName] = useState("");
  const [subjectReference, setSubjectReference] = useState("");
  const [category, setCategory] = useState<
    "ONBOARDING" | "ACCOUNT" | "TECHNICAL" | "SERVICE" | "OTHER"
  >("ONBOARDING");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    void managerPortalService
      .tickets({ limit: 50 })
      .then((result) => setTickets(result.data))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Tickets could not be loaded."),
      );
  }, []);
  useEffect(load, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (tickets === null) return <LoadingState label="Loading ticket references…" />;
  async function createTicket() {
    setBusy(true);
    try {
      await managerPortalService.createTicket({
        category,
        subjectDisplayName: subjectDisplayName.trim(),
        ...(subjectReference.trim() ? { subjectReference: subjectReference.trim() } : {}),
      });
      setSubjectDisplayName("");
      setSubjectReference("");
      toast.success("Ticket escalated to Royal Palace support.");
      load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Ticket could not be created.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader
        description="This queue contains only the ticket reference, minimal identifying details, category, status, and safe follow-up."
        title="Support follow-up"
      />
      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <Input
            aria-label="Display name"
            onChange={(event) => setSubjectDisplayName(event.target.value)}
            placeholder="Display name"
            value={subjectDisplayName}
          />
          <Input
            aria-label="Reference"
            onChange={(event) => setSubjectReference(event.target.value)}
            placeholder="Reference (optional)"
            value={subjectReference}
          />
          <select
            aria-label="Category"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            onChange={(event) => setCategory(event.target.value as typeof category)}
            value={category}
          >
            <option value="ONBOARDING">Onboarding</option>
            <option value="ACCOUNT">Account</option>
            <option value="TECHNICAL">Technical</option>
            <option value="SERVICE">Service</option>
            <option value="OTHER">Other</option>
          </select>
          <Button
            disabled={busy || subjectDisplayName.trim().length === 0}
            onClick={() => void createTicket()}
          >
            Escalate ticket
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          {tickets.map((ticket) => (
            <button
              className="grid w-full gap-2 border-b p-4 text-left hover:bg-muted/40 sm:grid-cols-[1fr_1fr_auto]"
              key={ticket.id}
              onClick={() => navigate("manager", "ticket", { id: ticket.id })}
            >
              <div>
                <p className="font-semibold">{ticket.ticketNumber}</p>
                <p className="text-xs text-muted-foreground">{ticket.subjectDisplayName}</p>
              </div>
              <div>
                <p className="text-sm">{ticket.category}</p>
                <p className="text-xs text-muted-foreground">
                  Updated {formatDateTime(ticket.updatedAt)}
                </p>
              </div>
              <ManagerStatusBadge status={ticket.status} />
            </button>
          ))}
          {tickets.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No support tickets yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
