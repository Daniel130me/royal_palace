import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  PharmacySettingsConflictError,
  PharmacySettingsNotFoundError,
  PharmacySettingsService,
} from "../application/pharmacy-settings.service.js";

const idSchema = z.uuid();
const updateSchema = z
  .object({
    deliveryEnabled: z.boolean(),
    expectedVersion: z.number().int().min(0),
    pickupEnabled: z.boolean(),
    preparationTargetMinutes: z.number().int().min(5).max(10_080),
  })
  .strict()
  .refine((value) => value.deliveryEnabled || value.pickupEnabled, {
    message: "At least one fulfilment method is required",
  });

@Controller("v1/pharmacy/settings")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PharmacySettingsController {
  constructor(
    @Inject(PharmacySettingsService) private readonly settings: PharmacySettingsService,
  ) {}

  @Get()
  get(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() => this.settings.get(context(request), parse(idSchema, organizationId)));
  }

  @Patch()
  update(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.settings.update(
        context(request),
        parse(idSchema, organizationId),
        parse(updateSchema, body),
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
    if (error instanceof PharmacySettingsNotFoundError) {
      throw new HttpException(
        { error: "pharmacy_not_found", message: "Pharmacy was not found" },
        404,
      );
    }
    if (error instanceof PharmacySettingsConflictError) {
      throw new HttpException(
        { error: "pharmacy_settings_conflict", message: "Settings changed" },
        409,
      );
    }
    throw error;
  }
}
