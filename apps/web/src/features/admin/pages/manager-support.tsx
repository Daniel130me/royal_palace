"use client";

import type { SupportManagerTicketResponse } from "@royal-palace/contracts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingState, PageHeader } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { managerProgramService } from "@/lib/services";
import { ManagerStatusBadge } from "@/features/manager/components/manager-shared";

export function AdminManagerSupport() {
  const [items, setItems] = useState<SupportManagerTicketResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    void managerProgramService
      .supportTickets({ limit: 50 })
      .then((result) => setItems(result.data))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Support queue could not be loaded."),
      );
  }, []);
  useEffect(load, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (items === null) return <LoadingState label="Loading manager support queue…" />;
  async function transition(
    ticket: SupportManagerTicketResponse,
    status: "IN_REVIEW" | "WAITING_MANAGER" | "RESOLVED" | "CLOSED",
  ) {
    try {
      await managerProgramService.reviewTicket(ticket.id, {
        expectedVersion: ticket.version,
        status,
      });
      toast.success("Ticket updated.");
      load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Ticket could not be updated.");
    }
  }
  return (
    <div>
      <PageHeader
        description="Minimal identifying details are shown. Internal notes remain hidden from managers; clinical and payment data are not part of this workflow."
        title="Manager support queue"
      />
      <Card>
        <CardContent className="p-0">
          {items.map((ticket) => (
            <div className="space-y-2 border-b p-4 last:border-0" key={ticket.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {ticket.ticketNumber} · {ticket.subjectDisplayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ticket.category} · updated {formatDateTime(ticket.updatedAt)}
                  </p>
                </div>
                <ManagerStatusBadge status={ticket.status} />
              </div>
              <div className="flex flex-wrap gap-2">
                {ticket.status === "ESCALATED" || ticket.status === "WAITING_MANAGER" ? (
                  <Button onClick={() => void transition(ticket, "IN_REVIEW")} size="sm">
                    Start review
                  </Button>
                ) : null}
                {ticket.status === "IN_REVIEW" ? (
                  <>
                    <Button
                      onClick={() => void transition(ticket, "WAITING_MANAGER")}
                      size="sm"
                      variant="outline"
                    >
                      Await manager
                    </Button>
                    <Button onClick={() => void transition(ticket, "RESOLVED")} size="sm">
                      Resolve
                    </Button>
                  </>
                ) : null}
                {ticket.status === "WAITING_MANAGER" ? (
                  <Button onClick={() => void transition(ticket, "RESOLVED")} size="sm">
                    Resolve
                  </Button>
                ) : null}
                {ticket.status === "RESOLVED" ? (
                  <Button
                    onClick={() => void transition(ticket, "CLOSED")}
                    size="sm"
                    variant="outline"
                  >
                    Close
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No manager escalations.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
