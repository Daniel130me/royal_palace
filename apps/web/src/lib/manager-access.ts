// Temporary compatibility boundary for prototype manager routes. Authentication
// is production-grade and server-derived; the SQLite profile lookup is retired in
// Increment 08 when these routes move into the PostgreSQL manager capability.

import type { Manager, Prisma } from "@prisma/client";

import { BffAuthError, getAuthenticatedSession } from "@/lib/auth/bff";
import { db } from "@/lib/db";

export class ManagerAccessError extends Error {
  constructor(
    message: string,
    readonly status = 403,
  ) {
    super(message);
    this.name = "ManagerAccessError";
  }
}

export interface ManagerContext {
  manager: Manager;
  userId: string;
}

export async function getManagerContext(request: Request): Promise<ManagerContext> {
  const session = await secureSession(request);
  if (!session.roles.includes("MANAGER")) {
    throw new ManagerAccessError("Manager access required.", 403);
  }
  const manager = await db.manager.findUnique({ where: { userId: session.principalId } });
  if (manager === null) throw new ManagerAccessError("Manager profile not found.", 403);
  if (manager.employmentStatus === "suspended" || manager.verificationStatus === "suspended") {
    throw new ManagerAccessError("Manager account is suspended.", 403);
  }
  return { manager, userId: session.principalId };
}

export async function getAdminContext(
  request: Request,
): Promise<{ profileId?: string; userId: string }> {
  const session = await secureSession(request);
  if (!session.roles.includes("ADMINISTRATOR")) {
    throw new ManagerAccessError("Admin access required.", 403);
  }
  return { userId: session.principalId };
}

export async function getSupportOrAdminContext(
  request: Request,
): Promise<{ role: "support" | "admin"; userId: string }> {
  const session = await secureSession(request);
  if (session.roles.includes("ADMINISTRATOR")) {
    return { role: "admin", userId: session.principalId };
  }
  if (session.roles.includes("SUPPORT")) {
    return { role: "support", userId: session.principalId };
  }
  throw new ManagerAccessError("Support or Admin access required.", 403);
}

async function secureSession(request: Request) {
  try {
    return await getAuthenticatedSession(request);
  } catch (error) {
    if (error instanceof BffAuthError) throw new ManagerAccessError(error.message, error.status);
    throw error;
  }
}

export async function assertOrganizationInPortfolio(
  managerId: string,
  organizationType: "pharmacy" | "laboratory",
  organizationId: string,
): Promise<void> {
  const organization =
    organizationType === "pharmacy"
      ? await db.pharmacy.findUnique({ where: { id: organizationId } })
      : await db.laboratory.findUnique({ where: { id: organizationId } });
  if (organization === null) throw new ManagerAccessError("Organization not found.", 404);
  if (
    organization.currentManagerId !== managerId ||
    organization.managerRelationshipStatus !== "active"
  ) {
    throw new ManagerAccessError("Organization is not in your portfolio.", 403);
  }
}

export async function assertTicketInPortfolio(managerId: string, ticketId: string) {
  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (ticket === null) throw new ManagerAccessError("Ticket not found.", 404);
  if (ticket.managerId !== managerId) {
    throw new ManagerAccessError("Ticket is not in your portfolio.", 403);
  }
  return ticket;
}

export const PHARMACY_SELECT = {
  acquiredAt: true,
  acquiredByManagerId: true,
  address: true,
  city: true,
  createdAt: true,
  currentManagerId: true,
  email: true,
  id: true,
  managerAssignedAt: true,
  managerRelationshipStatus: true,
  name: true,
  pharmacyNumber: true,
  phone: true,
  state: true,
  verificationStatus: true,
} satisfies Prisma.PharmacySelect;

export const LABORATORY_SELECT = {
  acquiredAt: true,
  acquiredByManagerId: true,
  address: true,
  city: true,
  createdAt: true,
  currentManagerId: true,
  email: true,
  id: true,
  laboratoryNumber: true,
  managerAssignedAt: true,
  managerRelationshipStatus: true,
  name: true,
  phone: true,
  state: true,
  verificationStatus: true,
} satisfies Prisma.LaboratorySelect;

export type ManagerOrganizationDto = {
  acquiredAt: string | null;
  acquiredByManagerId: string | null;
  address: string;
  city: string;
  currentManagerId: string | null;
  email: string;
  id: string;
  joinedAt: string;
  managerAssignedAt: string | null;
  managerRelationshipStatus: string | null;
  name: string;
  organizationNumber: string;
  organizationType: "pharmacy" | "laboratory";
  phone: string;
  state: string;
  verificationStatus: string;
};

export function toManagerOrganizationDto(
  row:
    | Prisma.PharmacyGetPayload<{ select: typeof PHARMACY_SELECT }>
    | Prisma.LaboratoryGetPayload<{ select: typeof LABORATORY_SELECT }>,
  organizationType: "pharmacy" | "laboratory",
): ManagerOrganizationDto {
  return {
    acquiredAt: row.acquiredAt?.toISOString() ?? null,
    acquiredByManagerId: row.acquiredByManagerId,
    address: row.address,
    city: row.city,
    currentManagerId: row.currentManagerId,
    email: row.email,
    id: row.id,
    joinedAt: row.createdAt.toISOString(),
    managerAssignedAt: row.managerAssignedAt?.toISOString() ?? null,
    managerRelationshipStatus: row.managerRelationshipStatus,
    name: row.name,
    organizationNumber: "pharmacyNumber" in row ? row.pharmacyNumber : row.laboratoryNumber,
    organizationType,
    phone: row.phone,
    state: row.state,
    verificationStatus: row.verificationStatus,
  };
}

export function maskAccountNumber(accountNumber: string): string {
  return accountNumber.length <= 4 ? "****" : `****${accountNumber.slice(-4)}`;
}
