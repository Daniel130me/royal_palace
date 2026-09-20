// Manager access control + privacy DTOs (plan §9).
//
// Security model:
// - The client sends its simulated session via the `x-rp-session` header.
// - The manager identity is ALWAYS derived from that session server-side;
//   a managerId from the request body is never trusted.
// - Organization detail responses are built through explicit Prisma `select`
//   allowlists, so patient/clinical fields cannot leak even by accident.
//   Hiding fields in React is not sufficient for a healthcare app.

import { db } from "@/lib/db";
import type { Manager, Prisma } from "@prisma/client";

export class ManagerAccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "ManagerAccessError";
    this.status = status;
  }
}

interface SessionPayload {
  userId?: string;
  role?: string;
  profileId?: string;
}

export interface ManagerContext {
  userId: string;
  manager: Manager;
}

/**
 * Resolve the calling manager from the simulated session header.
 * Throws ManagerAccessError for missing/invalid sessions or non-managers.
 */
export async function getManagerContext(req: Request): Promise<ManagerContext> {
  const raw = req.headers.get("x-rp-session");
  if (!raw) {
    throw new ManagerAccessError("Missing session.", 401);
  }

  let session: SessionPayload;
  try {
    session = JSON.parse(raw) as SessionPayload;
  } catch {
    throw new ManagerAccessError("Invalid session.", 401);
  }

  if (!session.userId || session.role !== "manager") {
    throw new ManagerAccessError("Manager access required.", 403);
  }

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "active") {
    throw new ManagerAccessError("Account is not active.", 403);
  }

  const manager = await db.manager.findUnique({ where: { userId: user.id } });
  if (!manager) {
    throw new ManagerAccessError("Manager profile not found.", 403);
  }
  if (manager.employmentStatus === "suspended" || manager.verificationStatus === "suspended") {
    throw new ManagerAccessError("Manager account is suspended.", 403);
  }

  return { userId: user.id, manager };
}

/** Resolve an admin caller from the session header (for admin-only actions). */
export async function getAdminContext(req: Request): Promise<{ userId: string; profileId?: string }> {
  const raw = req.headers.get("x-rp-session");
  if (!raw) throw new ManagerAccessError("Missing session.", 401);
  let session: SessionPayload;
  try {
    session = JSON.parse(raw) as SessionPayload;
  } catch {
    throw new ManagerAccessError("Invalid session.", 401);
  }
  if (!session.userId || session.role !== "admin") {
    throw new ManagerAccessError("Admin access required.", 403);
  }
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "active") {
    throw new ManagerAccessError("Account is not active.", 403);
  }
  return { userId: user.id, profileId: session.profileId };
}

/** Read-only operational access for Support and Admin staff. */
export async function getSupportOrAdminContext(req: Request): Promise<{ userId: string; role: "support" | "admin" }> {
  const raw = req.headers.get("x-rp-session");
  if (!raw) throw new ManagerAccessError("Missing session.", 401);
  let session: SessionPayload;
  try { session = JSON.parse(raw) as SessionPayload; } catch { throw new ManagerAccessError("Invalid session.", 401); }
  if (!session.userId || (session.role !== "support" && session.role !== "admin")) throw new ManagerAccessError("Support or Admin access required.", 403);
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "active") throw new ManagerAccessError("Account is not active.", 403);
  return { userId: user.id, role: session.role };
}

/** Assert the organization is currently in the manager's active portfolio. */
export async function assertOrganizationInPortfolio(
  managerId: string,
  organizationType: "pharmacy" | "laboratory",
  organizationId: string
): Promise<void> {
  const org =
    organizationType === "pharmacy"
      ? await db.pharmacy.findUnique({ where: { id: organizationId } })
      : await db.laboratory.findUnique({ where: { id: organizationId } });

  if (!org) throw new ManagerAccessError("Organization not found.", 404);
  if (org.currentManagerId !== managerId || org.managerRelationshipStatus !== "active") {
    throw new ManagerAccessError("Organization is not in your portfolio.", 403);
  }
}

/** Assert a support ticket belongs to an organization in the portfolio. */
export async function assertTicketInPortfolio(managerId: string, ticketId: string) {
  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ManagerAccessError("Ticket not found.", 404);
  if (ticket.managerId !== managerId) {
    throw new ManagerAccessError("Ticket is not in your portfolio.", 403);
  }
  return ticket;
}

// ---------------------------------------------------------------------------
// Privacy allowlists — organization DTOs expose business fields ONLY.
// ---------------------------------------------------------------------------

export const PHARMACY_SELECT = {
  id: true,
  pharmacyNumber: true,
  name: true,
  city: true,
  state: true,
  address: true,
  phone: true,
  email: true,
  verificationStatus: true,
  createdAt: true,
  acquiredByManagerId: true,
  acquiredAt: true,
  currentManagerId: true,
  managerAssignedAt: true,
  managerRelationshipStatus: true,
} satisfies Prisma.PharmacySelect;

export const LABORATORY_SELECT = {
  id: true,
  laboratoryNumber: true,
  name: true,
  city: true,
  state: true,
  address: true,
  phone: true,
  email: true,
  verificationStatus: true,
  createdAt: true,
  acquiredByManagerId: true,
  acquiredAt: true,
  currentManagerId: true,
  managerAssignedAt: true,
  managerRelationshipStatus: true,
} satisfies Prisma.LaboratorySelect;

export type ManagerOrganizationDto = {
  id: string;
  organizationType: "pharmacy" | "laboratory";
  organizationNumber: string;
  name: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  email: string;
  verificationStatus: string;
  joinedAt: string;
  acquiredByManagerId: string | null;
  acquiredAt: string | null;
  currentManagerId: string | null;
  managerAssignedAt: string | null;
  managerRelationshipStatus: string | null;
};

/** Project a pharmacy/laboratory row into the manager-safe DTO shape. */
export function toManagerOrganizationDto(
  row: Prisma.PharmacyGetPayload<{ select: typeof PHARMACY_SELECT }> | Prisma.LaboratoryGetPayload<{ select: typeof LABORATORY_SELECT }>,
  organizationType: "pharmacy" | "laboratory"
): ManagerOrganizationDto {
  return {
    id: row.id,
    organizationType,
    organizationNumber: "pharmacyNumber" in row ? row.pharmacyNumber : row.laboratoryNumber,
    name: row.name,
    city: row.city,
    state: row.state,
    address: row.address,
    phone: row.phone,
    email: row.email,
    verificationStatus: row.verificationStatus,
    joinedAt: row.createdAt.toISOString(),
    acquiredByManagerId: row.acquiredByManagerId,
    acquiredAt: row.acquiredAt ? row.acquiredAt.toISOString() : null,
    currentManagerId: row.currentManagerId,
    managerAssignedAt: row.managerAssignedAt ? row.managerAssignedAt.toISOString() : null,
    managerRelationshipStatus: row.managerRelationshipStatus,
  };
}

/** Mask a bank account number for any API response (plan §3.6). */
export function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return "****";
  return `****${accountNumber.slice(-4)}`;
}
