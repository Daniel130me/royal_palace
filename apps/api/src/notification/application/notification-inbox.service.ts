import { Inject, Injectable } from "@nestjs/common";
import type { CurrentSession, NotificationPreferenceResponse } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type NotificationInboxRepository,
  type NotificationInboxScope,
} from "../domain/notification-inbox.types.js";

interface RequestContext {
  actor: CurrentSession;
  requestId: string;
}

export class NotificationInboxNotFoundError extends Error {}
export class InvalidNotificationCursorError extends Error {}
export class NotificationPreferenceConflictError extends Error {}

@Injectable()
export class NotificationInboxService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(NOTIFICATION_INBOX_REPOSITORY)
    private readonly repository: NotificationInboxRepository,
  ) {}

  async list(
    context: RequestContext,
    input: { cursor?: string; limit: number; unreadOnly: boolean },
  ) {
    await this.authorizeOwner(context, AUTHORIZATION_POLICY.VIEW_NOTIFICATION_INBOX);
    return this.repository.list({
      ...this.scope(context.actor),
      ...(input.cursor === undefined ? {} : { cursor: decodeCursor(input.cursor) }),
      limit: input.limit,
      unreadOnly: input.unreadOnly,
    });
  }

  async markRead(context: RequestContext, itemId: string) {
    await this.authorizeOwner(context, AUTHORIZATION_POLICY.VIEW_NOTIFICATION_INBOX, itemId);
    const result = await this.repository.markRead({
      ...this.scope(context.actor),
      itemId,
      readAt: new Date(),
    });
    if (result === null) throw new NotificationInboxNotFoundError();
    return result;
  }

  async markAllRead(context: RequestContext, limit: number) {
    await this.authorizeOwner(context, AUTHORIZATION_POLICY.VIEW_NOTIFICATION_INBOX);
    return this.repository.markAllRead({
      ...this.scope(context.actor),
      limit,
      readAt: new Date(),
    });
  }

  async listPreferences(context: RequestContext) {
    await this.authorizeOwner(context, AUTHORIZATION_POLICY.MANAGE_NOTIFICATION_PREFERENCES);
    return this.repository.listPreferences(context.actor.principalId);
  }

  async updateMarketingPreference(
    context: RequestContext,
    input: { enabled: boolean; expectedVersion: number },
  ): Promise<NotificationPreferenceResponse> {
    await this.authorizeOwner(context, AUTHORIZATION_POLICY.MANAGE_NOTIFICATION_PREFERENCES);
    const updated = await this.repository.updateMarketingPreference({
      ...input,
      principalId: context.actor.principalId,
      updatedAt: new Date(),
    });
    if (updated === null) throw new NotificationPreferenceConflictError();
    return updated;
  }

  private async authorizeOwner(
    context: RequestContext,
    policy:
      | typeof AUTHORIZATION_POLICY.VIEW_NOTIFICATION_INBOX
      | typeof AUTHORIZATION_POLICY.MANAGE_NOTIFICATION_PREFERENCES,
    resourceId = context.actor.principalId,
  ) {
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        recipientPrincipalId: context.actor.principalId,
        resourceId,
        resourceType: "notification_inbox",
      },
      policy,
      requestId: context.requestId,
    });
  }

  private scope(actor: CurrentSession): NotificationInboxScope {
    return {
      organizationIds: [...new Set(actor.memberships.map(({ organizationId }) => organizationId))],
      principalId: actor.principalId,
    };
  }
}

function decodeCursor(value: string): { createdAt: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("createdAt" in parsed) ||
      typeof parsed.createdAt !== "string" ||
      !("id" in parsed) ||
      typeof parsed.id !== "string"
    ) {
      throw new Error("invalid cursor");
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error("invalid cursor");
    return { createdAt, id: parsed.id };
  } catch {
    throw new InvalidNotificationCursorError("Invalid notification cursor");
  }
}
