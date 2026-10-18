import { Inject, Injectable } from "@nestjs/common";
import type {
  AdminAppointmentListItem,
  AdminAppointmentListResponse,
  AdminAuditEventListResponse,
  AdminComplaintListItem,
  AdminComplaintListResponse,
  AdminComplaintTransitionResponse,
  AdminDashboardResponse,
  AdminDeliveryListItem,
  AdminDeliveryListResponse,
} from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import {
  administrationFilterHash,
  encodeAdministrationCursor,
} from "../application/administration-cursor.js";
import type {
  AdministrationRepository,
  AdminDashboardQuery,
  ListAdminAppointmentsQuery,
  ListAdminAuditEventsQuery,
  ListAdminComplaintsQuery,
  ListAdminDeliveriesQuery,
  TransitionAdminComplaintInput,
} from "../domain/administration.types.js";

const appointmentSelect = {
  amountMinor: true,
  currency: true,
  endsAt: true,
  id: true,
  mode: true,
  patient: { select: { familyName: true, givenName: true, id: true } },
  practitioner: { select: { displayName: true, id: true } },
  startsAt: true,
  status: true,
} satisfies Prisma.AppointmentSelect;

type AppointmentRecord = Prisma.AppointmentGetPayload<{ select: typeof appointmentSelect }>;

interface AppointmentSummaryRow {
  all_count: bigint;
  completed_count: bigint;
  today_count: bigint;
  unsuccessful_count: bigint;
  upcoming_count: bigint;
}

const complaintSelect = {
  complainantType: true,
  complaintNumber: true,
  createdAt: true,
  description: true,
  id: true,
  priority: true,
  resolvedAt: true,
  status: true,
  subject: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.PlatformComplaintSelect;

const deliverySelect = {
  assignedAt: true,
  assignments: {
    orderBy: { assignedAt: "desc" as const },
    select: { courierPrincipalId: true },
    take: 1,
    where: { status: "ACTIVE" as const },
  },
  deliveryAdministrativeArea: true,
  deliveryCountryCode: true,
  deliveryLocality: true,
  deliveryNumber: true,
  deliveryPostalCode: true,
  handoff: { select: { handoffReference: true } },
  id: true,
  logisticsOrganizationId: true,
  order: { select: { orderNumber: true, pharmacyOrganizationId: true } },
  status: true,
  updatedAt: true,
} satisfies Prisma.LogisticsDeliverySelect;

type ComplaintRecord = Prisma.PlatformComplaintGetPayload<{ select: typeof complaintSelect }>;
type DeliveryRecord = Prisma.LogisticsDeliveryGetPayload<{ select: typeof deliverySelect }>;

interface ComplaintSummaryRow {
  all_count: bigint;
  open_count: bigint;
  resolved_count: bigint;
  urgent_count: bigint;
}

interface DeliverySummaryRow {
  active_count: bigint;
  all_count: bigint;
  delivered_count: bigint;
  exception_count: bigint;
}

interface DashboardRow {
  active_deliveries: bigint;
  appointments_today: bigint;
  expiring_credentials: bigint;
  laboratory_bookings: bigint;
  open_complaints: bigint;
  patients: bigint;
  payment_volume: Array<{ amountMinor: string; currency: string }>;
  pending_applications: bigint;
  recent_audit_events: AdminDashboardResponse["recentAuditEvents"];
  recent_complaints: Array<{
    complainantType: string;
    complaintNumber: string;
    createdAt: string;
    description: string;
    id: string;
    priority: string;
    status: string;
    subject: string;
    updatedAt: string;
    version: number;
  }>;
  verified_practitioners: bigint;
}

@Injectable()
export class PrismaAdministrationRepository implements AdministrationRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async getDashboard(query: AdminDashboardQuery): Promise<AdminDashboardResponse> {
    const rows = await this.database.$queryRaw<DashboardRow[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM "patients") AS patients,
        (SELECT COUNT(*) FROM "practitioners" WHERE "verification_status" = 'VERIFIED') AS verified_practitioners,
        (SELECT COUNT(*) FROM "onboarding_applications" WHERE "status" IN ('SUBMITTED', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED')) AS pending_applications,
        (SELECT COUNT(*) FROM "appointments" WHERE "starts_at" >= ${query.dayFrom} AND "starts_at" < ${query.dayTo}) AS appointments_today,
        (SELECT COUNT(*) FROM "logistics_deliveries" WHERE "status" IN ('ASSIGNED', 'ACCEPTED', 'HEADING_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PICKUP_VERIFIED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION')) AS active_deliveries,
        (SELECT COUNT(*) FROM "platform_complaints" WHERE "status" IN ('OPEN', 'INVESTIGATING')) AS open_complaints,
        (SELECT COUNT(*) FROM "practitioner_credentials" WHERE "expires_at" >= CURRENT_TIMESTAMP AND "expires_at" < ${query.credentialExpiringBefore}) AS expiring_credentials,
        (SELECT COUNT(*) FROM "laboratory_bookings") AS laboratory_bookings,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('currency', totals.currency, 'amountMinor', totals.amount_minor::text) ORDER BY totals.currency)
          FROM (
            SELECT "currency", SUM("amount_minor" - "refunded_amount_minor") AS amount_minor
            FROM "payments"
            WHERE "status" IN ('SUCCEEDED', 'PARTIALLY_REFUNDED')
            GROUP BY "currency"
          ) totals
        ), '[]'::jsonb) AS payment_volume,
        COALESCE((
          SELECT jsonb_agg(event ORDER BY event->>'occurredAt' DESC)
          FROM (
            SELECT jsonb_build_object(
              'action', "action",
              'actorPrincipalId', "actor_principal_id",
              'effectiveRole', "effective_role",
              'id', "id",
              'occurredAt', "occurred_at",
              'reasonCode', "reason_code",
              'resourceId', "resource_id",
              'resourceType', "resource_type",
              'result', "result"
            ) AS event
            FROM "audit_events"
            ORDER BY "occurred_at" DESC, "id" DESC
            LIMIT 4
          ) recent
        ), '[]'::jsonb) AS recent_audit_events,
        COALESCE((
          SELECT jsonb_agg(complaint ORDER BY complaint->>'createdAt' DESC)
          FROM (
            SELECT jsonb_build_object(
              'complainantType', "complainant_type",
              'complaintNumber', "complaint_number",
              'createdAt', "created_at",
              'description', "description",
              'id', "id",
              'priority', "priority",
              'status', "status",
              'subject', "subject",
              'updatedAt', "updated_at",
              'version', "version"
            ) AS complaint
            FROM "platform_complaints"
            WHERE "status" IN ('OPEN', 'INVESTIGATING')
            ORDER BY "created_at" DESC, "id" DESC
            LIMIT 4
          ) recent
        ), '[]'::jsonb) AS recent_complaints
    `);
    const row = rows[0];
    if (row === undefined) throw new Error("Dashboard query returned no row");
    return {
      attention: {
        expiringCredentials: Number(row.expiring_credentials),
        openComplaints: Number(row.open_complaints),
        pendingApplications: Number(row.pending_applications),
      },
      counts: {
        activeDeliveries: Number(row.active_deliveries),
        appointmentsToday: Number(row.appointments_today),
        laboratoryBookings: Number(row.laboratory_bookings),
        patients: Number(row.patients),
        verifiedPractitioners: Number(row.verified_practitioners),
      },
      paymentVolume: row.payment_volume,
      recentAuditEvents: row.recent_audit_events.map((event) => ({
        ...event,
        occurredAt: new Date(event.occurredAt).toISOString(),
      })),
      recentComplaints: row.recent_complaints.map(mapDashboardComplaint),
    };
  }

  async listComplaints(query: ListAdminComplaintsQuery): Promise<AdminComplaintListResponse> {
    const [records, summaries] = await this.database.$transaction([
      this.database.platformComplaint.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: complaintSelect,
        take: query.limit + 1,
        where: complaintWhere(query),
      }),
      this.database.$queryRaw<ComplaintSummaryRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS all_count,
          COUNT(*) FILTER (WHERE "status" IN ('OPEN', 'INVESTIGATING')) AS open_count,
          COUNT(*) FILTER (WHERE "status" IN ('RESOLVED', 'CLOSED')) AS resolved_count,
          COUNT(*) FILTER (WHERE "priority" = 'URGENT' AND "status" IN ('OPEN', 'INVESTIGATING')) AS urgent_count
        FROM "platform_complaints"
      `),
    ]);
    const summary = summaries[0];
    if (summary === undefined) throw new Error("Complaint summary query returned no row");
    return complaintPage(records, query, summary);
  }

  async listDeliveries(query: ListAdminDeliveriesQuery): Promise<AdminDeliveryListResponse> {
    const [records, summaries] = await this.database.$transaction([
      this.database.logisticsDelivery.findMany({
        orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
        select: deliverySelect,
        take: query.limit + 1,
        where: deliveryWhere(query),
      }),
      this.database.$queryRaw<DeliverySummaryRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS all_count,
          COUNT(*) FILTER (WHERE "status" IN ('ASSIGNED', 'ACCEPTED', 'HEADING_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PICKUP_VERIFIED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION')) AS active_count,
          COUNT(*) FILTER (WHERE "status" = 'DELIVERED') AS delivered_count,
          COUNT(*) FILTER (WHERE "status" IN ('FAILED', 'RETURNED', 'CANCELLED')) AS exception_count
        FROM "logistics_deliveries"
      `),
    ]);
    const summary = summaries[0];
    if (summary === undefined) throw new Error("Delivery summary query returned no row");
    return deliveryPage(records, query, summary);
  }

  async transitionComplaint(
    input: TransitionAdminComplaintInput,
  ): Promise<AdminComplaintTransitionResponse | null> {
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.platformComplaint.findUnique({
        select: { status: true },
        where: { id: input.complaintId },
      });
      if (current === null || !input.allowedFromStatuses.includes(current.status)) return null;
      const updated = await transaction.platformComplaint.updateMany({
        data: {
          resolvedAt: ["RESOLVED", "CLOSED"].includes(input.status) ? input.occurredAt : null,
          status: input.status,
          version: { increment: 1 },
        },
        where: {
          id: input.complaintId,
          status: { in: [...input.allowedFromStatuses] },
          version: input.expectedVersion,
        },
      });
      if (updated.count !== 1) return null;
      await transaction.platformComplaintStatusHistory.create({
        data: {
          actorPrincipalId: input.actorPrincipalId,
          complaintId: input.complaintId,
          fromStatus: current.status,
          id: createOpaqueId(),
          internalNote: input.internalNote,
          occurredAt: input.occurredAt,
          toStatus: input.status,
        },
      });
      const record = await transaction.platformComplaint.findUniqueOrThrow({
        select: complaintSelect,
        where: { id: input.complaintId },
      });
      return mapComplaint(record);
    });
  }

  async listAppointments(query: ListAdminAppointmentsQuery): Promise<AdminAppointmentListResponse> {
    const [records, summaryRows] = await this.database.$transaction([
      this.database.appointment.findMany({
        orderBy: [{ startsAt: "desc" }, { id: "desc" }],
        select: appointmentSelect,
        take: query.limit + 1,
        where: appointmentWhere(query),
      }),
      this.database.$queryRaw<AppointmentSummaryRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS all_count,
          COUNT(*) FILTER (WHERE "starts_at" >= ${query.dayFrom} AND "starts_at" < ${query.dayTo}) AS today_count,
          COUNT(*) FILTER (WHERE "status"::text IN ('PENDING_PAYMENT', 'CONFIRMED')) AS upcoming_count,
          COUNT(*) FILTER (WHERE "status"::text = 'COMPLETED') AS completed_count,
          COUNT(*) FILTER (WHERE "status"::text IN ('PAYMENT_FAILED', 'EXPIRED', 'CANCELLED')) AS unsuccessful_count
        FROM "appointments"
      `),
    ]);
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    const filterHash = administrationFilterHash({
      dayFrom: query.dayFrom.toISOString(),
      dayTo: query.dayTo.toISOString(),
      query: query.query,
      scope: query.scope,
    });
    const last = page.at(-1);
    const summary = summaryRows[0];
    if (summary === undefined) throw new Error("Appointment summary query returned no row");
    return {
      data: page.map(mapAppointment),
      pageInfo: {
        endCursor:
          hasNextPage && last !== undefined
            ? encodeAdministrationCursor({ id: last.id, timestamp: last.startsAt }, filterHash)
            : null,
        hasNextPage,
      },
      summary: {
        all: Number(summary.all_count),
        completed: Number(summary.completed_count),
        today: Number(summary.today_count),
        unsuccessful: Number(summary.unsuccessful_count),
        upcoming: Number(summary.upcoming_count),
      },
    };
  }

  async listAuditEvents(query: ListAdminAuditEventsQuery): Promise<AdminAuditEventListResponse> {
    const records = await this.database.auditEvent.findMany({
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: {
        action: true,
        actorPrincipalId: true,
        effectiveRole: true,
        id: true,
        occurredAt: true,
        reasonCode: true,
        resourceId: true,
        resourceType: true,
        result: true,
      },
      take: query.limit + 1,
      where: auditWhere(query),
    });
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    const filterHash = administrationFilterHash({
      action: query.action,
      effectiveRole: query.effectiveRole,
      from: query.from?.toISOString(),
      query: query.query,
      to: query.to?.toISOString(),
    });
    const last = page.at(-1);
    return {
      data: page.map((record) => ({
        ...record,
        occurredAt: record.occurredAt.toISOString(),
      })),
      pageInfo: {
        endCursor:
          hasNextPage && last !== undefined
            ? encodeAdministrationCursor({ id: last.id, timestamp: last.occurredAt }, filterHash)
            : null,
        hasNextPage,
      },
    };
  }
}

function appointmentWhere(query: ListAdminAppointmentsQuery): Prisma.AppointmentWhereInput {
  const scope =
    query.scope === "TODAY"
      ? { startsAt: { gte: query.dayFrom, lt: query.dayTo } }
      : query.scope === "UPCOMING"
        ? { status: { in: ["PENDING_PAYMENT" as const, "CONFIRMED" as const] } }
        : query.scope === "COMPLETED"
          ? { status: "COMPLETED" as const }
          : query.scope === "UNSUCCESSFUL"
            ? {
                status: {
                  in: ["PAYMENT_FAILED" as const, "EXPIRED" as const, "CANCELLED" as const],
                },
              }
            : {};
  const cursor =
    query.cursor === undefined
      ? {}
      : {
          OR: [
            { startsAt: { lt: query.cursor.timestamp } },
            { id: { lt: query.cursor.id }, startsAt: query.cursor.timestamp },
          ],
        };
  const search = query.query?.trim();
  const searchable =
    search === undefined
      ? {}
      : {
          AND: [
            {
              OR: [
                ...(isUuid(search)
                  ? [{ id: search }, { patientId: search }, { practitionerId: search }]
                  : []),
                { patient: { givenName: { contains: search, mode: "insensitive" as const } } },
                { patient: { familyName: { contains: search, mode: "insensitive" as const } } },
                {
                  practitioner: { displayName: { contains: search, mode: "insensitive" as const } },
                },
              ],
            },
          ],
        };
  return { ...scope, ...cursor, ...searchable };
}

function auditWhere(query: ListAdminAuditEventsQuery): Prisma.AuditEventWhereInput {
  const search = query.query?.trim();
  return {
    ...(query.action === undefined ? {} : { action: query.action }),
    ...(query.effectiveRole === undefined ? {} : { effectiveRole: query.effectiveRole }),
    ...(query.from === undefined && query.to === undefined
      ? {}
      : { occurredAt: { gte: query.from, lt: query.to } }),
    ...(query.cursor === undefined
      ? {}
      : {
          OR: [
            { occurredAt: { lt: query.cursor.timestamp } },
            { id: { lt: query.cursor.id }, occurredAt: query.cursor.timestamp },
          ],
        }),
    ...(search === undefined
      ? {}
      : {
          AND: [
            {
              OR: [
                { action: { contains: search, mode: "insensitive" } },
                { reasonCode: { contains: search, mode: "insensitive" } },
                { resourceType: { contains: search, mode: "insensitive" } },
                ...(isUuid(search) ? [{ actorPrincipalId: search }, { resourceId: search }] : []),
              ],
            },
          ],
        }),
  };
}

function mapAppointment(record: AppointmentRecord): AdminAppointmentListItem {
  return {
    amountMinor: record.amountMinor.toString(),
    currency: record.currency,
    endsAt: record.endsAt.toISOString(),
    id: record.id,
    mode: record.mode,
    patient: {
      displayName: `${record.patient.givenName} ${record.patient.familyName}`.trim(),
      id: record.patient.id,
    },
    practitioner: { displayName: record.practitioner.displayName, id: record.practitioner.id },
    startsAt: record.startsAt.toISOString(),
    status: record.status,
  };
}

function complaintWhere(query: ListAdminComplaintsQuery): Prisma.PlatformComplaintWhereInput {
  const search = query.query?.trim();
  return {
    ...(query.priority === undefined ? {} : { priority: query.priority }),
    ...(query.scope === "OPEN"
      ? { status: { in: ["OPEN" as const, "INVESTIGATING" as const] } }
      : query.scope === "RESOLVED"
        ? { status: { in: ["RESOLVED" as const, "CLOSED" as const] } }
        : {}),
    ...(query.cursor === undefined
      ? {}
      : {
          OR: [
            { createdAt: { lt: query.cursor.timestamp } },
            { createdAt: query.cursor.timestamp, id: { lt: query.cursor.id } },
          ],
        }),
    ...(search === undefined
      ? {}
      : {
          OR: [
            { complaintNumber: { contains: search, mode: "insensitive" as const } },
            { subject: { contains: search, mode: "insensitive" as const } },
            ...(isUuid(search) ? [{ id: search }, { submittedByPrincipalId: search }] : []),
          ],
        }),
  };
}

function complaintPage(
  records: ComplaintRecord[],
  query: ListAdminComplaintsQuery,
  summary: ComplaintSummaryRow,
): AdminComplaintListResponse {
  const hasNextPage = records.length > query.limit;
  const page = hasNextPage ? records.slice(0, query.limit) : records;
  const last = page.at(-1);
  const filterHash = administrationFilterHash({
    priority: query.priority,
    query: query.query,
    scope: query.scope,
  });
  return {
    data: page.map(mapComplaint),
    pageInfo: {
      endCursor:
        hasNextPage && last !== undefined
          ? encodeAdministrationCursor({ id: last.id, timestamp: last.createdAt }, filterHash)
          : null,
      hasNextPage,
    },
    summary: {
      all: Number(summary.all_count),
      open: Number(summary.open_count),
      resolved: Number(summary.resolved_count),
      urgent: Number(summary.urgent_count),
    },
  };
}

function mapComplaint(record: ComplaintRecord): AdminComplaintTransitionResponse {
  return {
    complainantType: record.complainantType as AdminComplaintTransitionResponse["complainantType"],
    complaintNumber: record.complaintNumber,
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    id: record.id,
    priority: record.priority,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    status: record.status,
    subject: record.subject,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

function mapDashboardComplaint(
  record: DashboardRow["recent_complaints"][number],
): AdminComplaintListItem {
  return {
    complainantType: record.complainantType as AdminComplaintListItem["complainantType"],
    complaintNumber: record.complaintNumber,
    createdAt: new Date(record.createdAt).toISOString(),
    description: record.description,
    id: record.id,
    priority: record.priority as AdminComplaintListItem["priority"],
    status: record.status as AdminComplaintListItem["status"],
    subject: record.subject,
    updatedAt: new Date(record.updatedAt).toISOString(),
    version: record.version,
  };
}

function deliveryWhere(query: ListAdminDeliveriesQuery): Prisma.LogisticsDeliveryWhereInput {
  const active = [
    "ASSIGNED",
    "ACCEPTED",
    "HEADING_TO_PICKUP",
    "ARRIVED_AT_PICKUP",
    "PICKUP_VERIFIED",
    "PICKED_UP",
    "IN_TRANSIT",
    "ARRIVED_AT_DESTINATION",
  ] as const;
  const exception = ["FAILED", "RETURNED", "CANCELLED"] as const;
  const search = query.query?.trim();
  return {
    ...(query.scope === "ACTIVE"
      ? { status: { in: [...active] } }
      : query.scope === "DELIVERED"
        ? { status: "DELIVERED" as const }
        : query.scope === "EXCEPTION"
          ? { status: { in: [...exception] } }
          : {}),
    ...(query.cursor === undefined
      ? {}
      : {
          OR: [
            { assignedAt: { lt: query.cursor.timestamp } },
            { assignedAt: query.cursor.timestamp, id: { lt: query.cursor.id } },
          ],
        }),
    ...(search === undefined
      ? {}
      : {
          OR: [
            { deliveryNumber: { contains: search, mode: "insensitive" as const } },
            { deliveryLocality: { contains: search, mode: "insensitive" as const } },
            { handoff: { handoffReference: { contains: search, mode: "insensitive" as const } } },
            { order: { orderNumber: { contains: search, mode: "insensitive" as const } } },
            ...(isUuid(search)
              ? [
                  { id: search },
                  { logisticsOrganizationId: search },
                  { order: { pharmacyOrganizationId: search } },
                ]
              : []),
          ],
        }),
  };
}

function deliveryPage(
  records: DeliveryRecord[],
  query: ListAdminDeliveriesQuery,
  summary: DeliverySummaryRow,
): AdminDeliveryListResponse {
  const hasNextPage = records.length > query.limit;
  const page = hasNextPage ? records.slice(0, query.limit) : records;
  const last = page.at(-1);
  const filterHash = administrationFilterHash({ query: query.query, scope: query.scope });
  return {
    data: page.map(mapDelivery),
    pageInfo: {
      endCursor:
        hasNextPage && last !== undefined
          ? encodeAdministrationCursor({ id: last.id, timestamp: last.assignedAt }, filterHash)
          : null,
      hasNextPage,
    },
    summary: {
      active: Number(summary.active_count),
      all: Number(summary.all_count),
      delivered: Number(summary.delivered_count),
      exception: Number(summary.exception_count),
    },
  };
}

function mapDelivery(record: DeliveryRecord): AdminDeliveryListItem {
  return {
    courierAssigned:
      record.assignments[0]?.courierPrincipalId !== null && record.assignments.length > 0,
    deliveryArea: {
      administrativeArea: record.deliveryAdministrativeArea,
      countryCode: record.deliveryCountryCode,
      locality: record.deliveryLocality,
      ...(record.deliveryPostalCode === null ? {} : { postalCode: record.deliveryPostalCode }),
    },
    deliveryNumber: record.deliveryNumber,
    handoffReference: record.handoff.handoffReference,
    id: record.id,
    logisticsOrganizationId: record.logisticsOrganizationId,
    orderNumber: record.order.orderNumber,
    pharmacyOrganizationId: record.order.pharmacyOrganizationId,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
