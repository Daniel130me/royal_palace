import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  ServicePricingFlowError,
  ServicePricingService,
} from "../application/service-pricing.service.js";

const idSchema = z.uuid();
const instantSchema = z.iso.datetime({ offset: true });
const createSchema = z
  .object({
    currency: z.string().regex(/^[A-Za-z]{3}$/),
    effectiveFrom: instantSchema,
    effectiveUntil: instantSchema.optional(),
    patientPriceMinor: z.string().regex(/^\d{1,19}$/),
    providerPayoutMinor: z.string().regex(/^\d{1,19}$/),
    serviceId: idSchema,
  })
  .strict();
const activateSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();

@Controller("v1/admin/service-prices")
@UseGuards(AuthenticatedInternalRequestGuard)
export class AdminServicePricingController {
  constructor(@Inject(ServicePricingService) private readonly pricing: ServicePricingService) {}

  @Get()
  list(@Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.pricing.list(context(request)));
  }

  @Post()
  create(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.pricing.create(context(request), parse(createSchema, body)));
  }

  @Post(":priceId/activate")
  activate(
    @Param("priceId") priceId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(activateSchema, body);
    return execute(() =>
      this.pricing.activate(context(request), parse(idSchema, priceId), input.expectedVersion),
    );
  }
}

function context(request: AuthenticatedInternalRequest) {
  const requestId = request.headers["x-request-id"];
  if (typeof requestId !== "string")
    throw new HttpException(
      { error: "missing_request_id", message: "Request ID is required" },
      400,
    );
  return { actor: request.currentSession, requestId };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
  return result.data;
}

async function execute<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ServicePricingFlowError)
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    if (error instanceof AuthorizationDeniedError)
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "P2002" || error.code === "P2004")
    ) {
      throw new HttpException(
        { error: "service_price_conflict", message: "The price conflicts with current data" },
        409,
      );
    }
    throw error;
  }
}
