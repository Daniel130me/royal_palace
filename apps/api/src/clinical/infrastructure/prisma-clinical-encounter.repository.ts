import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ClinicalDocumentation, ProviderPatientRosterItem } from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import {
  ClinicalEncounterConflictError,
  type ClinicalDiagnosisDraft,
  type ClinicalEncounterAccessList,
  type ClinicalEncounterAccessRecord,
  type ClinicalEncounterRepository,
  type ClinicalMutationEnvelope,
  type ClinicalObservationDraft,
  type ProviderPatientRosterList,
  type ProviderReferralAccessList,
} from "../domain/clinical-encounter.types.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;
const OPEN_OPERATION = "clinical.encounter.open";
const DRAFT_OPERATION = "clinical.encounter.save-draft";
const SIGN_OPERATION = "clinical.encounter.sign";
const ADDENDUM_OPERATION = "clinical.encounter.add-addendum";

const encounterInclude = {
  allergies: { orderBy: [{ recordedAt: "desc" as const }, { id: "desc" as const }] },
  attachmentReferences: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }] },
  carePlans: { orderBy: [{ updatedAt: "desc" as const }, { id: "desc" as const }] },
  laboratoryRequests: {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    select: { id: true },
  },
  notes: {
    include: {
      diagnoses: { orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }] },
      observations: { orderBy: [{ observedAt: "asc" as const }, { id: "asc" as const }] },
    },
    orderBy: [{ revision: "asc" as const }],
  },
  patient: { select: { familyName: true, givenName: true, id: true, principalId: true } },
  practitioner: { select: { displayName: true, id: true, principalId: true } },
  prescriptions: {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    select: { id: true },
  },
  referrals: {
    include: { recipientPractitioner: { select: { displayName: true, id: true } } },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  },
} satisfies Prisma.ClinicalEncounterInclude;

type EncounterRow = Prisma.ClinicalEncounterGetPayload<{ include: typeof encounterInclude }>;
type Transaction = Prisma.TransactionClient;
const referralInclude = {
  patient: { select: { familyName: true, givenName: true, id: true } },
  practitioner: { select: { displayName: true, id: true } },
  recipientPractitioner: { select: { displayName: true, id: true } },
} satisfies Prisma.ClinicalReferralInclude;
type ReferralRow = Prisma.ClinicalReferralGetPayload<{ include: typeof referralInclude }>;

@Injectable()
export class PrismaClinicalEncounterRepository implements ClinicalEncounterRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async findPractitionerByPrincipal(principalId: string) {
    const practitioner = await this.database.practitioner.findUnique({
      select: { id: true, principalId: true, verificationStatus: true },
      where: { principalId },
    });
    if (practitioner === null || practitioner.principalId === null) return null;
    return {
      id: practitioner.id,
      principalId: practitioner.principalId,
      verificationStatus: practitioner.verificationStatus,
    };
  }

  async findVerifiedPractitionerById(practitionerId: string) {
    const practitioner = await this.database.practitioner.findFirst({
      select: { displayName: true, id: true, principalId: true },
      where: { id: practitionerId, principalId: { not: null }, verificationStatus: "VERIFIED" },
    });
    if (practitioner === null || practitioner.principalId === null) return null;
    return {
      displayName: practitioner.displayName,
      id: practitioner.id,
      principalId: practitioner.principalId,
    };
  }

  async findById(encounterId: string): Promise<ClinicalEncounterAccessRecord | null> {
    const row = await this.database.clinicalEncounter.findUnique({
      include: encounterInclude,
      relationLoadStrategy: "join",
      where: { id: encounterId },
    });
    return row === null ? null : mapEncounter(row);
  }

  async findScopeById(encounterId: string) {
    const encounter = await this.database.clinicalEncounter.findUnique({
      select: {
        id: true,
        patient: { select: { principalId: true } },
        practitioner: { select: { principalId: true } },
        status: true,
      },
      where: { id: encounterId },
    });
    if (
      encounter === null ||
      encounter.patient.principalId === null ||
      encounter.practitioner.principalId === null
    ) {
      return null;
    }
    return {
      id: encounter.id,
      patientPrincipalId: encounter.patient.principalId,
      practitionerPrincipalId: encounter.practitioner.principalId,
      status: encounter.status,
    };
  }

  async findPatientRecord(input: { encounterId: string; patientPrincipalId: string }) {
    const row = await this.database.clinicalEncounter.findFirst({
      include: {
        ...encounterInclude,
        notes: {
          ...encounterInclude.notes,
          where: { kind: { in: ["SIGNED", "ADDENDUM"] } },
        },
      },
      relationLoadStrategy: "join",
      where: {
        id: input.encounterId,
        patient: { principalId: input.patientPrincipalId },
        status: "SIGNED",
      },
    });
    return row === null ? null : mapEncounter(row);
  }

  async findPatientRecordByAppointment(input: {
    appointmentId: string;
    patientPrincipalId: string;
  }) {
    const row = await this.database.clinicalEncounter.findFirst({
      include: {
        ...encounterInclude,
        notes: {
          ...encounterInclude.notes,
          where: { kind: { in: ["SIGNED", "ADDENDUM"] } },
        },
      },
      relationLoadStrategy: "join",
      where: {
        appointmentId: input.appointmentId,
        patient: { principalId: input.patientPrincipalId },
        status: "SIGNED",
      },
    });
    return row === null ? null : mapEncounter(row);
  }

  async findAppointmentScope(appointmentId: string) {
    const appointment = await this.database.appointment.findUnique({
      select: {
        id: true,
        patient: { select: { principalId: true } },
        practitioner: { select: { id: true, principalId: true } },
        status: true,
      },
      where: { id: appointmentId },
    });
    if (
      appointment === null ||
      appointment.patient.principalId === null ||
      appointment.practitioner.principalId === null
    ) {
      return null;
    }
    return {
      id: appointment.id,
      patientPrincipalId: appointment.patient.principalId,
      practitionerId: appointment.practitioner.id,
      practitionerPrincipalId: appointment.practitioner.principalId,
      status: appointment.status,
    };
  }

  async listByPatient(input: {
    cursor?: { id: string; openedAt: Date };
    limit: number;
    patientPrincipalId: string;
  }): Promise<ClinicalEncounterAccessList> {
    return this.list({
      cursor: input.cursor,
      limit: input.limit,
      patientProjection: true,
      where: {
        patient: { principalId: input.patientPrincipalId },
        status: "SIGNED",
      },
    });
  }

  async listByPractitioner(input: {
    cursor?: { id: string; openedAt: Date };
    limit: number;
    patientId?: string;
    practitionerPrincipalId: string;
  }): Promise<ClinicalEncounterAccessList> {
    return this.list({
      cursor: input.cursor,
      limit: input.limit,
      patientProjection: false,
      where: {
        ...(input.patientId === undefined ? {} : { patientId: input.patientId }),
        practitioner: { principalId: input.practitionerPrincipalId },
      },
    });
  }

  async listPatientsByPractitioner(input: {
    cursor?: { id: string; lastEncounterAt: Date };
    limit: number;
    practitionerPrincipalId: string;
    query?: string;
  }): Promise<ProviderPatientRosterList> {
    const search =
      input.query === undefined
        ? Prisma.empty
        : Prisma.sql`
      AND (patient."given_name" ILIKE ${`%${input.query}%`}
        OR patient."family_name" ILIKE ${`%${input.query}%`}
        OR concat_ws(' ', patient."given_name", patient."family_name") ILIKE ${`%${input.query}%`})
    `;
    const cursor =
      input.cursor === undefined
        ? Prisma.empty
        : Prisma.sql`
      AND (roster."last_encounter_at", roster."patient_id")
        < (${input.cursor.lastEncounterAt}::timestamptz, ${input.cursor.id}::uuid)
    `;
    const rows = await this.database.$queryRaw<
      Array<{
        encounter_count: bigint;
        family_name: string;
        given_name: string;
        last_encounter_at: Date;
        patient_id: string;
      }>
    >(Prisma.sql`
      WITH roster AS (
        SELECT encounter."patient_id", MAX(encounter."opened_at") AS "last_encounter_at",
               COUNT(*)::bigint AS "encounter_count"
        FROM "clinical_encounters" encounter
        JOIN "practitioners" practitioner ON practitioner."id" = encounter."practitioner_id"
        WHERE practitioner."principal_id" = ${input.practitionerPrincipalId}::uuid
        GROUP BY encounter."patient_id"
      )
      SELECT roster."patient_id", roster."last_encounter_at", roster."encounter_count",
             patient."given_name", patient."family_name"
      FROM roster
      JOIN "patients" patient ON patient."id" = roster."patient_id"
      WHERE TRUE ${search} ${cursor}
      ORDER BY roster."last_encounter_at" DESC, roster."patient_id" DESC
      LIMIT ${input.limit + 1}
    `);
    const hasNextPage = rows.length > input.limit;
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      data: page.map((row) => ({
        encounterCount: Number(row.encounter_count),
        id: row.patient_id,
        lastEncounterAt: row.last_encounter_at.toISOString(),
        name: `${row.given_name} ${row.family_name}`.trim(),
      })),
      pageInfo: {
        endCursor:
          hasNextPage && last !== undefined
            ? encodeCursor({ id: last.patient_id, lastEncounterAt: last.last_encounter_at })
            : null,
        hasNextPage,
      },
    };
  }

  async findPatientByPractitioner(input: {
    patientId: string;
    practitionerPrincipalId: string;
  }): Promise<ProviderPatientRosterItem | null> {
    const rows = await this.database.$queryRaw<
      Array<{
        encounter_count: bigint;
        family_name: string;
        given_name: string;
        last_encounter_at: Date;
        patient_id: string;
      }>
    >(Prisma.sql`
      SELECT encounter."patient_id", MAX(encounter."opened_at") AS "last_encounter_at",
             COUNT(*)::bigint AS "encounter_count", patient."given_name", patient."family_name"
      FROM "clinical_encounters" encounter
      JOIN "practitioners" practitioner ON practitioner."id" = encounter."practitioner_id"
      JOIN "patients" patient ON patient."id" = encounter."patient_id"
      WHERE practitioner."principal_id" = ${input.practitionerPrincipalId}::uuid
        AND encounter."patient_id" = ${input.patientId}::uuid
      GROUP BY encounter."patient_id", patient."given_name", patient."family_name"
      LIMIT 1
    `);
    const row = rows[0];
    return row === undefined
      ? null
      : {
          encounterCount: Number(row.encounter_count),
          id: row.patient_id,
          lastEncounterAt: row.last_encounter_at.toISOString(),
          name: `${row.given_name} ${row.family_name}`.trim(),
        };
  }

  async listReferralsByPractitioner(input: {
    cursor?: { createdAt: Date; id: string };
    direction: "RECEIVED" | "SENT";
    limit: number;
    practitionerPrincipalId: string;
  }): Promise<ProviderReferralAccessList> {
    const rows = await this.database.clinicalReferral.findMany({
      include: referralInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      relationLoadStrategy: "join",
      take: input.limit + 1,
      where: {
        ...(input.direction === "SENT"
          ? { practitioner: { principalId: input.practitionerPrincipalId } }
          : { recipientPractitioner: { principalId: input.practitionerPrincipalId } }),
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
    const hasNextPage = rows.length > input.limit;
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      data: page.map(mapReferral),
      pageInfo: {
        endCursor:
          hasNextPage && last !== undefined
            ? encodeCursor({ createdAt: last.createdAt, id: last.id })
            : null,
        hasNextPage,
      },
    };
  }

  async transitionReceivedReferral(
    input: Parameters<ClinicalEncounterRepository["transitionReceivedReferral"]>[0],
  ) {
    const operation = "clinical.referral.decide";
    const referralId = await this.transaction(async (transaction) => {
      const replay = await beginIdempotentMutation(transaction, { ...input, operation });
      if (replay !== null) return replay;
      const current = await lockReferral(transaction, input.referralId);
      if (
        current === null ||
        current.recipient_principal_id !== input.actorPrincipalId ||
        current.status !== "ACTIVE" ||
        current.version !== input.expectedVersion
      ) {
        throw new ClinicalEncounterConflictError("VERSION_CONFLICT");
      }
      const updated = await transaction.clinicalReferral.updateMany({
        data: { status: input.decision, updatedAt: new Date(), version: { increment: 1 } },
        where: {
          id: input.referralId,
          status: "ACTIVE",
          version: input.expectedVersion,
        },
      });
      if (updated.count !== 1) throw new ClinicalEncounterConflictError("VERSION_CONFLICT");
      await transaction.clinicalReferralStatusHistory.create({
        data: {
          actorPrincipalId: input.actorPrincipalId,
          fromStatus: "ACTIVE",
          id: createOpaqueId(),
          referralId: input.referralId,
          toStatus: input.decision,
        },
      });
      await completeReferralMutation(transaction, input, operation, current.patient_id);
      return input.referralId;
    });
    const row = await this.database.clinicalReferral.findFirst({
      include: referralInclude,
      relationLoadStrategy: "join",
      where: {
        id: referralId,
        recipientPractitioner: { principalId: input.actorPrincipalId },
      },
    });
    if (row === null) throw new ClinicalEncounterConflictError("INVALID_STATE");
    return mapReferral(row);
  }

  async open(input: {
    actorPrincipalId: string;
    appointmentId: string;
    idempotencyKey: string;
    practitionerId: string;
    requestHash: string;
    traceRequestId: string;
  }): Promise<ClinicalEncounterAccessRecord> {
    const encounterId = await this.transaction(async (transaction) => {
      const replay = await beginIdempotentMutation(transaction, {
        ...input,
        operation: OPEN_OPERATION,
      });
      if (replay !== null) return replay;
      const appointment = await transaction.appointment.findUnique({
        select: { patientId: true, practitionerId: true, status: true },
        where: { id: input.appointmentId },
      });
      if (
        appointment === null ||
        appointment.practitionerId !== input.practitionerId ||
        appointment.status !== "CONFIRMED"
      ) {
        throw new ClinicalEncounterConflictError("INVALID_STATE");
      }
      const id = createOpaqueId();
      const now = new Date();
      await transaction.clinicalEncounter.create({
        data: {
          appointmentId: input.appointmentId,
          encounterNumber: `ENC-${createOpaqueId()}`,
          id,
          openedAt: now,
          openedByPrincipalId: input.actorPrincipalId,
          patientId: appointment.patientId,
          practitionerId: input.practitionerId,
          updatedAt: now,
        },
      });
      await completeMutation(
        transaction,
        input,
        OPEN_OPERATION,
        id,
        "clinical.encounter.opened",
        appointment.patientId,
      );
      return id;
    });
    return requireEncounter(await this.findById(encounterId));
  }

  async saveDraft(
    input: ClinicalMutationEnvelope & {
      documentation: ClinicalDocumentation;
      encounterId: string;
      schemaVersion: number;
    },
  ): Promise<ClinicalEncounterAccessRecord> {
    return this.appendNote(input, DRAFT_OPERATION, "DRAFT", [], []);
  }

  async sign(
    input: ClinicalMutationEnvelope & {
      diagnoses: readonly ClinicalDiagnosisDraft[];
      documentation: ClinicalDocumentation;
      encounterId: string;
      expectedVersion: number;
      observations: readonly ClinicalObservationDraft[];
      schemaVersion: number;
    },
  ): Promise<ClinicalEncounterAccessRecord> {
    return this.appendNote(input, SIGN_OPERATION, "SIGNED", input.diagnoses, input.observations);
  }

  async appendAddendum(
    input: ClinicalMutationEnvelope & {
      diagnoses: readonly ClinicalDiagnosisDraft[];
      documentation: ClinicalDocumentation;
      encounterId: string;
      observations: readonly ClinicalObservationDraft[];
      schemaVersion: number;
      supersedesNoteId: string;
    },
  ): Promise<ClinicalEncounterAccessRecord> {
    return this.appendNote(
      input,
      ADDENDUM_OPERATION,
      "ADDENDUM",
      input.diagnoses,
      input.observations,
    );
  }

  async createRelatedAction(
    input: Parameters<ClinicalEncounterRepository["createRelatedAction"]>[0],
  ): Promise<ClinicalEncounterAccessRecord> {
    const operation = `clinical.encounter.create-${input.action.kind.toLowerCase()}`;
    const encounterId = await this.transaction(async (transaction) => {
      const replay = await beginIdempotentMutation(transaction, { ...input, operation });
      if (replay !== null) return replay;
      const current = await lockEncounter(transaction, input.encounterId);
      if (
        current === null ||
        current.practitioner_principal_id !== input.actorPrincipalId ||
        !["OPEN", "SIGNED"].includes(current.status)
      ) {
        throw new ClinicalEncounterConflictError("INVALID_STATE");
      }
      const id = createOpaqueId();
      const now = new Date();
      switch (input.action.kind) {
        case "REFERRAL":
          await transaction.clinicalReferral.create({
            data: {
              createdByPrincipalId: input.actorPrincipalId,
              encounterId: input.encounterId,
              id,
              patientId: current.patient_id,
              priority: input.action.priority,
              practitionerId: current.practitioner_id,
              reason: input.action.reason,
              recipientName: input.action.recipientName,
              recipientPractitionerId: input.action.recipientPractitionerId,
              specialtyCode: input.action.specialtyCode,
              updatedAt: now,
            },
          });
          break;
        case "CARE_PLAN":
          await transaction.clinicalCarePlan.create({
            data: {
              activities: [...input.action.activities],
              endsAt: input.action.endsAt,
              encounterId: input.encounterId,
              goal: input.action.goal,
              id,
              patientId: current.patient_id,
              practitionerId: current.practitioner_id,
              startsAt: input.action.startsAt,
              title: input.action.title,
              updatedAt: now,
              updatedByPrincipalId: input.actorPrincipalId,
            },
          });
          break;
        case "ALLERGY":
          await transaction.clinicalAllergy.create({
            data: {
              criticality: input.action.criticality,
              encounterId: input.encounterId,
              id,
              patientId: current.patient_id,
              practitionerId: current.practitioner_id,
              reaction: input.action.reaction,
              recordedAt: now,
              recordedByPrincipalId: input.actorPrincipalId,
              substanceCode: input.action.substanceCode,
              substanceCodeSystem: input.action.substanceCodeSystem,
              substanceDisplay: input.action.substanceDisplay,
              updatedAt: now,
            },
          });
          break;
        case "ATTACHMENT_REFERENCE":
          await assertCleanAttachmentSource(transaction, input.action, current.patient_id);
          await transaction.clinicalAttachmentReference.create({
            data: {
              encounterId: input.encounterId,
              id,
              linkedByPrincipalId: input.actorPrincipalId,
              purpose: input.action.purpose,
              sourceId: input.action.sourceId,
              sourceType: input.action.sourceType,
            },
          });
          break;
      }
      await completeMutation(
        transaction,
        input,
        operation,
        input.encounterId,
        `clinical.encounter.${input.action.kind.toLowerCase()}-created`,
        current.patient_id,
      );
      return input.encounterId;
    });
    return requireEncounter(await this.findById(encounterId));
  }

  private async appendNote(
    input: ClinicalMutationEnvelope & {
      documentation: ClinicalDocumentation;
      encounterId: string;
      expectedVersion?: number;
      schemaVersion: number;
      supersedesNoteId?: string;
    },
    operation: string,
    kind: "DRAFT" | "SIGNED" | "ADDENDUM",
    diagnoses: readonly ClinicalDiagnosisDraft[],
    observations: readonly ClinicalObservationDraft[],
  ): Promise<ClinicalEncounterAccessRecord> {
    const encounterId = await this.transaction(async (transaction) => {
      const replay = await beginIdempotentMutation(transaction, { ...input, operation });
      if (replay !== null) return replay;
      const current = await lockEncounter(transaction, input.encounterId);
      if (current === null || current.practitioner_principal_id !== input.actorPrincipalId) {
        throw new ClinicalEncounterConflictError("INVALID_STATE");
      }
      if (current.latest_revision !== input.expectedLatestRevision) {
        throw new ClinicalEncounterConflictError("REVISION_CONFLICT");
      }
      if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
        throw new ClinicalEncounterConflictError("VERSION_CONFLICT");
      }
      const noteId = createOpaqueId();
      const now = new Date();
      await transaction.clinicalEncounterNote.create({
        data: {
          authoredAt: now,
          authoredByPrincipalId: input.actorPrincipalId,
          contentHash: hashDocumentation(input.documentation),
          documentation: input.documentation as unknown as Prisma.InputJsonValue,
          encounterId: input.encounterId,
          id: noteId,
          kind,
          revision: current.latest_revision + 1,
          schemaVersion: input.schemaVersion,
          ...(kind === "DRAFT" ? {} : { signedAt: now }),
          ...(input.supersedesNoteId === undefined
            ? {}
            : { supersedesNoteId: input.supersedesNoteId }),
        },
      });
      if (diagnoses.length > 0) {
        await transaction.clinicalDiagnosis.createMany({
          data: diagnoses.map((diagnosis) => ({
            ...diagnosis,
            encounterId: input.encounterId,
            id: createOpaqueId(),
            noteId,
            recordedAt: now,
          })),
        });
      }
      if (observations.length > 0) {
        await transaction.clinicalObservation.createMany({
          data: observations.map((observation) => ({
            ...observation,
            encounterId: input.encounterId,
            id: createOpaqueId(),
            noteId,
          })),
        });
      }
      if (kind === "SIGNED") {
        const updated = await transaction.clinicalEncounter.updateMany({
          data: {
            signedAt: now,
            signedByPrincipalId: input.actorPrincipalId,
            status: "SIGNED",
            updatedAt: now,
            version: { increment: 1 },
          },
          where: { id: input.encounterId, status: "OPEN", version: input.expectedVersion },
        });
        if (updated.count !== 1) throw new ClinicalEncounterConflictError("VERSION_CONFLICT");
      }
      const action =
        kind === "DRAFT"
          ? "clinical.encounter.draft-saved"
          : kind === "SIGNED"
            ? "clinical.encounter.signed"
            : "clinical.encounter.addendum-added";
      await completeMutation(
        transaction,
        input,
        operation,
        input.encounterId,
        action,
        current.patient_id,
      );
      return input.encounterId;
    });
    return requireEncounter(await this.findById(encounterId));
  }

  private async list(input: {
    cursor?: { id: string; openedAt: Date };
    limit: number;
    patientProjection: boolean;
    where: Prisma.ClinicalEncounterWhereInput;
  }): Promise<ClinicalEncounterAccessList> {
    const rows = await this.database.clinicalEncounter.findMany({
      include: input.patientProjection
        ? {
            ...encounterInclude,
            notes: {
              ...encounterInclude.notes,
              where: { kind: { in: ["SIGNED" as const, "ADDENDUM" as const] } },
            },
          }
        : encounterInclude,
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      relationLoadStrategy: "join",
      take: input.limit + 1,
      where: {
        ...input.where,
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { openedAt: { lt: input.cursor.openedAt } },
                { id: { lt: input.cursor.id }, openedAt: input.cursor.openedAt },
              ],
            }),
      },
    });
    const hasNextPage = rows.length > input.limit;
    const page = rows.slice(0, input.limit).map(mapEncounter);
    const last = page.at(-1);
    return {
      data: page,
      pageInfo: {
        endCursor:
          hasNextPage && last !== undefined
            ? Buffer.from(JSON.stringify({ id: last.id, openedAt: last.openedAt })).toString(
                "base64url",
              )
            : null,
        hasNextPage,
      },
    };
  }

  private async transaction<T>(operation: (transaction: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.database.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof ClinicalEncounterConflictError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (["P2002", "P2004", "P2034"].includes(error.code)) {
          throw new ClinicalEncounterConflictError("REVISION_CONFLICT");
        }
      }
      throw error;
    }
  }
}

async function beginIdempotentMutation(
  transaction: Transaction,
  input: {
    actorPrincipalId: string;
    idempotencyKey: string;
    operation: string;
    requestHash: string;
  },
): Promise<string | null> {
  const existing = await transaction.idempotencyKey.findUnique({
    where: {
      principalId_operation_key: {
        key: input.idempotencyKey,
        operation: input.operation,
        principalId: input.actorPrincipalId,
      },
    },
  });
  if (existing !== null) {
    if (
      existing.requestHash !== input.requestHash ||
      existing.status !== "COMPLETED" ||
      existing.resourceId === null
    ) {
      throw new ClinicalEncounterConflictError("IDEMPOTENCY_CONFLICT");
    }
    return existing.resourceId;
  }
  await transaction.idempotencyKey.create({
    data: {
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      id: createOpaqueId(),
      key: input.idempotencyKey,
      operation: input.operation,
      principalId: input.actorPrincipalId,
      requestHash: input.requestHash,
      updatedAt: new Date(),
    },
  });
  return null;
}

async function completeMutation(
  transaction: Transaction,
  input: {
    actorPrincipalId: string;
    idempotencyKey: string;
    requestHash: string;
    traceRequestId: string;
  },
  operation: string,
  encounterId: string,
  action: string,
  patientScopeId: string,
) {
  await transaction.idempotencyKey.update({
    data: {
      resourceId: encounterId,
      resourceType: "clinical_encounter",
      responseStatusCode: 201,
      status: "COMPLETED",
      updatedAt: new Date(),
    },
    where: {
      principalId_operation_key: {
        key: input.idempotencyKey,
        operation,
        principalId: input.actorPrincipalId,
      },
    },
  });
  await transaction.auditEvent.create({
    data: {
      action,
      actorPrincipalId: input.actorPrincipalId,
      id: createOpaqueId(),
      patientScopeId,
      requestId: input.traceRequestId,
      resourceId: encounterId,
      resourceType: "clinical_encounter",
      result: "SUCCEEDED",
    },
  });
}

async function completeReferralMutation(
  transaction: Transaction,
  input: {
    actorPrincipalId: string;
    decision: "ACCEPTED" | "DECLINED";
    idempotencyKey: string;
    referralId: string;
    traceRequestId: string;
  },
  operation: string,
  patientScopeId: string,
) {
  await transaction.idempotencyKey.update({
    data: {
      resourceId: input.referralId,
      resourceType: "clinical_referral",
      responseStatusCode: 200,
      status: "COMPLETED",
      updatedAt: new Date(),
    },
    where: {
      principalId_operation_key: {
        key: input.idempotencyKey,
        operation,
        principalId: input.actorPrincipalId,
      },
    },
  });
  await transaction.auditEvent.create({
    data: {
      action: `clinical.referral.${input.decision.toLowerCase()}`,
      actorPrincipalId: input.actorPrincipalId,
      id: createOpaqueId(),
      patientScopeId,
      requestId: input.traceRequestId,
      resourceId: input.referralId,
      resourceType: "clinical_referral",
      result: "SUCCEEDED",
    },
  });
}

async function lockReferral(transaction: Transaction, referralId: string) {
  const rows = await transaction.$queryRaw<
    Array<{
      patient_id: string;
      recipient_principal_id: string | null;
      status: string;
      version: number;
    }>
  >(Prisma.sql`
    SELECT referral."patient_id", referral."status"::text, referral."version",
           recipient."principal_id" AS recipient_principal_id
    FROM "clinical_referrals" referral
    LEFT JOIN "practitioners" recipient
      ON recipient."id" = referral."recipient_practitioner_id"
    WHERE referral."id" = ${referralId}::uuid
    FOR UPDATE OF referral
  `);
  return rows[0] ?? null;
}

async function lockEncounter(transaction: Transaction, encounterId: string) {
  const rows = await transaction.$queryRaw<
    Array<{
      patient_id: string;
      practitioner_id: string;
      practitioner_principal_id: string;
      status: string;
      version: number;
    }>
  >(Prisma.sql`
    SELECT encounter."status"::text, encounter."version", encounter."patient_id",
           encounter."practitioner_id",
           practitioner."principal_id" AS practitioner_principal_id
    FROM "clinical_encounters" encounter
    JOIN "practitioners" practitioner ON practitioner."id" = encounter."practitioner_id"
    WHERE encounter."id" = ${encounterId}::uuid
    FOR UPDATE OF encounter
  `);
  const current = rows[0];
  if (current === undefined) return null;
  const latest = await transaction.clinicalEncounterNote.aggregate({
    _max: { revision: true },
    where: { encounterId },
  });
  return { ...current, latest_revision: latest._max.revision ?? 0 };
}

async function assertCleanAttachmentSource(
  transaction: Transaction,
  source: {
    sourceId: string;
    sourceType: "LABORATORY_RESULT_ATTACHMENT" | "SCANNED_PRESCRIPTION" | "APPLICATION_DOCUMENT";
  },
  patientId: string,
) {
  if (source.sourceType === "LABORATORY_RESULT_ATTACHMENT") {
    const attachment = await transaction.laboratoryResultAttachment.findFirst({
      select: { id: true },
      where: { id: source.sourceId, result: { patientId }, status: "CLEAN" },
    });
    if (attachment !== null) return;
  } else if (source.sourceType === "SCANNED_PRESCRIPTION") {
    const attachment = await transaction.scannedPrescription.findFirst({
      select: { id: true },
      where: { id: source.sourceId, patientId, status: "CLEAN" },
    });
    if (attachment !== null) return;
  } else {
    const patient = await transaction.patient.findUnique({
      select: { principalId: true },
      where: { id: patientId },
    });
    const attachment = await transaction.applicationDocument.findFirst({
      select: { id: true },
      where: {
        application: { applicantPrincipalId: patient?.principalId },
        id: source.sourceId,
        status: "CLEAN",
      },
    });
    if (attachment !== null) return;
  }
  throw new ClinicalEncounterConflictError("INVALID_STATE");
}

function hashDocumentation(documentation: ClinicalDocumentation): string {
  return createHash("sha256").update(canonicalJson(documentation)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function requireEncounter(
  value: ClinicalEncounterAccessRecord | null,
): ClinicalEncounterAccessRecord {
  if (value === null) throw new ClinicalEncounterConflictError("INVALID_STATE");
  return value;
}

function mapReferral(row: ReferralRow) {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    patient: {
      displayName: `${row.patient.givenName} ${row.patient.familyName}`.trim(),
      id: row.patient.id,
    },
    priority: row.priority as "ROUTINE" | "URGENT" | "EMERGENCY",
    reason: row.reason,
    recipient: row.recipientPractitioner,
    recipientName: row.recipientName,
    sender: row.practitioner,
    specialtyCode: row.specialtyCode,
    status: row.status,
    version: row.version,
  };
}

function encodeCursor(value: Record<string, Date | string>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function mapEncounter(row: EncounterRow): ClinicalEncounterAccessRecord {
  if (row.patient.principalId === null || row.practitioner.principalId === null) {
    throw new Error("Clinical encounter principal relationship is missing");
  }
  return {
    appointmentId: row.appointmentId,
    encounterNumber: row.encounterNumber,
    id: row.id,
    notes: row.notes.map((note) => ({
      authoredAt: note.authoredAt.toISOString(),
      contentHash: note.contentHash,
      diagnoses: note.diagnoses.map((diagnosis) => ({
        code: diagnosis.code,
        codeSystem: diagnosis.codeSystem,
        display: diagnosis.display,
        id: diagnosis.id,
        onsetAt: diagnosis.onsetAt?.toISOString() ?? null,
        recordedAt: diagnosis.recordedAt.toISOString(),
        status: diagnosis.status,
        type: diagnosis.type,
      })),
      documentation: note.documentation as unknown as ClinicalDocumentation,
      id: note.id,
      kind: note.kind,
      observations: note.observations.map((observation) => ({
        booleanValue: observation.booleanValue,
        code: observation.code,
        codedValue: observation.codedValue,
        codeSystem: observation.codeSystem,
        display: observation.display,
        id: observation.id,
        numericValue: observation.numericValue?.toString() ?? null,
        observedAt: observation.observedAt.toISOString(),
        textValue: observation.textValue,
        unitCode: observation.unitCode,
        valueType: observation.valueType,
      })),
      revision: note.revision,
      schemaVersion: note.schemaVersion,
      signedAt: note.signedAt?.toISOString() ?? null,
      supersedesNoteId: note.supersedesNoteId,
    })),
    openedAt: row.openedAt.toISOString(),
    relatedActions: {
      allergies: row.allergies.map((allergy) => ({
        criticality: allergy.criticality,
        id: allergy.id,
        reaction: allergy.reaction,
        recordedAt: allergy.recordedAt.toISOString(),
        status: allergy.status,
        substanceCode: allergy.substanceCode,
        substanceCodeSystem: allergy.substanceCodeSystem,
        substanceDisplay: allergy.substanceDisplay,
        version: allergy.version,
      })),
      attachmentReferences: row.attachmentReferences.map((attachment) => ({
        createdAt: attachment.createdAt.toISOString(),
        id: attachment.id,
        purpose: attachment.purpose,
        sourceId: attachment.sourceId,
        sourceType: attachment.sourceType,
      })),
      carePlans: row.carePlans.map((plan) => ({
        activities: plan.activities as string[],
        endsAt: plan.endsAt?.toISOString() ?? null,
        goal: plan.goal,
        id: plan.id,
        startsAt: plan.startsAt.toISOString(),
        status: plan.status,
        title: plan.title,
        updatedAt: plan.updatedAt.toISOString(),
        version: plan.version,
      })),
      laboratoryRequestIds: row.laboratoryRequests.map((request) => request.id),
      prescriptionIds: row.prescriptions.map((prescription) => prescription.id),
      referrals: row.referrals.map((referral) => ({
        createdAt: referral.createdAt.toISOString(),
        id: referral.id,
        priority: referral.priority as "ROUTINE" | "URGENT" | "EMERGENCY",
        reason: referral.reason,
        recipientName: referral.recipientName,
        specialtyCode: referral.specialtyCode,
        status: referral.status,
        version: referral.version,
      })),
    },
    patient: {
      displayName: `${row.patient.givenName} ${row.patient.familyName}`.trim(),
      id: row.patient.id,
    },
    patientPrincipalId: row.patient.principalId,
    practitioner: { displayName: row.practitioner.displayName, id: row.practitioner.id },
    practitionerPrincipalId: row.practitioner.principalId,
    signedAt: row.signedAt?.toISOString() ?? null,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}
