import { Inject, Injectable } from "@nestjs/common";
import type {
  AdminAppointmentListItem,
  AdminAppointmentListResponse,
  AdminAuditEventListResponse,
} from "@royal-palace/contracts";

import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  administrationFilterHash,
  encodeAdministrationCursor,
} from "../application/administration-cursor.js";
import type {
  AdministrationRepository,
  ListAdminAppointmentsQuery,
  ListAdminAuditEventsQuery,
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

@Injectable()
export class PrismaAdministrationRepository implements AdministrationRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
