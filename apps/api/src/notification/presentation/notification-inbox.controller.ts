import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  InvalidNotificationCursorError,
  NotificationInboxNotFoundError,
  NotificationInboxService,
  NotificationPreferenceConflictError,
} from "../application/notification-inbox.service.js";

const idSchema = z.uuid();
const listSchema = z
  .object({
    cursor: z.string().trim().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    unreadOnly: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  })
  .strict();
const markAllSchema = z.object({ limit: z.number().int().min(1).max(200).default(200) }).strict();
const marketingPreferenceSchema = z
  .object({ enabled: z.boolean(), expectedVersion: z.number().int().min(0) })
  .strict();

@Controller("v1/notifications")
@UseGuards(AuthenticatedInternalRequestGuard)
export class NotificationInboxController {
  constructor(
    @Inject(NotificationInboxService) private readonly notifications: NotificationInboxService,
  ) {}

  @Get()
  list(@Query() query: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.notifications.list(context(request), parse(listSchema, query)));
  }

  @Post(":itemId/read")
  markRead(@Param("itemId") itemId: string, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.notifications.markRead(context(request), parse(idSchema, itemId)));
  }

  @Post("read-all")
  markAllRead(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    const { limit } = parse(markAllSchema, body);
    return execute(() => this.notifications.markAllRead(context(request), limit));
  }

  @Get("preferences")
  listPreferences(@Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.notifications.listPreferences(context(request)));
  }

  @Patch("preferences/email/marketing")
  updateMarketingPreference(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() =>
      this.notifications.updateMarketingPreference(
        context(request),
        parse(marketingPreferenceSchema, body),
      ),
    );
  }
}

function context(request: AuthenticatedInternalRequest) {
  const requestId = request.headers["x-request-id"];
  if (typeof requestId !== "string") {
    throw new HttpException(
      { error: "missing_request_id", message: "Request ID is required" },
      400,
    );
  }
  return { actor: request.currentSession, requestId };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
  }
  return result.data;
}

async function execute<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    if (error instanceof InvalidNotificationCursorError) {
      throw new HttpException(
        { error: "invalid_notification_cursor", message: "Notification cursor is invalid" },
        400,
      );
    }
    if (error instanceof NotificationInboxNotFoundError) {
      throw new HttpException(
        { error: "notification_not_found", message: "Notification was not found" },
        404,
      );
    }
    if (error instanceof NotificationPreferenceConflictError) {
      throw new HttpException(
        { error: "notification_preference_conflict", message: "Preference changed" },
        409,
      );
    }
    throw error;
  }
}
