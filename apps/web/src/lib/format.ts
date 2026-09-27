// Royal Palace Health Care — formatting & domain helpers

export function formatCurrency(amount: number, currency = "NGN"): string {
  if (currency === "NGN") return `₦${amount.toLocaleString("en-NG")}`;
  return `${currency} ${amount.toLocaleString("en-NG")}`;
}

export function formatDate(input?: string | null): string {
  if (!input) return "—";
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(input?: string | null): string {
  if (!input) return "—";
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(input?: string | null): string {
  if (!input) return "—";
  // Handle "HH:MM" strings (no date)
  if (/^\d{2}:\d{2}$/.test(input)) {
    const [h, m] = input.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12.toString().padStart(2, "0")}:${m} ${ampm}`;
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function relativeDay(input?: string | null): string {
  if (!input) return "—";
  const d = new Date(input.length === 10 ? input + "T00:00:00" : input);
  if (isNaN(d.getTime())) return formatDate(input);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < 0 && diff > -7) return `${Math.abs(diff)} days ago`;
  return formatDate(input);
}

export function age(dateOfBirth?: string | null): number | null {
  if (!dateOfBirth) return null;
  const d = new Date(dateOfBirth);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

export function fullName(p: { firstName: string; lastName: string; title?: string }): string {
  return p.title ? `${p.title} ${p.firstName} ${p.lastName}` : `${p.firstName} ${p.lastName}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function genId(prefix: string): string {
  const n = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  return `${prefix}-${ts}${n}`;
}

// -----------------------------------------------------------------------
// Status transition helpers (centralised — see spec section 75)
// -----------------------------------------------------------------------

const APPOINTMENT_FLOW: Record<string, string[]> = {
  scheduled: ["checked_in", "waiting_for_provider", "in_progress", "completed", "cancelled", "no_show"],
  checked_in: ["waiting_for_provider", "in_progress", "completed", "cancelled", "no_show"],
  waiting_for_provider: ["in_progress", "completed", "cancelled", "no_show"],
  in_progress: ["awaiting_documentation", "completed"],
  awaiting_documentation: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};

const ORDER_FLOW: Record<string, string[]> = {
  paid: ["prescription_under_review", "accepted", "rejected"],
  prescription_under_review: ["accepted", "clarification_required", "rejected", "partially_available"],
  clarification_required: ["accepted", "rejected"],
  accepted: ["preparing"],
  partially_available: ["preparing"],
  rejected: [],
  preparing: ["ready_for_pickup"],
  ready_for_pickup: ["picked_up"],
  picked_up: ["in_transit"],
  in_transit: ["delivered"],
  delivered: [],
  cancelled: [],
  refunded: [],
};

const DELIVERY_FLOW: Record<string, string[]> = {
  assigned: ["accepted", "cancelled"],
  accepted: ["heading_to_pickup", "cancelled"],
  heading_to_pickup: ["arrived_at_pickup"],
  arrived_at_pickup: ["pickup_verified"],
  pickup_verified: ["picked_up"],
  picked_up: ["in_transit"],
  in_transit: ["arrived_at_destination"],
  arrived_at_destination: ["delivered", "failed"],
  delivered: [],
  failed: ["returned"],
  returned: [],
  cancelled: [],
};

const LAB_FLOW: Record<string, string[]> = {
  pending_booking: ["booked", "cancelled"],
  booked: ["sample_collected", "cancelled"],
  sample_collected: ["processing"],
  processing: ["quality_review"],
  quality_review: ["completed"],
  completed: [],
  cancelled: [],
};

export function canTransition(
  flow: Record<string, string[]>,
  from: string,
  to: string
): boolean {
  return (flow[from] ?? []).includes(to);
}

export const canTransitionAppointment = (from: string, to: string) =>
  canTransition(APPOINTMENT_FLOW, from, to);
export const canTransitionOrder = (from: string, to: string) =>
  canTransition(ORDER_FLOW, from, to);
export const canTransitionDelivery = (from: string, to: string) =>
  canTransition(DELIVERY_FLOW, from, to);
export const canTransitionLab = (from: string, to: string) =>
  canTransition(LAB_FLOW, from, to);

export const APPOINTMENT_STATUSES = Object.keys(APPOINTMENT_FLOW);
export const ORDER_STATUSES = Object.keys(ORDER_FLOW);
export const DELIVERY_STATUSES = Object.keys(DELIVERY_FLOW);
export const LAB_STATUSES = Object.keys(LAB_FLOW);

export function nextStatuses(flow: Record<string, string[]>, current: string): string[] {
  return flow[current] ?? [];
}
export const nextAppointmentStatuses = (s: string) => nextStatuses(APPOINTMENT_FLOW, s);
export const nextOrderStatuses = (s: string) => nextStatuses(ORDER_FLOW, s);
export const nextDeliveryStatuses = (s: string) => nextStatuses(DELIVERY_FLOW, s);
export const nextLabStatuses = (s: string) => nextStatuses(LAB_FLOW, s);
