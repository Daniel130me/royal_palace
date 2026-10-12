import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import type { ScannedPrescriptionRepository } from "../domain/scanned-prescription.types.js";

const MAX_ACTIVE_UPLOADS_PER_PATIENT = 20;
const IN_FLIGHT_UPLOAD_STATUSES = ["AWAITING_UPLOAD", "QUARANTINED", "SCANNING"] as const;

const summarySelect = {
  createdAt: true,
  declaredContentType: true,
  declaredSizeBytes: true,
  id: true,
  originalFilename: true,
  patientNote: true,
  pharmacyOrganizationId: true,
  prescriberFacility: true,
  prescriberName: true,
  status: true,
  statusReasonCode: true,
  updatedAt: true,
  uploadNumber: true,
  version: true,
} satisfies Prisma.ScannedPrescriptionSelect;

@Injectable()
export class PrismaScannedPrescriptionRepository implements ScannedPrescriptionRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async createUpload(input: Parameters<ScannedPrescriptionRepository["createUpload"]>[0]) {
    return this.database.$transaction(
      async (transaction) => {
        const patient = await transaction.patient.findUnique({
          select: { id: true },
          where: { principalId: input.patientPrincipalId },
        });
        if (patient === null) throw new ScannedPrescriptionPersistenceError("PATIENT_NOT_FOUND");
        await transaction.$queryRaw`SELECT id FROM patients WHERE id = ${patient.id}::uuid FOR UPDATE`;
        if (input.pharmacyOrganizationId !== null) {
          const pharmacy = await transaction.organization.findFirst({
            select: { id: true },
            where: {
              id: input.pharmacyOrganizationId,
              status: "ACTIVE",
              type: "PHARMACY",
              verificationStatus: "VERIFIED",
            },
          });
          if (pharmacy === null) {
            throw new ScannedPrescriptionPersistenceError("PHARMACY_NOT_AVAILABLE");
          }
        }
        const activeCount = await transaction.scannedPrescription.count({
          where: { patientId: patient.id, status: { in: [...IN_FLIGHT_UPLOAD_STATUSES] } },
        });
        if (activeCount >= MAX_ACTIVE_UPLOADS_PER_PATIENT) {
          throw new ScannedPrescriptionPersistenceError("ACTIVE_UPLOAD_LIMIT");
        }
        const id = createOpaqueId();
        const storageObjectKey = `scanned-prescriptions/${id}`;
        const record = await transaction.scannedPrescription.create({
          data: {
            declaredContentType: input.declaredContentType,
            declaredSha256: input.declaredSha256,
            declaredSizeBytes: input.declaredSizeBytes,
            history: {
              create: {
                id: createOpaqueId(),
                reasonCode: "UPLOAD_INTENT_CREATED",
                toStatus: "AWAITING_UPLOAD",
              },
            },
            id,
            originalFilename: input.originalFilename,
            patientId: patient.id,
            patientNote: input.patientNote,
            pharmacyOrganizationId: input.pharmacyOrganizationId,
            prescriberFacility: input.prescriberFacility,
            prescriberName: input.prescriberName,
            storageObjectKey,
            updatedAt: new Date(),
            uploadExpiresAt: input.uploadExpiresAt,
            uploadNumber: `RX-UPLOAD-${id.toUpperCase()}`,
          },
          include: { history: { orderBy: [{ occurredAt: "asc" }, { id: "asc" }] } },
        });
        return { prescription: mapDetail(record), storageObjectKey };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findOwned(input: Parameters<ScannedPrescriptionRepository["findOwned"]>[0]) {
    const record = await this.database.scannedPrescription.findFirst({
      include: {
        history: { orderBy: [{ occurredAt: "asc" }, { id: "asc" }] },
        patient: { select: { principalId: true } },
      },
      where: { id: input.prescriptionId, patient: { principalId: input.patientPrincipalId } },
    });
    if (record === null) return null;
    return {
      ...mapDetail(record),
      cleanObjectKey: record.cleanObjectKey,
      cleanVersionId: record.cleanVersionId,
      declaredSha256: record.declaredSha256,
      storageObjectKey: record.storageObjectKey,
      uploadExpiresAt: record.uploadExpiresAt,
    };
  }

  async listOwned(input: Parameters<ScannedPrescriptionRepository["listOwned"]>[0]) {
    const rows = await this.database.scannedPrescription.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: summarySelect,
      take: input.limit + 1,
      where: {
        patient: { principalId: input.patientPrincipalId },
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: input.cursor.createdAt } },
                { createdAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
              ],
            }),
      },
    });
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      data: visible.map(mapSummary),
      pageInfo: {
        endCursor:
          last === undefined
            ? null
            : Buffer.from(
                JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
                "utf8",
              ).toString("base64url"),
        hasNextPage: rows.length > input.limit,
      },
    };
  }

  async completeUpload(input: Parameters<ScannedPrescriptionRepository["completeUpload"]>[0]) {
    return this.database.$transaction(async (transaction) => {
      const record = await transaction.scannedPrescription.findFirst({
        select: { id: true, status: true },
        where: {
          id: input.prescriptionId,
          patient: { principalId: input.patientPrincipalId },
          status: "AWAITING_UPLOAD",
          uploadExpiresAt: { gt: new Date() },
        },
      });
      if (record === null) return false;
      const changed = await transaction.scannedPrescription.updateMany({
        data: {
          quarantineVersionId: input.quarantineVersionId,
          scanAvailableAt: new Date(),
          status: "QUARANTINED",
          statusReasonCode: "UPLOAD_COMPLETED",
          updatedAt: new Date(),
          version: { increment: 1 },
        },
        where: { id: record.id, status: "AWAITING_UPLOAD" },
      });
      if (changed.count !== 1) return false;
      return true;
    });
  }

  async rejectUpload(input: Parameters<ScannedPrescriptionRepository["rejectUpload"]>[0]) {
    await this.database.$transaction(async (transaction) => {
      const record = await transaction.scannedPrescription.findFirst({
        select: { id: true, status: true },
        where: { id: input.prescriptionId, patient: { principalId: input.patientPrincipalId } },
      });
      if (record === null || record.status !== "AWAITING_UPLOAD") return;
      await transaction.scannedPrescription.update({
        data: {
          status: "REJECTED",
          statusReasonCode: input.reasonCode,
          version: { increment: 1 },
        },
        where: { id: record.id },
      });
    });
  }
}

export class ScannedPrescriptionPersistenceError extends Error {
  constructor(
    readonly reason: "ACTIVE_UPLOAD_LIMIT" | "PATIENT_NOT_FOUND" | "PHARMACY_NOT_AVAILABLE",
  ) {
    super(reason);
    this.name = "ScannedPrescriptionPersistenceError";
  }
}

type SummaryRecord = Prisma.ScannedPrescriptionGetPayload<{ select: typeof summarySelect }>;
type DetailRecord = Prisma.ScannedPrescriptionGetPayload<{ include: { history: true } }>;

function mapSummary(record: SummaryRecord) {
  return {
    createdAt: record.createdAt.toISOString(),
    declaredContentType: record.declaredContentType,
    declaredSizeBytes: record.declaredSizeBytes,
    id: record.id,
    originalFilename: record.originalFilename,
    patientNote: record.patientNote,
    pharmacyOrganizationId: record.pharmacyOrganizationId,
    prescriberFacility: record.prescriberFacility,
    prescriberName: record.prescriberName,
    status: record.status,
    statusReasonCode: record.statusReasonCode,
    updatedAt: record.updatedAt.toISOString(),
    uploadNumber: record.uploadNumber,
    version: record.version,
  };
}

function mapDetail(record: DetailRecord) {
  return {
    ...mapSummary(record),
    history: record.history.map((entry) => ({
      fromStatus: entry.fromStatus,
      id: entry.id,
      occurredAt: entry.occurredAt.toISOString(),
      patientVisibleNote: entry.patientVisibleNote,
      reasonCode: entry.reasonCode,
      toStatus: entry.toStatus,
    })),
  };
}
