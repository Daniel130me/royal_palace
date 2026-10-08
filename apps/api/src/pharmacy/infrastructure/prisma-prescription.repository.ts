import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import {
  NOTIFICATION_TEMPLATE,
  type PrescriptionDispenseEventListResponse,
  type PrescriptionDispenseEventResponse,
  type PrescriptionListResponse,
  type PrescriptionResponse,
  type PrescriptionSubstitutionProposalResponse,
} from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { enqueueEmailNotification } from "../../notification/infrastructure/enqueue-notification.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import { canTransitionPrescription } from "../domain/prescription-state-machine.js";
import {
  PrescriptionConflictError,
  type PrescriptionAccessRecord,
  type PrescriptionDispenseLineInput,
  type PrescriptionDraftInput,
  type PrescriptionRepository,
  type PrescriptionSubstitutionInput,
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
  substitutionProposals: {
    include: { decisions: { orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }] } },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    where: { status: { in: ["PROPOSED", "PATIENT_CONSENTED", "APPROVED"] as const } },
  },
} satisfies Prisma.PrescriptionInclude;

type PrescriptionRow = Prisma.PrescriptionGetPayload<{ include: typeof prescriptionInclude }>;

const dispenseEventInclude = {
  lines: { orderBy: { id: "asc" as const } },
} satisfies Prisma.PrescriptionDispenseEventInclude;
type DispenseEventRow = Prisma.PrescriptionDispenseEventGetPayload<{
  include: typeof dispenseEventInclude;
}>;

@Injectable()
export class PrismaPrescriptionRepository implements PrescriptionRepository {
  constructor(
    @Inject(PrismaService) private readonly database: PrismaService,
    @Inject(SERVICE_CONFIG)
    private readonly config: Pick<ApiServiceConfig, "notificationDelivery">,
  ) {}

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
    if (row === null) return null;
    return mapPrescription(row, await loadDispenseBalances(this.database, [prescriptionId]));
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

  async createSubstitutionProposal(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    organizationId: string;
    prescriptionId: string;
    proposal: PrescriptionSubstitutionInput;
  }): Promise<PrescriptionSubstitutionProposalResponse | null> {
    const proposalId = createOpaqueId();
    const created = await this.database.$transaction(async (transaction) => {
      const current = await lockPrescription(transaction, input.prescriptionId);
      if (
        current === null ||
        current.version !== input.expectedVersion ||
        !["ACCEPTED", "PARTIALLY_DISPENSED"].includes(current.status) ||
        current.valid_until === null ||
        current.valid_until <= new Date()
      ) {
        return false;
      }
      const route = await transaction.prescriptionRoute.findFirst({
        select: { id: true },
        where: {
          pharmacyOrganizationId: input.organizationId,
          prescriptionId: input.prescriptionId,
          status: "ACCEPTED",
        },
      });
      const item = await transaction.prescriptionItem.findFirst({
        select: {
          id: true,
          medicationCode: true,
          medicationCodeSystem: true,
          medicationName: true,
          quantity: true,
          refillsAuthorized: true,
          strength: true,
          substitutionAllowed: true,
        },
        where: { id: input.proposal.prescriptionItemId, prescriptionId: input.prescriptionId },
      });
      const now = new Date();
      const policy = await transaction.prescriptionJurisdictionPolicy.findFirst({
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
        select: { id: true, substitutionApprovalMode: true },
        where: {
          effectiveFrom: { lte: now },
          jurisdictionCode: current.jurisdiction_code,
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
      });
      if (
        route === null ||
        item === null ||
        !item.substitutionAllowed ||
        input.proposal.fillNumber > item.refillsAuthorized ||
        policy === null ||
        policy.substitutionApprovalMode === "DISABLED" ||
        isUnchangedMedication(item, input.proposal)
      ) {
        return false;
      }
      if (input.proposal.fillNumber > 0) {
        const priorFill = await transaction.prescriptionDispenseLine.aggregate({
          _sum: { quantity: true },
          where: {
            fillNumber: input.proposal.fillNumber - 1,
            prescriptionItemId: item.id,
          },
        });
        if (!(priorFill._sum.quantity ?? new Prisma.Decimal(0)).equals(item.quantity)) return false;
      }
      await transaction.prescriptionSubstitutionProposal.create({
        data: {
          approvalMode: policy.substitutionApprovalMode,
          createdByPrincipalId: input.actorPrincipalId,
          fillNumber: input.proposal.fillNumber,
          id: proposalId,
          jurisdictionPolicyId: policy.id,
          prescriptionId: input.prescriptionId,
          prescriptionItemId: item.id,
          proposedMedicationCode: input.proposal.proposedMedicationCode,
          proposedMedicationCodeSystem: input.proposal.proposedMedicationCodeSystem,
          proposedMedicationName: input.proposal.proposedMedicationName,
          proposedStrength: input.proposal.proposedStrength,
          reasonCode: input.proposal.reasonCode,
          routeId: route.id,
          updatedAt: now,
        },
      });
      await bumpPrescriptionVersion(transaction, input.prescriptionId, input.expectedVersion);
      await enqueueEmailNotification(transaction, this.config, {
        deduplicationKey: `prescription-substitution:${proposalId}:patient`,
        recipientPrincipalId: current.patient_principal_id,
        reference: current.prescription_number.toUpperCase(),
        templateKey: NOTIFICATION_TEMPLATE.PRESCRIPTION_ACTION_REQUIRED,
      });
      return true;
    });
    if (!created) return null;
    return requireProposal(await findSubstitutionProposal(this.database, proposalId));
  }

  async decideSubstitution(input: {
    actorPrincipalId: string;
    decisionKind: "PATIENT_CONSENT" | "PRACTITIONER_APPROVAL";
    expectedVersion: number;
    outcome: "APPROVED" | "DECLINED";
    prescriptionId: string;
    proposalId: string;
  }): Promise<PrescriptionSubstitutionProposalResponse | null> {
    const decided = await this.database.$transaction(async (transaction) => {
      const current = await lockPrescription(transaction, input.prescriptionId);
      if (
        current === null ||
        current.version !== input.expectedVersion ||
        !["ACCEPTED", "PARTIALLY_DISPENSED"].includes(current.status) ||
        current.valid_until === null ||
        current.valid_until <= new Date()
      ) {
        return false;
      }
      const proposal = await transaction.prescriptionSubstitutionProposal.findFirst({
        select: { approvalMode: true, id: true, status: true, version: true },
        where: { id: input.proposalId, prescriptionId: input.prescriptionId },
      });
      if (proposal === null) return false;
      const nextStatus = substitutionDecisionStatus(proposal, input);
      if (nextStatus === null) return false;
      const now = new Date();
      await transaction.prescriptionSubstitutionDecision.create({
        data: {
          actorPrincipalId: input.actorPrincipalId,
          decisionKind: input.decisionKind,
          id: createOpaqueId(),
          occurredAt: now,
          outcome: input.outcome,
          proposalId: proposal.id,
        },
      });
      const updated = await transaction.prescriptionSubstitutionProposal.updateMany({
        data: { status: nextStatus, updatedAt: now, version: { increment: 1 } },
        where: { id: proposal.id, status: proposal.status, version: proposal.version },
      });
      if (updated.count !== 1) throw new PrescriptionConflictError("VERSION_CONFLICT");
      await bumpPrescriptionVersion(transaction, input.prescriptionId, input.expectedVersion);
      if (input.decisionKind === "PATIENT_CONSENT" && nextStatus === "PATIENT_CONSENTED") {
        await enqueueEmailNotification(transaction, this.config, {
          deduplicationKey: `prescription-substitution:${proposal.id}:practitioner`,
          recipientPrincipalId: current.practitioner_principal_id,
          reference: current.prescription_number.toUpperCase(),
          templateKey: NOTIFICATION_TEMPLATE.PRESCRIPTION_ACTION_REQUIRED,
        });
      } else if (input.decisionKind === "PRACTITIONER_APPROVAL") {
        await enqueueEmailNotification(transaction, this.config, {
          deduplicationKey: `prescription-substitution:${proposal.id}:patient-result`,
          recipientPrincipalId: current.patient_principal_id,
          reference: current.prescription_number.toUpperCase(),
          templateKey: NOTIFICATION_TEMPLATE.PRESCRIPTION_STATUS_UPDATED,
        });
      }
      return true;
    });
    if (!decided) return null;
    return requireProposal(await findSubstitutionProposal(this.database, input.proposalId));
  }

  async dispense(input: {
    actorPrincipalId: string;
    dispenseEventId: string;
    expectedVersion: number;
    lines: readonly PrescriptionDispenseLineInput[];
    occurredAt: Date;
    organizationId: string;
    prescriptionId: string;
    requestDigest: string;
  }): Promise<PrescriptionDispenseEventResponse | null> {
    const existing = await findDispenseEvent(this.database, input.dispenseEventId);
    if (existing !== null) {
      if (existing.requestDigest !== input.requestDigest) {
        throw new PrescriptionConflictError("DUPLICATE_DISPENSE_EVENT");
      }
      return mapDispenseEvent(existing);
    }
    const created = await this.database.$transaction(async (transaction) => {
      const current = await lockPrescription(transaction, input.prescriptionId);
      if (current === null) return false;
      const duplicate = await transaction.prescriptionDispenseEvent.findUnique({
        select: { requestDigest: true },
        where: { id: input.dispenseEventId },
      });
      if (duplicate !== null) {
        if (duplicate.requestDigest !== input.requestDigest) {
          throw new PrescriptionConflictError("DUPLICATE_DISPENSE_EVENT");
        }
        return true;
      }
      if (
        current.version !== input.expectedVersion ||
        !["ACCEPTED", "PARTIALLY_DISPENSED"].includes(current.status) ||
        current.valid_until === null ||
        current.valid_until <= input.occurredAt
      ) {
        return false;
      }
      const route = await transaction.prescriptionRoute.findFirst({
        select: { id: true },
        where: {
          pharmacyOrganizationId: input.organizationId,
          prescriptionId: input.prescriptionId,
          status: "ACCEPTED",
        },
      });
      if (route === null) return false;
      const items = await transaction.prescriptionItem.findMany({
        where: {
          id: { in: input.lines.map((line) => line.prescriptionItemId) },
          prescriptionId: input.prescriptionId,
        },
      });
      if (items.length !== input.lines.length) return false;
      const balances = await loadDispenseBalances(transaction, [input.prescriptionId]);
      const itemById = new Map(items.map((item) => [item.id, item]));
      const proposalIds = [
        ...new Set(
          input.lines.flatMap((line) =>
            line.substitutionProposalId === undefined ? [] : [line.substitutionProposalId],
          ),
        ),
      ];
      const proposals =
        proposalIds.length === 0
          ? []
          : await transaction.prescriptionSubstitutionProposal.findMany({
              where: { id: { in: proposalIds } },
            });
      const proposalById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
      const lineCreates = [];
      for (const line of input.lines) {
        const item = itemById.get(line.prescriptionItemId);
        if (item === undefined || line.fillNumber > item.refillsAuthorized) return false;
        assertDispenseBalance(item, line, balances);
        const medication = resolveDispensedMedication(route.id, item, line, proposalById);
        if (medication === null) return false;
        lineCreates.push({
          ...medication,
          fillNumber: line.fillNumber,
          id: createOpaqueId(),
          prescriptionItemId: item.id,
          quantity: new Prisma.Decimal(line.quantity),
          quantityUnit: item.quantityUnit,
          substitutionProposalId: line.substitutionProposalId,
        });
      }
      const aggregate = await transaction.prescriptionDispenseEvent.aggregate({
        _max: { eventNumber: true },
        where: { prescriptionId: input.prescriptionId },
      });
      await transaction.prescriptionDispenseEvent.create({
        data: {
          actorPrincipalId: input.actorPrincipalId,
          eventNumber: (aggregate._max.eventNumber ?? 0) + 1,
          id: input.dispenseEventId,
          lines: { create: lineCreates },
          occurredAt: input.occurredAt,
          prescriptionId: input.prescriptionId,
          requestDigest: input.requestDigest,
          routeId: route.id,
        },
      });
      if (proposalIds.length > 0) {
        await transaction.prescriptionSubstitutionProposal.updateMany({
          data: { status: "USED", updatedAt: input.occurredAt, version: { increment: 1 } },
          where: { id: { in: proposalIds }, status: "APPROVED" },
        });
      }
      const complete = await isPrescriptionFullyDispensed(transaction, input.prescriptionId);
      await transition(transaction, {
        actorPrincipalId: input.actorPrincipalId,
        expectedVersion: input.expectedVersion,
        fromStatus: current.status,
        prescriptionId: input.prescriptionId,
        reasonCode: complete ? "all_authorized_quantities_dispensed" : "partial_quantity_dispensed",
        toStatus: complete ? "DISPENSED" : "PARTIALLY_DISPENSED",
      });
      await enqueueEmailNotification(transaction, this.config, {
        deduplicationKey: `prescription-dispense:${input.dispenseEventId}:patient`,
        recipientPrincipalId: current.patient_principal_id,
        reference: current.prescription_number.toUpperCase(),
        templateKey: NOTIFICATION_TEMPLATE.PRESCRIPTION_STATUS_UPDATED,
      });
      return true;
    });
    if (!created) return null;
    const event = await findDispenseEvent(this.database, input.dispenseEventId);
    if (event === null || event.requestDigest !== input.requestDigest) {
      throw new PrescriptionConflictError("INVARIANT_VIOLATION");
    }
    return mapDispenseEvent(event);
  }

  async returnToPatient(input: {
    actorPrincipalId: string;
    expectedVersion: number;
    organizationId: string;
    prescriptionId: string;
    reasonCode: string;
  }): Promise<PrescriptionAccessRecord | null> {
    const returned = await this.database.$transaction(async (transaction) => {
      const current = await lockPrescription(transaction, input.prescriptionId);
      if (
        current === null ||
        current.version !== input.expectedVersion ||
        !["SENT", "ACCEPTED"].includes(current.status) ||
        current.valid_until === null ||
        current.valid_until <= new Date()
      ) {
        return false;
      }
      const dispenseCount = await transaction.prescriptionDispenseEvent.count({
        where: { prescriptionId: input.prescriptionId },
      });
      if (dispenseCount !== 0) return false;
      const route = await transaction.prescriptionRoute.findFirst({
        select: { id: true, status: true, version: true },
        where: {
          pharmacyOrganizationId: input.organizationId,
          prescriptionId: input.prescriptionId,
          status: { in: ["SENT", "ACCEPTED"] },
        },
      });
      if (route === null) return false;
      const now = new Date();
      const updated = await transaction.prescriptionRoute.updateMany({
        data: {
          cancellationReasonCode: input.reasonCode,
          cancelledAt: now,
          status: "CANCELLED",
          updatedAt: now,
          version: { increment: 1 },
        },
        where: { id: route.id, status: route.status, version: route.version },
      });
      if (updated.count !== 1) throw new PrescriptionConflictError("VERSION_CONFLICT");
      await transition(transaction, {
        actorPrincipalId: input.actorPrincipalId,
        expectedVersion: input.expectedVersion,
        fromStatus: current.status,
        prescriptionId: input.prescriptionId,
        reasonCode: input.reasonCode,
        toStatus: "SIGNED",
      });
      await enqueueEmailNotification(transaction, this.config, {
        deduplicationKey: `prescription-returned:${route.id}:patient`,
        recipientPrincipalId: current.patient_principal_id,
        reference: current.prescription_number.toUpperCase(),
        templateKey: NOTIFICATION_TEMPLATE.PRESCRIPTION_STATUS_UPDATED,
      });
      return true;
    });
    return returned ? requireLoaded(await this.findById(input.prescriptionId)) : null;
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
          cancellationReasonCode: input.reasonCode,
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
            cancellationReasonCode: "prescription_expired",
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
    const balances = await loadDispenseBalances(
      this.database,
      visible.map((row) => row.prescriptionId),
    );
    return {
      data: visible.map((row) => publicPrescription(mapPrescription(row.prescription, balances))),
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

  async listByPatient(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    patientPrincipalId: string;
  }): Promise<PrescriptionListResponse> {
    return this.listOwned({
      cursor: input.cursor,
      limit: input.limit,
      where: { patient: { principalId: input.patientPrincipalId } },
    });
  }

  async listByPractitioner(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    patientId?: string;
    practitionerPrincipalId: string;
  }): Promise<PrescriptionListResponse> {
    return this.listOwned({
      cursor: input.cursor,
      limit: input.limit,
      where: {
        ...(input.patientId === undefined ? {} : { patientId: input.patientId }),
        practitioner: { principalId: input.practitionerPrincipalId },
      },
    });
  }

  async listDispenseEvents(input: {
    cursor?: { id: string; occurredAt: Date };
    limit: number;
    prescriptionId: string;
  }): Promise<PrescriptionDispenseEventListResponse> {
    const rows = await this.database.prescriptionDispenseEvent.findMany({
      include: { lines: { orderBy: { id: "asc" } } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      where: {
        prescriptionId: input.prescriptionId,
        ...(input.cursor === undefined
          ? {}
          : {
              OR: [
                { occurredAt: { lt: input.cursor.occurredAt } },
                { id: { lt: input.cursor.id }, occurredAt: input.cursor.occurredAt },
              ],
            }),
      },
    });
    const hasNextPage = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      data: visible.map(mapDispenseEvent),
      pageInfo: {
        endCursor:
          last === undefined
            ? null
            : Buffer.from(
                JSON.stringify({ id: last.id, occurredAt: last.occurredAt.toISOString() }),
                "utf8",
              ).toString("base64url"),
        hasNextPage,
      },
    };
  }

  private async listOwned(input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    where: Prisma.PrescriptionWhereInput;
  }): Promise<PrescriptionListResponse> {
    const rows = await this.database.prescription.findMany({
      include: prescriptionInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      relationLoadStrategy: "join",
      take: input.limit + 1,
      where: {
        ...input.where,
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
    const visible = rows.slice(0, input.limit);
    const balances = await loadDispenseBalances(
      this.database,
      visible.map((row) => row.id),
    );
    return {
      data: visible.map((row) => publicPrescription(mapPrescription(row, balances))),
      pageInfo: { endCursor: createdCursor(visible.at(-1)), hasNextPage },
    };
  }
}

function createdCursor(row: { createdAt: Date; id: string } | undefined): string | null {
  return row === undefined
    ? null
    : Buffer.from(
        JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
        "utf8",
      ).toString("base64url");
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
      jurisdiction_code: string;
      patient_principal_id: string;
      practitioner_principal_id: string;
      practitioner_id: string;
      prescription_number: string;
      status: PrescriptionResponse["status"];
      valid_until: Date | null;
      version: number;
    }[]
  >(Prisma.sql`
    SELECT p."id", p."jurisdiction_code", patient."principal_id" AS "patient_principal_id",
           practitioner."principal_id" AS "practitioner_principal_id", p."practitioner_id",
           p."prescription_number", p."status", p."valid_until", p."version"
      FROM "prescriptions" p
      JOIN "patients" patient ON patient."id" = p."patient_id"
      JOIN "practitioners" practitioner ON practitioner."id" = p."practitioner_id"
     WHERE p."id" = ${prescriptionId}::uuid
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

interface DispenseBalanceRow {
  dispensed_quantity: Prisma.Decimal;
  fill_number: number;
  prescription_item_id: string;
}

function mapPrescription(
  row: PrescriptionRow,
  dispenseBalances: ReadonlyMap<string, readonly DispenseBalanceRow[]>,
): PrescriptionAccessRecord {
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
      balance: mapItemBalance(item, dispenseBalances.get(item.id) ?? []),
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
      cancellationReasonCode: route.cancellationReasonCode,
      cancelledAt: route.cancelledAt?.toISOString() ?? null,
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
    substitutionProposals: row.substitutionProposals.map(mapSubstitutionProposal),
    updatedAt: row.updatedAt.toISOString(),
    validUntil: row.validUntil?.toISOString() ?? null,
    version: row.version,
  };
}

function mapItemBalance(
  item: PrescriptionRow["items"][number],
  rows: readonly DispenseBalanceRow[],
) {
  const byFill = new Map(rows.map((row) => [row.fill_number, row.dispensed_quantity]));
  const fills = Array.from({ length: item.refillsAuthorized + 1 }, (_, fillNumber) => {
    const dispensed = byFill.get(fillNumber) ?? new Prisma.Decimal(0);
    return {
      dispensedQuantity: dispensed.toString(),
      fillNumber,
      remainingQuantity: item.quantity.minus(dispensed).toString(),
    };
  });
  const dispensed = fills.reduce(
    (total, fill) => total.plus(fill.dispensedQuantity),
    new Prisma.Decimal(0),
  );
  const totalAuthorized = item.quantity.mul(item.refillsAuthorized + 1);
  return {
    dispensedQuantity: dispensed.toString(),
    fills,
    remainingQuantity: totalAuthorized.minus(dispensed).toString(),
    totalAuthorizedQuantity: totalAuthorized.toString(),
  };
}

async function loadDispenseBalances(
  database: PrismaService | Prisma.TransactionClient,
  prescriptionIds: readonly string[],
): Promise<ReadonlyMap<string, readonly DispenseBalanceRow[]>> {
  if (prescriptionIds.length === 0) return new Map();
  const rows = await database.$queryRaw<DispenseBalanceRow[]>(Prisma.sql`
    SELECT pdl."prescription_item_id", pdl."fill_number",
           SUM(pdl."quantity")::DECIMAL(12,3) AS "dispensed_quantity"
      FROM "prescription_dispense_lines" pdl
      JOIN "prescription_items" pi ON pi."id" = pdl."prescription_item_id"
     WHERE pi."prescription_id" IN (${Prisma.join(prescriptionIds)})
     GROUP BY pdl."prescription_item_id", pdl."fill_number"
  `);
  const grouped = new Map<string, DispenseBalanceRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.prescription_item_id) ?? [];
    existing.push(row);
    grouped.set(row.prescription_item_id, existing);
  }
  return grouped;
}

function mapSubstitutionProposal(
  proposal: PrescriptionRow["substitutionProposals"][number],
): PrescriptionSubstitutionProposalResponse {
  return {
    approvalMode: proposal.approvalMode,
    createdAt: proposal.createdAt.toISOString(),
    decisions: proposal.decisions.map((decision) => ({
      decisionKind: decision.decisionKind,
      id: decision.id,
      occurredAt: decision.occurredAt.toISOString(),
      outcome: decision.outcome,
    })),
    fillNumber: proposal.fillNumber,
    id: proposal.id,
    prescriptionItemId: proposal.prescriptionItemId,
    proposedMedicationCode: proposal.proposedMedicationCode,
    proposedMedicationCodeSystem: proposal.proposedMedicationCodeSystem,
    proposedMedicationName: proposal.proposedMedicationName,
    proposedStrength: proposal.proposedStrength,
    reasonCode: proposal.reasonCode,
    status: proposal.status,
    updatedAt: proposal.updatedAt.toISOString(),
    version: proposal.version,
  };
}

async function findSubstitutionProposal(
  database: PrismaService,
  proposalId: string,
): Promise<PrescriptionSubstitutionProposalResponse | null> {
  const proposal = await database.prescriptionSubstitutionProposal.findUnique({
    include: { decisions: { orderBy: [{ occurredAt: "asc" }, { id: "asc" }] } },
    where: { id: proposalId },
  });
  return proposal === null ? null : mapSubstitutionProposal(proposal);
}

function requireProposal(
  proposal: PrescriptionSubstitutionProposalResponse | null,
): PrescriptionSubstitutionProposalResponse {
  if (proposal === null) throw new PrescriptionConflictError("INVARIANT_VIOLATION");
  return proposal;
}

function substitutionDecisionStatus(
  proposal: {
    approvalMode: "DISABLED" | "PATIENT_ONLY" | "PATIENT_AND_PRACTITIONER";
    status: string;
  },
  decision: {
    decisionKind: "PATIENT_CONSENT" | "PRACTITIONER_APPROVAL";
    outcome: "APPROVED" | "DECLINED";
  },
): "PATIENT_CONSENTED" | "APPROVED" | "DECLINED" | null {
  if (decision.decisionKind === "PATIENT_CONSENT") {
    if (proposal.status !== "PROPOSED") return null;
    if (decision.outcome === "DECLINED") return "DECLINED";
    return proposal.approvalMode === "PATIENT_AND_PRACTITIONER"
      ? "PATIENT_CONSENTED"
      : proposal.approvalMode === "PATIENT_ONLY"
        ? "APPROVED"
        : null;
  }
  if (
    proposal.approvalMode !== "PATIENT_AND_PRACTITIONER" ||
    proposal.status !== "PATIENT_CONSENTED"
  ) {
    return null;
  }
  return decision.outcome === "APPROVED" ? "APPROVED" : "DECLINED";
}

function isUnchangedMedication(
  item: {
    medicationCode: string | null;
    medicationCodeSystem: string | null;
    medicationName: string;
    strength: string | null;
  },
  proposal: PrescriptionSubstitutionInput,
): boolean {
  const normalize = (value: string | null | undefined) => value?.trim().toLocaleLowerCase() ?? null;
  return (
    normalize(item.medicationCode) === normalize(proposal.proposedMedicationCode) &&
    normalize(item.medicationCodeSystem) === normalize(proposal.proposedMedicationCodeSystem) &&
    normalize(item.medicationName) === normalize(proposal.proposedMedicationName) &&
    normalize(item.strength) === normalize(proposal.proposedStrength)
  );
}

async function bumpPrescriptionVersion(
  transaction: Prisma.TransactionClient,
  prescriptionId: string,
  expectedVersion: number,
): Promise<void> {
  const updated = await transaction.prescription.updateMany({
    data: { updatedAt: new Date(), version: { increment: 1 } },
    where: { id: prescriptionId, version: expectedVersion },
  });
  if (updated.count !== 1) throw new PrescriptionConflictError("VERSION_CONFLICT");
}

function assertDispenseBalance(
  item: Prisma.PrescriptionItemGetPayload<Record<string, never>>,
  line: PrescriptionDispenseLineInput,
  balances: ReadonlyMap<string, readonly DispenseBalanceRow[]>,
): void {
  const rows = balances.get(item.id) ?? [];
  const byFill = new Map(rows.map((row) => [row.fill_number, row.dispensed_quantity]));
  if (line.fillNumber > 0) {
    const prior = byFill.get(line.fillNumber - 1) ?? new Prisma.Decimal(0);
    if (!prior.equals(item.quantity)) throw new PrescriptionConflictError("INVARIANT_VIOLATION");
  }
  const current = byFill.get(line.fillNumber) ?? new Prisma.Decimal(0);
  if (current.plus(line.quantity).greaterThan(item.quantity)) {
    throw new PrescriptionConflictError("INVARIANT_VIOLATION");
  }
}

function resolveDispensedMedication(
  routeId: string,
  item: Prisma.PrescriptionItemGetPayload<Record<string, never>>,
  line: PrescriptionDispenseLineInput,
  proposals: ReadonlyMap<
    string,
    Prisma.PrescriptionSubstitutionProposalGetPayload<Record<string, never>>
  >,
) {
  if (line.substitutionProposalId === undefined) {
    return {
      dispensedMedicationCode: item.medicationCode,
      dispensedMedicationCodeSystem: item.medicationCodeSystem,
      dispensedMedicationName: item.medicationName,
      dispensedStrength: item.strength,
    };
  }
  const proposal = proposals.get(line.substitutionProposalId);
  if (
    proposal === undefined ||
    proposal.fillNumber !== line.fillNumber ||
    proposal.prescriptionItemId !== item.id ||
    proposal.routeId !== routeId ||
    !["APPROVED", "USED"].includes(proposal.status)
  ) {
    return null;
  }
  return {
    dispensedMedicationCode: proposal.proposedMedicationCode,
    dispensedMedicationCodeSystem: proposal.proposedMedicationCodeSystem,
    dispensedMedicationName: proposal.proposedMedicationName,
    dispensedStrength: proposal.proposedStrength,
  };
}

async function isPrescriptionFullyDispensed(
  transaction: Prisma.TransactionClient,
  prescriptionId: string,
): Promise<boolean> {
  const rows = await transaction.$queryRaw<{ incomplete_count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::BIGINT AS "incomplete_count"
      FROM "prescription_items" pi
      LEFT JOIN (
        SELECT "prescription_item_id", SUM("quantity") AS dispensed
          FROM "prescription_dispense_lines"
         GROUP BY "prescription_item_id"
      ) totals ON totals."prescription_item_id" = pi."id"
     WHERE pi."prescription_id" = ${prescriptionId}::uuid
       AND COALESCE(totals.dispensed, 0) < pi."quantity" * (pi."refills_authorized" + 1)
  `);
  return rows[0]?.incomplete_count === 0n;
}

async function findDispenseEvent(
  database: PrismaService,
  eventId: string,
): Promise<DispenseEventRow | null> {
  return database.prescriptionDispenseEvent.findUnique({
    include: dispenseEventInclude,
    where: { id: eventId },
  });
}

function mapDispenseEvent(event: DispenseEventRow): PrescriptionDispenseEventResponse {
  return {
    eventNumber: event.eventNumber,
    id: event.id,
    lines: event.lines.map((line) => ({
      dispensedMedicationCode: line.dispensedMedicationCode,
      dispensedMedicationCodeSystem: line.dispensedMedicationCodeSystem,
      dispensedMedicationName: line.dispensedMedicationName,
      dispensedStrength: line.dispensedStrength,
      fillNumber: line.fillNumber,
      id: line.id,
      prescriptionItemId: line.prescriptionItemId,
      quantity: line.quantity.toString(),
      quantityUnit: line.quantityUnit,
      substitutionProposalId: line.substitutionProposalId,
    })),
    occurredAt: event.occurredAt.toISOString(),
    prescriptionId: event.prescriptionId,
    routeId: event.routeId,
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
