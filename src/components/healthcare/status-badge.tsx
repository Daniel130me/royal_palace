"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<string, string> = {
  // generic positive
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  fulfilled: "bg-emerald-50 text-emerald-700 border-emerald-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  successful: "bg-emerald-50 text-emerald-700 border-emerald-200",
  granted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  result_published: "bg-emerald-50 text-emerald-700 border-emerald-200",

  // in-progress / info
  scheduled: "bg-sky-50 text-sky-700 border-sky-200",
  checked_in: "bg-sky-50 text-sky-700 border-sky-200",
  waiting_for_provider: "bg-sky-50 text-sky-700 border-sky-200",
  in_progress: "bg-sky-50 text-sky-700 border-sky-200",
  issued: "bg-sky-50 text-sky-700 border-sky-200",
  awaiting_pharmacy: "bg-sky-50 text-sky-700 border-sky-200",
  booked: "bg-sky-50 text-sky-700 border-sky-200",
  sample_collected: "bg-sky-50 text-sky-700 border-sky-200",
  processing: "bg-sky-50 text-sky-700 border-sky-200",
  quality_review: "bg-sky-50 text-sky-700 border-sky-200",
  accepted: "bg-sky-50 text-sky-700 border-sky-200",
  preparing: "bg-sky-50 text-sky-700 border-sky-200",
  ready_for_pickup: "bg-sky-50 text-sky-700 border-sky-200",
  picked_up: "bg-sky-50 text-sky-700 border-sky-200",
  in_transit: "bg-sky-50 text-sky-700 border-sky-200",
  heading_to_pickup: "bg-sky-50 text-sky-700 border-sky-200",
  arrived_at_pickup: "bg-sky-50 text-sky-700 border-sky-200",
  pickup_verified: "bg-sky-50 text-sky-700 border-sky-200",
  arrived_at_destination: "bg-sky-50 text-sky-700 border-sky-200",
  sent: "bg-sky-50 text-sky-700 border-sky-200",
  received: "bg-sky-50 text-sky-700 border-sky-200",
  submitted: "bg-sky-50 text-sky-700 border-sky-200",
  open: "bg-sky-50 text-sky-700 border-sky-200",
  booking_accepted: "bg-sky-50 text-sky-700 border-sky-200",

  // warning
  pending_booking: "bg-amber-50 text-amber-700 border-amber-200",
  under_review: "bg-amber-50 text-amber-700 border-amber-200",
  additional_information_requested: "bg-amber-50 text-amber-700 border-amber-200",
  requires_clarification: "bg-amber-50 text-amber-700 border-amber-200",
  clarification_required: "bg-amber-50 text-amber-700 border-amber-200",
  awaiting_documentation: "bg-amber-50 text-amber-700 border-amber-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  assigned: "bg-amber-50 text-amber-700 border-amber-200",
  partially_fulfilled: "bg-violet-50 text-violet-700 border-violet-200",
  partially_available: "bg-violet-50 text-violet-700 border-violet-200",
  prescription_under_review: "bg-amber-50 text-amber-700 border-amber-200",

  // negative
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  suspended: "bg-rose-50 text-rose-700 border-rose-200",
  expired: "bg-rose-50 text-rose-700 border-rose-200",
  revoked: "bg-rose-50 text-rose-700 border-rose-200",
  declined: "bg-rose-50 text-rose-700 border-rose-200",
  no_show: "bg-rose-50 text-rose-700 border-rose-200",
  refunded: "bg-rose-50 text-rose-700 border-rose-200",
  returned: "bg-rose-50 text-rose-700 border-rose-200",

  // clinical
  high: "bg-rose-50 text-rose-700 border-rose-200",
  low: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
  normal: "bg-emerald-50 text-emerald-700 border-emerald-200",

  draft: "bg-muted text-muted-foreground border-border",
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
  heading_to_pickup: "To Pickup",
  arrived_at_pickup: "At Pickup",
  pickup_verified: "Pickup ✓",
  arrived_at_destination: "At Destination",
  partially_fulfilled: "Partial",
  partially_available: "Partial",
  awaiting_pharmacy: "Awaiting Pharmacy",
  requires_clarification: "Needs Clarification",
  result_published: "Published",
  booking_accepted: "Accepted",
};

function humanise(s: string): string {
  return LABELS[s] ?? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status, className, size = "default" }: { status: string; className?: string; size?: "default" | "sm" }) {
  const cls = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border capitalize whitespace-nowrap",
        cls,
        size === "sm" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-[11px]",
        className
      )}
    >
      {humanise(status)}
    </Badge>
  );
}
