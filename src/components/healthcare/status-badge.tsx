"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<string, string> = {
  // generic positive
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  fulfilled: "bg-emerald-100 text-emerald-700 border-emerald-200",
  published: "bg-emerald-100 text-emerald-700 border-emerald-200",
  successful: "bg-emerald-100 text-emerald-700 border-emerald-200",
  granted: "bg-emerald-100 text-emerald-700 border-emerald-200",

  // in-progress / info
  scheduled: "bg-sky-100 text-sky-700 border-sky-200",
  checked_in: "bg-sky-100 text-sky-700 border-sky-200",
  waiting_for_provider: "bg-sky-100 text-sky-700 border-sky-200",
  in_progress: "bg-sky-100 text-sky-700 border-sky-200",
  issued: "bg-sky-100 text-sky-700 border-sky-200",
  awaiting_pharmacy: "bg-sky-100 text-sky-700 border-sky-200",
  pending_booking: "bg-amber-100 text-amber-700 border-amber-200",
  booked: "bg-sky-100 text-sky-700 border-sky-200",
  sample_collected: "bg-sky-100 text-sky-700 border-sky-200",
  processing: "bg-sky-100 text-sky-700 border-sky-200",
  quality_review: "bg-sky-100 text-sky-700 border-sky-200",
  accepted: "bg-sky-100 text-sky-700 border-sky-200",
  preparing: "bg-sky-100 text-sky-700 border-sky-200",
  ready_for_pickup: "bg-sky-100 text-sky-700 border-sky-200",
  picked_up: "bg-sky-100 text-sky-700 border-sky-200",
  in_transit: "bg-sky-100 text-sky-700 border-sky-200",
  assigned: "bg-amber-100 text-amber-700 border-amber-200",
  heading_to_pickup: "bg-sky-100 text-sky-700 border-sky-200",
  arrived_at_pickup: "bg-sky-100 text-sky-700 border-sky-200",
  pickup_verified: "bg-sky-100 text-sky-700 border-sky-200",
  arrived_at_destination: "bg-sky-100 text-sky-700 border-sky-200",
  sent: "bg-sky-100 text-sky-700 border-sky-200",
  received: "bg-sky-100 text-sky-700 border-sky-200",
  submitted: "bg-sky-100 text-sky-700 border-sky-200",
  under_review: "bg-amber-100 text-amber-700 border-amber-200",
  additional_information_requested: "bg-amber-100 text-amber-700 border-amber-200",
  requires_clarification: "bg-amber-100 text-amber-700 border-amber-200",
  clarification_required: "bg-amber-100 text-amber-700 border-amber-200",
  awaiting_documentation: "bg-amber-100 text-amber-700 border-amber-200",
  open: "bg-sky-100 text-sky-700 border-sky-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  draft: "bg-muted text-muted-foreground border-border",

  // negative
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
  suspended: "bg-rose-100 text-rose-700 border-rose-200",
  expired: "bg-rose-100 text-rose-700 border-rose-200",
  revoked: "bg-rose-100 text-rose-700 border-rose-200",
  declined: "bg-rose-100 text-rose-700 border-rose-200",
  no_show: "bg-rose-100 text-rose-700 border-rose-200",
  refunded: "bg-rose-100 text-rose-700 border-rose-200",
  returned: "bg-rose-100 text-rose-700 border-rose-200",

  // clinical
  partially_fulfilled: "bg-violet-100 text-violet-700 border-violet-200",
  partially_available: "bg-violet-100 text-violet-700 border-violet-200",
  in_progress_referral: "bg-sky-100 text-sky-700 border-sky-200",

  // results
  high: "bg-rose-100 text-rose-700 border-rose-200",
  low: "bg-amber-100 text-amber-700 border-amber-200",
  critical: "bg-rose-100 text-rose-700 border-rose-200",
  normal: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const LABELS: Record<string, string> = {
  in_progress: "In Progress",
  checked_in: "Checked In",
  waiting_for_provider: "Waiting",
  awaiting_documentation: "Awaiting Docs",
  no_show: "No-Show",
  pending_booking: "Pending Booking",
  prescription_under_review: "Under Review",
  clarification_required: "Clarification Needed",
  additional_information_requested: "Info Requested",
  ready_for_pickup: "Ready for Pickup",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  heading_to_pickup: "Heading to Pickup",
  arrived_at_pickup: "At Pickup",
  pickup_verified: "Pickup Verified",
  arrived_at_destination: "At Destination",
  partially_fulfilled: "Partially Fulfilled",
  partially_available: "Partially Available",
  awaiting_pharmacy: "Awaiting Pharmacy",
  requires_clarification: "Needs Clarification",
};

function humanise(s: string): string {
  return LABELS[s] ?? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={cn("font-medium capitalize border", cls, className)}>
      {humanise(status)}
    </Badge>
  );
}
