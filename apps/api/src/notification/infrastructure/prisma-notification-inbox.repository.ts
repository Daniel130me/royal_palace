import { Inject, Injectable } from "@nestjs/common";
import type {
  NotificationCategory,
  NotificationInboxItemResponse,
  NotificationPreferenceResponse,
  NotificationTemplateKey,
} from "@royal-palace/contracts";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type {
  NotificationInboxRepository,
  NotificationInboxScope,
} from "../domain/notification-inbox.types.js";

const EMAIL_CATEGORIES = ["SECURITY", "TRANSACTIONAL", "MARKETING"] as const;

@Injectable()
export class PrismaNotificationInboxRepository implements NotificationInboxRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async list(
    input: NotificationInboxScope & {
      cursor?: { createdAt: Date; id: string };
      limit: number;
      unreadOnly: boolean;
    },
  ) {
    const scope = recipientScope(input);
    const where: Prisma.NotificationInboxItemWhereInput = {
      AND: [
        scope,
        ...(input.cursor === undefined
          ? []
          : [
              {
                OR: [
                  { createdAt: { lt: input.cursor.createdAt } },
                  { createdAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
                ],
              },
            ]),
        ...(input.unreadOnly ? [{ reads: { none: { principalId: input.principalId } } }] : []),
      ],
    };
    const [rows, unreadCount] = await this.database.$transaction([
      this.database.notificationInboxItem.findMany({
        include: {
          reads: {
            select: { readAt: true },
            take: 1,
            where: { principalId: input.principalId },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        where,
      }),
      this.database.notificationInboxItem.count({
        where: { AND: [scope, { reads: { none: { principalId: input.principalId } } }] },
      }),
    ]);
    const hasNextPage = rows.length > input.limit;
    const page = hasNextPage ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map((row) => mapInboxItem(row)),
      pageInfo: {
        endCursor:
          last === undefined
            ? null
            : Buffer.from(
                JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
              ).toString("base64url"),
        hasNextPage,
      },
      unreadCount,
    };
  }

  async markRead(input: NotificationInboxScope & { itemId: string; readAt: Date }) {
    const item = await this.database.notificationInboxItem.findFirst({
      select: { id: true },
      where: { AND: [{ id: input.itemId }, recipientScope(input)] },
    });
    if (item === null) return null;
    const read = await this.database.notificationInboxRead.upsert({
      create: {
        id: createOpaqueId(),
        itemId: item.id,
        principalId: input.principalId,
        readAt: input.readAt,
      },
      update: {},
      where: { itemId_principalId: { itemId: item.id, principalId: input.principalId } },
    });
    return { id: item.id, readAt: read.readAt.toISOString() };
  }

  async markAllRead(input: NotificationInboxScope & { limit: number; readAt: Date }) {
    return this.database.$transaction(async (transaction) => {
      const rows = await transaction.notificationInboxItem.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
        take: input.limit + 1,
        where: {
          AND: [recipientScope(input), { reads: { none: { principalId: input.principalId } } }],
        },
      });
      const page = rows.slice(0, input.limit);
      if (page.length > 0) {
        await transaction.notificationInboxRead.createMany({
          data: page.map(({ id }) => ({
            id: createOpaqueId(),
            itemId: id,
            principalId: input.principalId,
            readAt: input.readAt,
          })),
          skipDuplicates: true,
        });
      }
      return { hasMore: rows.length > input.limit, markedCount: page.length };
    });
  }

  async listPreferences(principalId: string) {
    const rows = await this.database.notificationPreference.findMany({
      where: { channel: "EMAIL", principalId },
    });
    const byCategory = new Map(rows.map((row) => [row.category, row]));
    return {
      data: EMAIL_CATEGORIES.map((category) => mapPreference(category, byCategory.get(category))),
    };
  }

  async updateMarketingPreference(input: {
    enabled: boolean;
    expectedVersion: number;
    principalId: string;
    updatedAt: Date;
  }) {
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.notificationPreference.findUnique({
        where: {
          principalId_channel_category: {
            category: "MARKETING",
            channel: "EMAIL",
            principalId: input.principalId,
          },
        },
      });
      if (current === null) {
        if (input.expectedVersion !== 0) return null;
        const created = await transaction.notificationPreference.create({
          data: {
            category: "MARKETING",
            channel: "EMAIL",
            consentEvidenceCode: "SELF_SERVICE_UI",
            consentedAt: input.enabled ? input.updatedAt : null,
            enabled: input.enabled,
            id: createOpaqueId(),
            principalId: input.principalId,
            updatedAt: input.updatedAt,
            withdrawnAt: input.enabled ? null : input.updatedAt,
          },
        });
        return mapPreference("MARKETING", created);
      }
      if (current.version !== input.expectedVersion) return null;
      const changed = await transaction.notificationPreference.updateMany({
        data: {
          consentEvidenceCode: "SELF_SERVICE_UI",
          consentedAt: input.enabled ? input.updatedAt : current.consentedAt,
          enabled: input.enabled,
          updatedAt: input.updatedAt,
          version: { increment: 1 },
          withdrawnAt: input.enabled ? null : input.updatedAt,
        },
        where: { id: current.id, version: current.version },
      });
      if (changed.count !== 1) return null;
      return mapPreference(
        "MARKETING",
        await transaction.notificationPreference.findUniqueOrThrow({ where: { id: current.id } }),
      );
    });
  }
}

function recipientScope(input: NotificationInboxScope): Prisma.NotificationInboxItemWhereInput {
  return {
    OR: [
      { recipientPrincipalId: input.principalId },
      ...(input.organizationIds.length === 0
        ? []
        : [{ recipientOrganizationId: { in: [...input.organizationIds] } }]),
    ],
  };
}

function mapInboxItem(row: {
  category: string;
  createdAt: Date;
  id: string;
  locale: string;
  reads: readonly { readAt: Date }[];
  reference: string;
  resourceId: string | null;
  resourceType: string | null;
  templateKey: string;
}): NotificationInboxItemResponse {
  return {
    category: row.category as NotificationCategory,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    locale: row.locale,
    readAt: row.reads[0]?.readAt.toISOString() ?? null,
    reference: row.reference,
    resourceId: row.resourceId,
    resourceType: row.resourceType,
    templateKey: row.templateKey as NotificationTemplateKey,
  };
}

function mapPreference(
  category: NotificationCategory,
  row?: { enabled: boolean; version: number },
): NotificationPreferenceResponse {
  const mutable = category === "MARKETING";
  return {
    category,
    channel: "EMAIL",
    enabled: mutable ? (row?.enabled ?? false) : true,
    mutable,
    version: row?.version ?? 0,
  };
}
