import { Inject, Injectable } from "@nestjs/common";
import type { NotificationReplayResponse } from "@royal-palace/contracts";

import { createOpaqueId } from "../../platform/identifiers.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type {
  NotificationAdministrationRepository,
  ReplayNotificationInput,
} from "../domain/notification-administration.types.js";

export class NotificationReplayConflictError extends Error {
  constructor() {
    super("Notification delivery cannot be replayed");
  }
}

@Injectable()
export class PrismaNotificationAdministrationRepository implements NotificationAdministrationRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  replay(input: ReplayNotificationInput): Promise<NotificationReplayResponse> {
    return this.database.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM notification_deliveries
        WHERE id = ${input.deliveryId}::uuid AND status = 'DEAD_LETTERED'
        FOR UPDATE
      `;
      if (locked.length !== 1) throw new NotificationReplayConflictError();

      const original = await transaction.notificationDelivery.findUnique({
        select: {
          category: true,
          channel: true,
          id: true,
          locale: true,
          recipientPrincipalId: true,
          templateKey: true,
          templateVersion: true,
          variables: true,
        },
        where: { id: input.deliveryId },
      });
      if (original === null) throw new NotificationReplayConflictError();

      const existingReplay = await transaction.notificationDelivery.findFirst({
        select: { id: true },
        where: {
          replayOfId: original.id,
          status: { in: ["PENDING", "PROCESSING", "DELIVERED"] },
        },
      });
      if (existingReplay !== null) throw new NotificationReplayConflictError();

      const id = createOpaqueId();
      await transaction.notificationDelivery.create({
        data: {
          category: original.category,
          channel: original.channel,
          deduplicationKey: `replay:${original.id}:${id}`,
          id,
          locale: original.locale,
          recipientPrincipalId: original.recipientPrincipalId,
          replayOfId: original.id,
          replayReason: input.reason,
          replayedByPrincipalId: input.actorPrincipalId,
          templateKey: original.templateKey,
          templateVersion: original.templateVersion,
          variables: original.variables as Prisma.InputJsonValue,
        },
      });
      return { id, replayOfId: original.id, status: "PENDING" };
    });
  }
}
