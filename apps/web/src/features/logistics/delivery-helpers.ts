"use client";

import { formatDate, formatDateTime, relativeDay } from "@/lib/format";

import type {
  LogisticsDelivery,
  LogisticsDeliveryStatus,
  MutableLogisticsDeliveryStatus,
} from "./logistics-types";

export const DELIVERY_TIMELINE: {
  status: LogisticsDeliveryStatus;
  label: string;
  hint: string;
}[] = [
  { status: "ASSIGNED", label: "Assigned", hint: "Awaiting courier acceptance" },
  { status: "ACCEPTED", label: "Accepted", hint: "The assignment was acknowledged" },
  { status: "HEADING_TO_PICKUP", label: "Heading to Pickup", hint: "En route to pickup" },
  { status: "ARRIVED_AT_PICKUP", label: "Arrived at Pickup", hint: "Courier reached pickup" },
  { status: "PICKUP_VERIFIED", label: "Pickup Verified", hint: "Handoff verified" },
  { status: "PICKED_UP", label: "Picked Up", hint: "Package collected" },
  { status: "IN_TRANSIT", label: "In Transit", hint: "En route to recipient" },
  {
    status: "ARRIVED_AT_DESTINATION",
    label: "Arrived at Destination",
    hint: "Courier reached destination",
  },
  { status: "DELIVERED", label: "Delivered", hint: "Recipient code verified" },
];

export const NEXT_ACTION: Partial<
  Record<
    LogisticsDeliveryStatus,
    { label: string; to: MutableLogisticsDeliveryStatus | "DELIVERED"; needsCode?: boolean }
  >
> = {
  ASSIGNED: { label: "Accept Assignment", to: "ACCEPTED" },
  ACCEPTED: { label: "Heading to Pickup", to: "HEADING_TO_PICKUP" },
  HEADING_TO_PICKUP: { label: "I've Arrived at Pickup", to: "ARRIVED_AT_PICKUP" },
  ARRIVED_AT_PICKUP: { label: "Confirm Pickup Verified", to: "PICKUP_VERIFIED" },
  PICKUP_VERIFIED: { label: "Mark Picked Up", to: "PICKED_UP" },
  PICKED_UP: { label: "Start Transit", to: "IN_TRANSIT" },
  IN_TRANSIT: { label: "Arrived at Destination", to: "ARRIVED_AT_DESTINATION" },
  ARRIVED_AT_DESTINATION: { label: "Confirm Delivery", to: "DELIVERED", needsCode: true },
};

export const QUICK_ACTION: Partial<
  Record<LogisticsDeliveryStatus, { label: string; to: MutableLogisticsDeliveryStatus }>
> = {
  ASSIGNED: { label: "Accept", to: "ACCEPTED" },
  ACCEPTED: { label: "Head to pickup", to: "HEADING_TO_PICKUP" },
  HEADING_TO_PICKUP: { label: "I've Arrived", to: "ARRIVED_AT_PICKUP" },
  ARRIVED_AT_PICKUP: { label: "Confirm Pickup", to: "PICKUP_VERIFIED" },
  PICKUP_VERIFIED: { label: "Mark Picked Up", to: "PICKED_UP" },
  PICKED_UP: { label: "Start Transit", to: "IN_TRANSIT" },
  IN_TRANSIT: { label: "Arrived", to: "ARRIVED_AT_DESTINATION" },
};

export function formatAddress(address: LogisticsDelivery["deliveryAddress"]): string {
  return [
    address.addressLine1,
    address.addressLine2,
    address.locality,
    address.administrativeArea,
    address.postalCode,
    address.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
}

export function statusForBadge(status: LogisticsDeliveryStatus): string {
  return status.toLowerCase();
}

export { formatDate, formatDateTime, relativeDay };
