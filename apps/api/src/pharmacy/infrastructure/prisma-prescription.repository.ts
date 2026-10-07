import { Inject, Injectable } from "@nestjs/common";
import type { PrescriptionListResponse, PrescriptionResponse } from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import { canTransitionPrescription } from "../domain/prescription-state-machine.js";
import {
  PrescriptionConflictError,
  type PrescriptionAccessRecord,
  type PrescriptionDraftInput,
  type PrescriptionRepository,
} from "../domain/prescription.types.js";

const prescriptionInclude = {
  items: { orderBy: { lineNumber: "asc" as const } },
  patient: { select: { familyName: true, givenName: true, id: true, principalId: true } },
  practitioner: { select: { displayName: true, id: true, principalId: true } },
  routes: {
    include: { pharmacyOrganization: { select: { displayName: true, id: true } } },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  statusHistory: { orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.PrescriptionInclude;

type PrescriptionRow = Prisma.PrescriptionGetPayload<{ include: typeof prescriptionInclude }>;

@Injectable()
export class PrismaPrescriptionRepository implements PrescriptionRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async findPractitionerByPrincipal(principalId: string) {
    return this.database.practitioner.findUnique({
      select: { id: true, principalId: true, verificationStatus: true },
      where: { principalId },
    }) as Promise<{
      id: string;
      principalId: string;
      verificationStatus: "PENDING" | "VERIFIED" | "SUSPENDED" | "REVOKED";
    } | null>;
  }

  async findPatientPrincipal(patientId: string): Promise<string | null> {
    const row = await this.database.patient.findUnique({
      select: { principalId: true },
      where: { id: patientId },
    });
    return row?.principalId ?? null;
  }

  async findById(prescriptionId: string): Promise<PrescriptionAccessRecord | null> {
    const row = await this.database.prescription.findUnique({
      include: prescriptionInclude,
      relationLoadStrategy: "join",
      where: { id: prescriptionId },
    });
    return row === null ? null : mapPrescription(row);
  }

  async createDraft(input: {
    actorPrincipalId: string;
    draft: PrescriptionDraftInput;
    practitionerId: string;
  }): Promise<PrescriptionAccessRecord> {
    const prescriptionId = createOpaqueId();
    await this.database.$transaction(async (transaction) => {
      await assertDraftReferences(transaction, input.draft, input.practitionerId);
      await transaction.prescription.create({
        data: {
          appointmentId: input.draft.appointmentId,
          clinicalNote: input.draft.clinicalNote,
          id: prescriptionId,
          items: { create: itemCreates(input.draft.items) },
          jurisdictionCode: input.draft.jurisdictionCode,
          patientId: input.draft.patientId,
          practitionerId: input.practitionerId,
          prescriptionNumber: `RX-${createOpaqueId()}`,
          previousPrescriptionId: input.draft.previousPrescriptionId,
          statusHistory: {
            create: {
              actorPrincipalId: input.actorPrincipalId,
              id: createOpaqueId(),
              occurredAt: new Date(),
              reasonCode: "draft_created",
              toStatus: "DRAFT",
            },
          },
          updatedAt: new Date(),
        },
      });
    });
    return requireLoaded(await this.findById(prescriptionId));
  }

  async updateDraft(input: {
    actorPrincipalId: string;
    draft: PrescriptionDraftInput;
    expectedVersion: number;
    prescriptionId: string;
  }): Promise<PrescriptionAccessRecord | null> {
    const updated = await this.database.$transaction(async (transaction) => {
      const current = await lockPrescription(transaction, input.prescriptionId);
      if (
        current === null ||
        current.status !== "DRAFT" ||
        current.version !== input.expectedVersion
      ) {
        return null;
      }
      await assertDraftReferences(transaction, input.draft, current.practitioner_id);
      await transaction.prescriptionItem.deleteMany({
        where: { prescriptionId: input.prescriptionId },
      });
      await transaction.prescriptionItem.createMany({
        data: itemCreates(input.draft.items).map((item) => ({
          ...item,
          prescriptionId: input.prescriptionId,
        })),
      });
      const updated = await transaction.prescription.updateMany({
        data: {
          appointmentId: input.draft.appointmentId,
          clinicalNote: input.draft.clinicalNote,
          jurisdictionCode: input.draft.jurisdictionCode,
          patientId: input.draft.patientId,
          previousPrescriptionId: input.draft.previousPrescriptionId,
          updatedAt: new Date(),
          version: { increment: 1 },
        },
        where: { id: input.prescriptionId, status: "DRAFT", version: input.expectedVersion },
      });
      if (updated.count !== 1) throw new PrescriptionConflictError("VERSION_CONFLICT");
      await transaction.prescriptionStatusHistory.create({
        data: {
          actorPrincipalId: input.actorPrincipalId,
          fromStatus: "DRAFT",
          id: createOpaqueId(),
          occurredAt: new Date(),
          prescriptionId: input.prescriptionId,
          reasonCode: "draft_revised",
          toStatus: "DRAFT",
        },
      });
      return true;
    });
    return updated === null ? null : requireLoaded(await this.findById(input.prescriptionId));
  }

  async sign(input: {
    actorPrincipalId: string;
    attestationMethod: string;
    contentDigest: string;
    expectedVersion: number;
    prescriptionId: string;
    validUntil: Date;
  }): Promise<PrescriptionAccessRecord | null> {
    const signed = await this.database.$transaction(async (transaction) => {
      const now = new Date();
      const updated = await transaction.prescription.updateMany({
        data: {
          attestationMethod: input.attestationMethod,
          contentDigest: input.contentDigest,
          signedAt: now,
          status: "SIGNED",
          updatedAt: now,
          validUntil: input.validUntil,
          version: { increment: 1 },
        },
        where: {
          id: input.prescriptionId,
          status: "DRAFT",
          version: input.expectedVersion,
        },
      });
      if (updated.count !== 1) return null;
      await appendStatus(transaction, {
        actorPrincipalId: input.actorPrincipalId,
        fromStatus: "DRAFT",
        prescriptionId: input.prescriptionId,
        reasonCode: "practitioner_attested",
        toStatus: "SIGNED",
      });
      return true;
    });
    return signed === null ? null : requireLoaded(await this.findById(input.prescriptionId));
  }

  async routeToPharmacy(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    pharmacyOrganizationId: string;
    prescriptionId: string;
  }): Promise<PrescriptionAccessRecord | null> {
    try {
      const routed = await this.database.$transaction(async (transaction) => {
        const current = await lockPrescription(transaction, input.prescriptionId);
        if (
          current === null ||
          current.version !== input.expectedVersion ||
          current.status !== "SIGNED" ||
          current.valid_until === null ||
          current.valid_until <= new Date()
        ) {
          return null;
        }
        const pharmacy = await transaction.organization.findFirst({
          select: { id: true },
          where: {
            id: input.pharmacyOrganizationId,
            status: "ACTIVE",
            type: "PHARMACY",
            verificationStatus: "VERIFIED",
          },
        });
        if (pharmacy === null) return null;
        const now = new Date();
        await transaction.prescriptionRoute.create({
          data: {
            id: createOpaqueId(),
            pharmacyOrganizationId: pharmacy.id,
            prescriptionId: input.prescriptionId,
            sentAt: now,
            updatedAt: now,
          },
        });
        await transition(transaction, {
          actorPrincipalId: input.actorPrincipalId,
          expectedVersion: input.expectedVersion,
          fromStatus: "SIGNED",
          prescriptionId: input.prescriptionId,
          reasonCode: "patient_selected_pharmacy",
          toStatus: "SENT",
        });
        return true;
      });
      return routed === null ? null : requireLoaded(await this.findById(input.prescriptionId));
    } catch (error) {
      if (isConstraintConflict(error)) throw new PrescriptionConflictError("ACTIVE_ROUTE_EXISTS");
      throw error;
    }
  }

  async acceptAtPharmacy(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    organizationId: string;
    prescriptionId: string;
  }): Promise<PrescriptionAccessRecord | null> {
    const accepted = await this.database.$transaction(async (transaction) => {
      const current = await lockPrescription(transaction, input.prescriptionId);
      if (
        current === null ||
        current.version !== input.expectedVersion ||
        current.status !== "SENT" ||
        current.valid_until === null ||
        current.valid_until <= new Date()
      ) {
        return null;
      }
      const route = await transaction.prescriptionRoute.findFirst({
        select: { id: true, version: true },
        where: {
          pharmacyOrganizationId: input.organizationId,
          prescriptionId: input.prescriptionId,
          status: "SENT",
        },
      });
      if (route === null) return null;
      const now = new Date();
      const routeUpdated = await transaction.prescriptionRoute.updateMany({
        data: {
          acceptedAt: now,
          status: "ACCEPTED",
          updatedAt: now,
          version: { increment: 1 },
        },
        where: { id: route.id, status: "SENT", version: route.version },
      });
      if (routeUpdated.count !== 1) throw new PrescriptionConflictError("VERSION_CONFLICT");
      await transition(transaction, {
        actorPrincipalId: input.actorPrincipalId,
        expectedVersion: input.expectedVersion,
        fromStatus: "SENT",
        prescriptionId: input.prescriptionId,
        reasonCode: "pharmacy_accepted",
        toStatus: "ACCEPTED",
      });
      return true;
    });
    return accepted === null ? null : requireLoaded(await this.findById(input.prescriptionId));
  }

  async cancel(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    prescriptionId: string;
    reasonCode: string;
  }): Promise<PrescriptionAccessRecord | null> {
    const cancelled = await this.database.$transaction(async (transaction) => {
      const current = await lockPrescription(transaction, input.prescriptionId);
      if (
        current === null ||
        current.version !== input.expectedVersion ||
        !canTransitionPrescription(current.status, "CANCELLED")
      ) {
        return null;
      }
      const now = new Date();
      await transaction.prescriptionRoute.updateMany({
        data: {
          cancelledAt: now,
          status: "CANCELLED",
          updatedAt: now,
          version: { increment: 1 },
        },
        where: { prescriptionId: input.prescriptionId, status: { in: ["SENT", "ACCEPTED"] } },
      });
      await transition(transaction, {
        actorPrincipalId: input.actorPrincipalId,
        expectedVersion: input.expectedVersion,
        fromStatus: current.status,
        prescriptionId: input.prescriptionId,
        reasonCode: input.reasonCode,
        toStatus: "CANCELLED",
        update: { cancelledAt: now, cancellationReasonCode: input.reasonCode },
      });
      return true;
    });
    return cancelled === null ? null : requireLoaded(await this.findById(input.prescriptionId));
  }

  async expireDue(input: {
    actorPrincipalId: string;
    limit: number;
    now: Date;
  }): Promise<{ expired: number }> {
    return this.database.$transaction(async (transaction) => {
      const due = await transaction.$queryRaw<
        { id: string; status: "SIGNED" | "SENT" | "ACCEPTED" | "PARTIALLY_DISPENSED" }[]
      >(Prisma.sql`
        SELECT "id", "status"
          FROM "prescriptions"
         WHERE "status" IN ('SIGNED', 'SENT', 'ACCEPTED', 'PARTIALLY_DISPENSED')
           AND "valid_until" <= ${input.now}
         ORDER BY "valid_until" ASC, "id" ASC
         LIMIT ${input.limit}
         FOR UPDATE SKIP LOCKED
      `);
      for (const prescription of due) {
        await transaction.prescription.update({
          data: { status: "EXPIRED", updatedAt: input.now, version: { increment: 1 } },
          where: { id: prescription.id },
        });
        await transaction.prescriptionRoute.updateMany({
          data: {
            cancelledAt: input.now,
            status: "CANCELLED",
            updatedAt: input.now,
            version: { increment: 1 },
          },
          where: { prescriptionId: prescription.id, status: { in: ["SENT", "ACCEPTED"] } },
        });
        await appendStatus(transaction, {
          actorPrincipalId: input.actorPrincipalId,
          fromStatus: prescription.status,
          prescriptionId: prescription.id,
          reasonCode: "validity_elapsed",
          toStatus: "EXPIRED",
        });
      }
      return { expired: due.length };
    });
  }

  async listPharmacyQueue(input: {
    cursor?: { id: string; sentAt: Date };
    limit: number;
    organizationId: string;
  }): Promise<PrescriptionListResponse> {
    const rows = await this.database.prescriptionRoute.findMany({
      include: { prescription: { include: prescriptionInclude } },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      relationLoadStrategy: "join",
      take: input.limit + 1,
      where: {
        pharmacyOrganizationId: input.organizationId,
        status: { in: ["SENT", "ACCEPTED"] },
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { sentAt: { lt: input.cursor.sentAt } },
                { id: { lt: input.cursor.id }, sentAt: input.cursor.sentAt },
              ],
            }),
      },
    });
    const hasNextPage = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      data: visible.map((row) => publicPrescription(mapPrescription(row.prescription))),
      pageInfo: {
        endCursor:
          last === undefined
            ? null
            : Buffer.from(
                JSON.stringify({ id: last.id, sentAt: last.sentAt.toISOString() }),
                "utf8",
              ).toString("base64url"),
        hasNextPage,
      },
    };
  }
}

async function assertDraftReferences(
  transaction: Prisma.TransactionClient,
  draft: PrescriptionDraftInput,
  practitionerId: string,
): Promise<void> {
  const appointment = await transaction.appointment.findFirst({
    select: { id: true },
    where: {
      id: draft.appointmentId,
      patientId: draft.patientId,
      practitionerId,
      status: { in: ["CONFIRMED", "COMPLETED"] },
    },
  });
  if (appointment === null) throw new PrescriptionConflictError("INVARIANT_VIOLATION");
  if (draft.previousPrescriptionId !== undefined) {
    const previous = await transaction.prescription.findFirst({
      select: { id: true },
      where: {
        id: draft.previousPrescriptionId,
        patientId: draft.patientId,
        practitionerId,
        status: { not: "DRAFT" },
      },
    });
    if (previous === null) throw new PrescriptionConflictError("INVARIANT_VIOLATION");
  }
}

function itemCreates(items: readonly PrescriptionDraftInput["items"][number][]) {
  return items.map((item, index) => ({
    controlledMedication: item.controlledMedication,
    dose: item.dose,
    duration: item.duration,
    frequency: item.frequency,
    id: createOpaqueId(),
    instructions: item.instructions,
    lineNumber: index + 1,
    medicationCode: item.medicationCode,
    medicationCodeSystem: item.medicationCodeSystem,
    medicationName: item.medicationName,
    quantity: new Prisma.Decimal(item.quantity),
    quantityUnit: item.quantityUnit,
    refillsAuthorized: item.refillsAuthorized,
    route: item.route,
    strength: item.strength,
    substitutionAllowed: item.substitutionAllowed,
  }));
}

async function lockPrescription(transaction: Prisma.TransactionClient, prescriptionId: string) {
  const rows = await transaction.$queryRaw<
    {
      id: string;
      practitioner_id: string;
      status: PrescriptionResponse["status"];
      valid_until: Date | null;
      version: number;
    }[]
  >(Prisma.sql`
    SELECT "id", "practitioner_id", "status", "valid_until", "version"
      FROM "prescriptions"
     WHERE "id" = ${prescriptionId}::uuid
     FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function transition(
  transaction: Prisma.TransactionClient,
  input: {
    actorPrincipalId: string;
    expectedVersion: number;
    fromStatus: PrescriptionResponse["status"];
    prescriptionId: string;
    reasonCode: string;
    toStatus: PrescriptionResponse["status"];
    update?: { cancelledAt: Date; cancellationReasonCode: string };
  },
) {
  if (!canTransitionPrescription(input.fromStatus, input.toStatus)) {
    throw new PrescriptionConflictError("INVALID_STATE");
  }
  const updated = await transaction.prescription.updateMany({
    data: {
      ...input.update,
      status: input.toStatus,
      updatedAt: new Date(),
      version: { increment: 1 },
    },
    where: {
      id: input.prescriptionId,
      status: input.fromStatus,
      version: input.expectedVersion,
    },
  });
  if (updated.count !== 1) throw new PrescriptionConflictError("VERSION_CONFLICT");
  await appendStatus(transaction, input);
}

async function appendStatus(
  transaction: Prisma.TransactionClient,
  input: {
    actorPrincipalId: string;
    fromStatus: PrescriptionResponse["status"] | null;
    prescriptionId: string;
    reasonCode: string;
    toStatus: PrescriptionResponse["status"];
  },
) {
  await transaction.prescriptionStatusHistory.create({
    data: {
      actorPrincipalId: input.actorPrincipalId,
      fromStatus: input.fromStatus,
      id: createOpaqueId(),
      occurredAt: new Date(),
      prescriptionId: input.prescriptionId,
      reasonCode: input.reasonCode,
      toStatus: input.toStatus,
    },
  });
}

function mapPrescription(row: PrescriptionRow): PrescriptionAccessRecord {
  const activeRoute = row.routes.find((route) => route.status !== "CANCELLED");
  if (row.practitioner.principalId === null) {
    throw new PrescriptionConflictError("INVARIANT_VIOLATION");
  }
  return {
    appointmentId: row.appointmentId,
    attestationMethod: row.attestationMethod,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    clinicalNote: row.clinicalNote,
    contentDigest: row.contentDigest,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    items: row.items.map((item) => ({
      controlledMedication: item.controlledMedication,
      dose: item.dose,
      duration: item.duration,
      frequency: item.frequency,
      id: item.id,
      instructions: item.instructions,
      lineNumber: item.lineNumber,
      medicationCode: item.medicationCode,
      medicationCodeSystem: item.medicationCodeSystem,
      medicationName: item.medicationName,
      quantity: item.quantity.toString(),
      quantityUnit: item.quantityUnit,
      refillsAuthorized: item.refillsAuthorized,
      route: item.route,
      strength: item.strength,
      substitutionAllowed: item.substitutionAllowed,
    })),
    jurisdictionCode: row.jurisdictionCode,
    patient: {
      displayName: `${row.patient.givenName} ${row.patient.familyName}`,
      id: row.patient.id,
    },
    patientPrincipalId: row.patient.principalId,
    pharmacyOrganizationId: activeRoute?.pharmacyOrganizationId,
    practitioner: { displayName: row.practitioner.displayName, id: row.practitioner.id },
    practitionerPrincipalId: row.practitioner.principalId,
    prescriptionNumber: row.prescriptionNumber,
    previousPrescriptionId: row.previousPrescriptionId,
    routes: row.routes.map((route) => ({
      acceptedAt: route.acceptedAt?.toISOString() ?? null,
      id: route.id,
      pharmacy: route.pharmacyOrganization,
      sentAt: route.sentAt.toISOString(),
      status: route.status,
      version: route.version,
    })),
    signedAt: row.signedAt?.toISOString() ?? null,
    status: row.status,
    statusHistory: row.statusHistory.map((history) => ({
      fromStatus: history.fromStatus,
      id: history.id,
      occurredAt: history.occurredAt.toISOString(),
      reasonCode: history.reasonCode,
      toStatus: history.toStatus,
    })),
    updatedAt: row.updatedAt.toISOString(),
    validUntil: row.validUntil?.toISOString() ?? null,
    version: row.version,
  };
}

function requireLoaded(record: PrescriptionAccessRecord | null): PrescriptionAccessRecord {
  if (record === null) throw new PrescriptionConflictError("INVARIANT_VIOLATION");
  return record;
}

function publicPrescription(record: PrescriptionAccessRecord): PrescriptionResponse {
  const {
    patientPrincipalId: _patient,
    pharmacyOrganizationId: _pharmacy,
    practitionerPrincipalId: _practitioner,
    ...response
  } = record;
  return response;
}

function isConstraintConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2004")
  );
}
