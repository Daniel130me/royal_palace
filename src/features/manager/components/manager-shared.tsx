"use client";

// Shared presentational pieces for the Manager Portal. Status → colour
// mappings live here so every page renders statuses identically.

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, FlaskConical, MapPin, Ticket } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  APPLICATION_STATUS_LABELS,
  EARNING_STATUS_LABELS,
  MANAGER_TICKET_STATUS_LABELS,
  MANAGER_PAYOUT_STATUS_LABELS,
  ORGANIZATION_PAYMENT_STATUS_LABELS,
} from "@/lib/manager-constants";
import type { ManagerOrganization } from "@/types";
import { navigate } from "@/lib/nav";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "violet";

const STATUS_TONES: Record<string, Tone> = {
  // applications
  draft: "default", submitted: "info", under_review: "warning", information_required: "warning", approved: "success", rejected: "danger",
  // earnings
  pending: "warning", available: "info", paid: "success", reversed: "danger",
  // organization payments
  successful: "success", failed: "danger", cancelled: "default", refunded: "warning",
  // payouts
  requested: "warning", processing: "info",
  // tickets
  new: "info", assigned_to_manager: "info", manager_investigating: "warning", waiting_for_organization: "warning",
  escalated_to_royal_palace: "danger", royal_palace_investigating: "danger", resolved: "success", closed: "default", reopened: "warning",
};

const TONE_CLASSES: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  info: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
};

/** Consistent status pill for every Manager module status. */
export function ManagerStatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONES[status] ?? "default";
  const allLabels: Record<string, string> = {
    ...APPLICATION_STATUS_LABELS,
    ...EARNING_STATUS_LABELS,
    ...MANAGER_TICKET_STATUS_LABELS,
    ...MANAGER_PAYOUT_STATUS_LABELS,
    ...ORGANIZATION_PAYMENT_STATUS_LABELS,
  };
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium capitalize", TONE_CLASSES[tone])}>
      {label ?? allLabels[status] ?? status.replace(/_/g, " ")}
    </Badge>
  );
}

/** Portfolio row card used by My Pharmacies / My Laboratories (plan §3.3). */
export function OrganizationCard({ org }: { org: ManagerOrganization }) {
  const Icon = org.organizationType === "pharmacy" ? Building2 : FlaskConical;
  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-soft-md hover:border-border"
      onClick={() => navigate("manager", org.organizationType === "pharmacy" ? "pharmacy" : "laboratory", { id: org.id })}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{org.name}</p>
                <p className="text-xs text-muted-foreground">{org.organizationNumber} · <MapPin className="inline h-3 w-3" /> {org.city}, {org.state}</p>
              </div>
              <ManagerStatusBadge status={org.verificationStatus === "approved" ? "approved" : org.verificationStatus} />
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Earnings</p>
                <p className="font-semibold text-sm">{formatCurrency(org.totalEarnings)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last payment</p>
                <p className="font-semibold text-sm truncate">
                  {org.lastPaymentAmount != null ? formatCurrency(org.lastPaymentAmount) : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Assigned</p>
                <p className="font-semibold text-sm">{formatDate(org.dateAssigned)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Open tickets</p>
                <p className="font-semibold text-sm flex items-center gap-1">
                  <Ticket className="h-3.5 w-3.5 text-muted-foreground" /> {org.openTicketCount}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Empty-state nudge with an optional action (reuses healthcare language). */
export function ManagerEmptyState({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">{description}</p>
        {actionLabel && onAction ? (
          <Button size="sm" className="mt-4" onClick={onAction}>{actionLabel}</Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
