import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { NotificationReplayResponse } from "@royal-palace/contracts";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  NotificationAdministrationService,
  NotificationDeliveryDisabledError,
} from "../application/notification-administration.service.js";
import { NotificationReplayConflictError } from "../infrastructure/prisma-notification-administration.repository.js";

const idSchema = z.uuid();
const replaySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

@Controller("v1/admin/notifications")
@UseGuards(AuthenticatedInternalRequestGuard)
export class NotificationAdministrationController {
  constructor(
    @Inject(NotificationAdministrationService)
    private readonly notifications: NotificationAdministrationService,
  ) {}

  @Post(":deliveryId/replay")
  async replay(
    @Param("deliveryId") rawDeliveryId: string,
    @Body() rawBody: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ): Promise<NotificationReplayResponse> {
    const deliveryId = parse(idSchema, rawDeliveryId);
    const body = parse(replaySchema, rawBody);
    const requestId = request.headers["x-request-id"];
    if (typeof requestId !== "string") {
      throw new HttpException(
        { error: "missing_request_id", message: "Request ID is required" },
        400,
      );
    }
    try {
      return await this.notifications.replay(
        {
          actor: request.currentSession,
          ...(typeof request.headers.traceparent === "string"
            ? { correlationId: request.headers.traceparent }
            : {}),
          requestId,
        },
        deliveryId,
        body.reason,
      );
    } catch (error) {
      if (error instanceof AuthorizationDeniedError) {
        throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
      }
      if (error instanceof NotificationReplayConflictError) {
        throw new HttpException(
          { error: "notification_replay_conflict", message: error.message },
          HttpStatus.CONFLICT,
        );
      }
      if (error instanceof NotificationDeliveryDisabledError) {
        throw new HttpException(
          { error: "notification_delivery_disabled", message: error.message },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw error;
    }
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
  }
  return result.data;
}
