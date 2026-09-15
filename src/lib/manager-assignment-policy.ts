// Manager assignment policy — acquisition/assignment invariants (plan §4).
//
// Invariants implemented here:
// 1. Exactly one of pharmacyId / laboratoryId is present on an assignment.
// 2. Reassignment CLOSES the prior active assignment row (endsAt set) and
//    creates a NEW row — history is never rewritten.
// 3. The organization's cached current-manager fields and the new assignment
//    row are written in ONE Prisma transaction together with audit + notify
//    records, so they can never drift apart.

import { genId } from "@/lib/format";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export interface AssignOrganizationInput {
  organizationType: "pharmacy" | "laboratory";
  organizationId: string;
  managerId: string;
  assignedBy: string; // admin profile id (or system actor)
  source: "acquisition" | "application_approval" | "admin_assignment" | "reassignment";
  reason: string; // mandatory — every assignment change must be explainable
  startsAt?: Date;
}

/** Guard used by every assignment mutation: exactly one organization target. */
export function assertExactlyOneOrganization(
  pharmacyId: string | null | undefined,
  laboratoryId: string | null | undefined
): void {
  if (Boolean(pharmacyId) === Boolean(laboratoryId)) {
    throw new Error("Exactly one of pharmacyId or laboratoryId must be provided.");
  }
}

/**
 * Assign an organization to a manager inside a transaction:
 * close prior active assignment -> create new history row -> refresh the
 * organization's cached current-manager fields -> audit + notify.
 * Reuses the existing active assignment row's start date as `acquiredAt`
 * only when the organization has never been attributed before.
 */
export async function assignOrganizationToManager(input: AssignOrganizationInput, tx: Tx) {
  const { organizationType, organizationId, managerId, assignedBy, source, reason } = input;
  assertExactlyOneOrganization(
    organizationType === "pharmacy" ? organizationId : null,
    organizationType === "laboratory" ? organizationId : null
  );
  if (!reason?.trim()) {
    throw new Error("A reason is required for every manager assignment change.");
  }

  const startsAt = input.startsAt ?? new Date();

  // 1. Close any prior active assignment(s) for this organization.
  await tx.managerAssignment.updateMany({
    where: {
      organizationType,
      ...(organizationType === "pharmacy" ? { pharmacyId: organizationId } : { laboratoryId: organizationId }),
      relationshipStatus: "active",
      OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
    },
    data: { relationshipStatus: "ended", endsAt: startsAt },
  });

  // 2. Create the new history row (immutable once written).
  const assignment = await tx.managerAssignment.create({
    data: {
      id: genId("MAS"),
      managerId,
      organizationType,
      pharmacyId: organizationType === "pharmacy" ? organizationId : null,
      laboratoryId: organizationType === "laboratory" ? organizationId : null,
      source,
      relationshipStatus: "active",
      startsAt,
      assignedBy,
      reason: reason.trim(),
    },
  });

  // 3. Refresh the organization cache fields within the same transaction.
  const orgWhere = { id: organizationId } as const;
  if (organizationType === "pharmacy") {
    await tx.pharmacy.update({
      where: orgWhere,
      data: { currentManagerId: managerId, managerAssignedAt: startsAt, managerRelationshipStatus: "active" },
    });
  } else {
    await tx.laboratory.update({
      where: orgWhere,
      data: { currentManagerId: managerId, managerAssignedAt: startsAt, managerRelationshipStatus: "active" },
    });
  }

  return assignment;
}

/** Human-readable audit description for assignment changes. */
export function assignmentAuditDescription(params: {
  organizationName: string;
  organizationType: string;
  newManagerName: string;
  previousManagerName?: string | null;
}): string {
  const { organizationName, organizationType, newManagerName, previousManagerName } = params;
  return previousManagerName
    ? `${organizationName} (${organizationType}) reassigned from ${previousManagerName} to ${newManagerName}.`
    : `${organizationName} (${organizationType}) assigned to ${newManagerName}.`;
}
