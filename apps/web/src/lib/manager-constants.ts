// Manager module — shared constants, labels and pure helpers.
// Centralising statuses/labels here keeps magic strings out of the UI and
// the API layer (plan §8).

import type {
  ManagerApplicationStatus,
  ManagerEarningStatus,
  ManagerEmploymentStatus,
  ManagerPayoutStatus,
  ManagerRelationshipStatus,
  ManagerTicketPriority,
  ManagerTicketStatus,
  ManagerVerificationStatus,
  OrganizationPaymentStatus,
  OrganizationTransactionType,
  PayoutStatus,
} from "@/types";

// --- pagination (plan §8: default 20, cap 100) -----------------------------
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Clamp a client-provided page size into the supported range. */
export function clampPageSize(value: string | number | null | undefined): number {
  const n = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

// --- money / rates ----------------------------------------------------------
export const BPS_PER_HUNDRED_PERCENT = 10_000;

/**
 * The single place where a Manager Earning amount is calculated.
 * Integer math in basis points, rounded exactly once (plan §3.5).
 * `round(eligibleAmount * rateBps / 10000)`
 */
export function calculateEarningAmount(eligibleAmount: number, rateBps: number): number {
  return Math.round((eligibleAmount * rateBps) / BPS_PER_HUNDRED_PERCENT);
}

/** 300 -> 3, 1250 -> 12.5, 10000 -> 100 */
export function rateBpsToPercent(rateBps: number): number {
  return rateBps / BPS_PER_HUNDRED_PERCENT * 100;
}

/** 300 -> "3%", 1250 -> "12.5%" (trailing ".0" trimmed) */
export function formatRateBps(rateBps: number): string {
  const pct = rateBpsToPercent(rateBps);
  const rounded = Math.round(pct * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toString()}%`;
}

// --- idempotency keys (plan §5) ---------------------------------------------
/** Unique per organization payment — guarantees one earning per payment. */
export function earningEventKey(organizationPaymentId: string): string {
  return `orgpay:${organizationPaymentId}:earning`;
}

/** Numbered key so multiple partial refunds each get their own reversal. */
export function reversalEventKey(organizationPaymentId: string, sequence: number): string {
  return `orgpay:${organizationPaymentId}:reversal:${sequence}`;
}

// --- earning lifecycle -------------------------------------------------------
/** Days before a pending earning becomes available for payout. */
export const EARNING_MATURITY_DAYS = 7;

/** The date an earning occurred becomes available for payout. */
export function maturityDate(occurredAt: Date): Date {
  const d = new Date(occurredAt);
  d.setDate(d.getDate() + EARNING_MATURITY_DAYS);
  return d;
}

/** Payment transaction types that can generate Manager Earnings (plan §2). */
export const ELIGIBLE_TRANSACTION_TYPES: OrganizationTransactionType[] = [
  "subscription",
  "renewal",
  "platform_fee",
  "service_fee",
];

// --- payout ------------------------------------------------------------------
export type { PayoutStatus };

// --- display labels (kept in one place; never call this an affiliate system) --
export const MANAGER_ROUTES = {
  dashboard: "dashboard",
  pharmacies: "pharmacies",
  pharmacy: "pharmacy",
  laboratories: "laboratories",
  laboratory: "laboratory",
  onboard: "onboard",
  applications: "applications",
  earnings: "earnings",
  transactions: "transactions",
  payouts: "payouts",
  support: "support",
  ticket: "ticket",
  reports: "reports",
  notifications: "notifications",
  resources: "resources",
  profile: "profile",
  bankDetails: "bank-details",
  settings: "settings",
} as const;

export const MANAGER_TICKET_STATUS_LABELS: Record<ManagerTicketStatus, string> = {
  new: "New",
  assigned_to_manager: "Assigned to Manager",
  manager_investigating: "Manager Investigating",
  waiting_for_organization: "Waiting for Organization",
  escalated_to_royal_palace: "Escalated to Royal Palace",
  royal_palace_investigating: "Royal Palace Investigating",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

export const MANAGER_TICKET_PRIORITY_LABELS: Record<ManagerTicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const APPLICATION_STATUS_LABELS: Record<ManagerApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  information_required: "Information Required",
  approved: "Approved",
  rejected: "Rejected",
};

export const ORGANIZATION_PAYMENT_STATUS_LABELS: Record<OrganizationPaymentStatus, string> = {
  pending: "Pending",
  successful: "Successful",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const TRANSACTION_TYPE_LABELS: Record<OrganizationTransactionType, string> = {
  subscription: "Subscription",
  renewal: "Renewal",
  platform_fee: "Platform Fee",
  service_fee: "Service Fee",
};

export const EARNING_STATUS_LABELS: Record<ManagerEarningStatus, string> = {
  pending: "Pending",
  available: "Available",
  paid: "Paid",
  reversed: "Reversed",
};

export const MANAGER_PAYOUT_STATUS_LABELS: Record<ManagerPayoutStatus, string> = {
  requested: "Requested",
  processing: "Processing",
  paid: "Paid",
  rejected: "Rejected",
};

export const RELATIONSHIP_STATUS_LABELS: Record<ManagerRelationshipStatus, string> = {
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};

export const EMPLOYMENT_STATUS_LABELS: Record<ManagerEmploymentStatus, string> = {
  full_time: "Full Time",
  contract: "Contract",
  probation: "Probation",
  suspended: "Suspended",
  offboarding: "Offboarding",
};

export const MANAGER_VERIFICATION_STATUS_LABELS: Record<ManagerVerificationStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  suspended: "Suspended",
};

/** Statuses that keep an organization visible as an active support target. */
export const OPEN_TICKET_STATUSES: ManagerTicketStatus[] = [
  "new",
  "assigned_to_manager",
  "manager_investigating",
  "waiting_for_organization",
  "escalated_to_royal_palace",
  "royal_palace_investigating",
  "reopened",
];
