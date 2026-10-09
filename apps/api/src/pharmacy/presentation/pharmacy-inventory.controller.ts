import {
  Body,
  Controller,
  Get,
  Headers,
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
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { PolicyProtected } from "../../authorization/presentation/policy-protected.decorator.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  PharmacyInventoryFlowError,
  PharmacyInventoryService,
} from "../application/pharmacy-inventory.service.js";
import { PharmacyInventoryConflictError } from "../domain/pharmacy-inventory.types.js";

const idSchema = z.uuid();
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  .transform((value) => value.toUpperCase());
const amountMinorSchema = z
  .string()
  .regex(/^\d{1,16}$/)
  .transform((value) => BigInt(value));
const quantitySchema = z.string().regex(/^(?:0*[1-9]\d{0,10})(?:\.\d{1,3})?$/);
const listSchema = z
  .object({
    categoryId: idSchema.optional(),
    cursor: z.string().trim().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    q: z.string().trim().min(2).max(120).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();
const classificationListSchema = z.object({ kind: z.enum(["CATEGORY", "DOSAGE_FORM"]) }).strict();
const locationListSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).strict();
const movementListSchema = z
  .object({
    catalogItemId: idSchema.optional(),
    cursor: z.string().trim().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    lotId: idSchema.optional(),
  })
  .strict();
const lotListSchema = z
  .object({
    catalogItemId: idSchema.optional(),
    cursor: z.string().trim().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    status: z.enum(["AVAILABLE", "QUARANTINED", "DEPLETED", "EXPIRED", "RECALLED"]).optional(),
  })
  .strict();
const createCatalogItemSchema = z
  .object({
    brandName: z.string().trim().min(1).max(160).optional(),
    categoryId: idSchema,
    controlledMedication: z.boolean().default(false),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .transform((value) => value.toUpperCase()),
    dosageFormId: idSchema,
    genericName: z.string().trim().min(1).max(240).optional(),
    lowStockThreshold: z.string().regex(/^\d{1,11}(?:\.\d{1,3})?$/),
    manufacturer: z.string().trim().min(1).max(200).optional(),
    medicationCode: z.string().trim().min(1).max(120).optional(),
    medicationCodeSystem: z.url().max(255).optional(),
    name: z.string().trim().min(2).max(240),
    nearExpiryDays: z.number().int().min(1).max(3650),
    prescriptionRequired: z.boolean().default(false),
    sku: codeSchema,
    storageRequirements: z.string().trim().min(1).max(500).optional(),
    strength: z.string().trim().min(1).max(120).optional(),
    unitPriceMinor: amountMinorSchema,
  })
  .strict()
  .refine(
    (input) => (input.medicationCode === undefined) === (input.medicationCodeSystem === undefined),
    { path: ["medicationCode"], message: "Medication code and system must be supplied together" },
  );
const updateCatalogItemSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    unitPriceMinor: amountMinorSchema.optional(),
  })
  .strict()
  .refine((input) => input.status !== undefined || input.unitPriceMinor !== undefined);
const createLocationSchema = z
  .object({ code: codeSchema, name: z.string().trim().min(2).max(120) })
  .strict();
const commonMovementSchema = z.object({
  catalogItemId: idSchema,
  idempotencyKey: z.string().trim().min(8).max(128),
  locationId: idSchema,
  quantity: quantitySchema,
  reasonCode: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    .transform((value) => value.toUpperCase()),
});
const movementSchema = z.discriminatedUnion("type", [
  commonMovementSchema
    .extend({
      batchNumber: z.string().trim().min(1).max(120),
      expiryDate: z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)),
      receivedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
      type: z.literal("RECEIVE"),
    })
    .strict(),
  commonMovementSchema
    .extend({
      expectedLotVersion: z.number().int().positive(),
      lotId: idSchema,
      type: z.enum(["ADJUST_IN", "ADJUST_OUT", "RETURN", "WRITE_OFF"]),
    })
    .strict(),
]);

@Controller("v1/pharmacy")
@UseGuards(AuthenticatedInternalRequestGuard)
export class PharmacyInventoryController {
  constructor(
    @Inject(PharmacyInventoryService) private readonly inventory: PharmacyInventoryService,
  ) {}

  @Get("catalog-items")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY)
  listCatalogItems(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    const input = parse(listSchema, query);
    return execute(() =>
      this.inventory.listCatalogItems(context(request), {
        categoryId: input.categoryId,
        cursor: input.cursor,
        limit: input.limit,
        pharmacyOrganizationId: parse(idSchema, organizationId),
        query: input.q,
        status: input.status,
      }),
    );
  }

  @Post("catalog-items")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY)
  createCatalogItem(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.inventory.createCatalogItem(context(request), {
        ...parse(createCatalogItemSchema, body),
        pharmacyOrganizationId: parse(idSchema, organizationId),
      }),
    );
  }

  @Get("catalog-items/:catalogItemId")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY)
  getCatalogItem(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Param("catalogItemId") catalogItemId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.inventory.getCatalogItem(
        context(request),
        parse(idSchema, organizationId),
        parse(idSchema, catalogItemId),
      ),
    );
  }

  @Patch("catalog-items/:catalogItemId")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY)
  updateCatalogItem(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Param("catalogItemId") catalogItemId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.inventory.updateCatalogItem(context(request), {
        ...parse(updateCatalogItemSchema, body),
        catalogItemId: parse(idSchema, catalogItemId),
        pharmacyOrganizationId: parse(idSchema, organizationId),
      }),
    );
  }

  @Get("product-classifications")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY)
  listClassifications(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.inventory.listClassifications(
        context(request),
        parse(idSchema, organizationId),
        parse(classificationListSchema, query).kind,
      ),
    );
  }

  @Get("inventory/locations")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY)
  listLocations(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.inventory.listLocations(context(request), {
        pharmacyOrganizationId: parse(idSchema, organizationId),
        status: parse(locationListSchema, query).status,
      }),
    );
  }

  @Post("inventory/locations")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY)
  createLocation(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.inventory.createLocation(context(request), {
        ...parse(createLocationSchema, body),
        pharmacyOrganizationId: parse(idSchema, organizationId),
      }),
    );
  }

  @Get("inventory/lots")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY)
  listLots(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.inventory.listLots(context(request), {
        ...parse(lotListSchema, query),
        pharmacyOrganizationId: parse(idSchema, organizationId),
      }),
    );
  }

  @Get("inventory/movements")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY)
  listMovements(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Query() query: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.inventory.listMovements(context(request), {
        ...parse(movementListSchema, query),
        pharmacyOrganizationId: parse(idSchema, organizationId),
      }),
    );
  }

  @Post("inventory/movements")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_PHARMACY_INVENTORY)
  recordMovement(
    @Headers("x-organization-id") organizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.inventory.recordMovement(context(request), {
        ...parse(movementSchema, body),
        pharmacyOrganizationId: parse(idSchema, organizationId),
      }),
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
    if (error instanceof PharmacyInventoryFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    if (error instanceof PharmacyInventoryConflictError || isDatabaseConflict(error)) {
      throw new HttpException(
        { error: "pharmacy_inventory_conflict", message: "Request conflicts with inventory data" },
        409,
      );
    }
    throw error;
  }
}

function isDatabaseConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2003" || error.code === "P2004")
  );
}
