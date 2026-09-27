"use client";

import type { Delivery, DeliveryStatus } from "@/types";
import { formatCurrency, formatDate, formatDateTime, relativeDay } from "@/lib/format";

// ---------------------------------------------------------------------------
// PRIVACY BOUNDARY
// ---------------------------------------------------------------------------
// Logistics providers are NOT authorised to see patient clinical, diagnosis,
// laboratory, or detailed patient history information. The helpers below only
// surface delivery-relevant fields. Even when a Delivery object's nested
// `order` relation contains a PharmacyOrder with patient/prescription data,
// we deliberately DO NOT read those fields from the UI.
// ---------------------------------------------------------------------------

export const DELIVERY_TIMELINE: { status: DeliveryStatus; label: string; hint: string }[] = [
  { status: "assigned", label: "Assigned", hint: "Awaiting your acceptance" },
  { status: "accepted", label: "Accepted", hint: "You acknowledged the assignment" },
  { status: "heading_to_pickup", label: "Heading to Pickup", hint: "En route to pickup location" },
  { status: "arrived_at_pickup", label: "Arrived at Pickup", hint: "You reached the pickup point" },
  { status: "pickup_verified", label: "Pickup Verified", hint: "Package handed over & verified" },
  { status: "picked_up", label: "Picked Up", hint: "Package loaded onto your vehicle" },
  { status: "in_transit", label: "In Transit", hint: "On the way to destination" },
  { status: "arrived_at_destination", label: "Arrived at Destination", hint: "At recipient location" },
  { status: "delivered", label: "Delivered", hint: "Handed over with verification code" },
];

// Map each status → button label & next status. The "delivered" step needs
// the verification code dialog.
export const NEXT_ACTION: Partial<
  Record<DeliveryStatus, { label: string; to: DeliveryStatus; needsCode?: boolean }>
> = {
  assigned: { label: "Accept Assignment", to: "accepted" },
  accepted: { label: "Heading to Pickup", to: "heading_to_pickup" },
  heading_to_pickup: { label: "I've Arrived at Pickup", to: "arrived_at_pickup" },
  arrived_at_pickup: { label: "Confirm Pickup Verified", to: "pickup_verified" },
  pickup_verified: { label: "Mark Picked Up", to: "picked_up" },
  picked_up: { label: "Start Transit", to: "in_transit" },
  in_transit: { label: "Arrived at Destination", to: "arrived_at_destination" },
  arrived_at_destination: { label: "Confirm Delivery", to: "delivered", needsCode: true },
};

// Quick-action labels used on the dashboard card (shorter).
export const QUICK_ACTION: Partial<Record<DeliveryStatus, { label: string; to: DeliveryStatus }>> = {
  assigned: { label: "Accept", to: "accepted" },
  heading_to_pickup: { label: "I've Arrived", to: "arrived_at_pickup" },
  arrived_at_pickup: { label: "Confirm Pickup", to: "pickup_verified" },
};

// ETA helper — we don't have explicit ETAs in the model, so derive an indicative
// window from the delivery's createdAt + a typical SLA window. This is a
// display-only estimate for the logistics operator's dashboard.
export function estimatedEta(delivery: Delivery): { label: string; overdue: boolean } {
  if (!delivery.createdAt) return { label: "—", overdue: false };
  if (delivery.status === "delivered" || delivery.status === "cancelled" || delivery.status === "returned" || delivery.status === "failed") {
    return { label: "—", overdue: false };
  }
  const created = new Date(delivery.createdAt).getTime();
  // 4-hour SLA window per assignment (synthetic prototype value).
  const eta = new Date(created + 4 * 60 * 60 * 1000);
  const now = Date.now();
  const overdue = eta.getTime() < now;
  return {
    label: `${formatDateTime(eta.toISOString())} (${relativeDay(eta.toISOString())})`,
    overdue,
  };
}

// Mask a verification code for display. The driver should ask the recipient
// for the code at delivery time and enter what they hear — they should not
// see the code on their screen beforehand.
export function maskVerificationCode(code: string): string {
  if (!code) return "—";
  if (code.length <= 2) return "••";
  return "•".repeat(Math.max(4, code.length));
}

// Sum payouts of deliveries completed (delivered) within the given date window.
export function sumPayouts(deliveries: Delivery[], predicate: (d: Delivery) => boolean): number {
  return deliveries.filter(predicate).reduce((acc, d) => acc + (d.payout || 0), 0);
}

export function isDeliveredToday(d: Delivery): boolean {
  if (d.status !== "delivered") return false;
  const stamp = d.updatedAt ?? d.createdAt;
  if (!stamp) return false;
  const dt = new Date(stamp);
  const today = new Date();
  return dt.toDateString() === today.toDateString();
}

export function isDeliveredThisWeek(d: Delivery): boolean {
  if (d.status !== "delivered") return false;
  const stamp = d.updatedAt ?? d.createdAt;
  if (!stamp) return false;
  const dt = new Date(stamp);
  const now = new Date();
  // ISO week (Mon-Sun). Subtract day-of-week offset.
  const day = now.getDay(); // 0 = Sun
  const offset = day === 0 ? 6 : day - 1; // Monday = 0
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offset);
  return dt.getTime() >= start.getTime();
}

export { formatCurrency, formatDate, formatDateTime, relativeDay };
