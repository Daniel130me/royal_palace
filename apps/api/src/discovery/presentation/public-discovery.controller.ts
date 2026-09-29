import { Controller, Get, HttpException, Inject, Param, Query } from "@nestjs/common";
import type {
  PublicOrganizationDetail,
  PublicOrganizationListResponse,
  PublicOrganizationType,
  PublicServiceListResponse,
} from "@royal-palace/contracts";
import { z } from "zod";

import {
  InvalidDiscoveryCursorError,
  MAX_PAGE_SIZE,
  PublicDiscoveryService,
} from "../application/public-discovery.service.js";

const optionalBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();
const querySchema = z
  .object({
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    cursor: z.string().min(1).max(2048).optional(),
    emergencyAvailable: optionalBoolean,
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    location: z.string().trim().min(1).max(200).optional(),
    openTwentyFourHours: optionalBoolean,
    q: z.string().trim().min(1).max(100).optional(),
    service: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80)
      .optional(),
  })
  .strict();
const hospitalIdSchema = z.uuid();
const serviceQuerySchema = z
  .object({ organizationType: z.enum(["HOSPITAL", "PHARMACY", "LABORATORY"]).default("HOSPITAL") })
  .strict();

@Controller("v1/public")
export class PublicDiscoveryController {
  constructor(@Inject(PublicDiscoveryService) private readonly discovery: PublicDiscoveryService) {}

  @Get("services")
  listServices(@Query() rawQuery: unknown): Promise<PublicServiceListResponse> {
    const query = parse(serviceQuerySchema, rawQuery);
    return this.discovery.listServices(query.organizationType);
  }

  @Get("hospitals")
  listHospitals(@Query() rawQuery: unknown): Promise<PublicOrganizationListResponse> {
    return this.listOrganizations(rawQuery, "HOSPITAL");
  }

  @Get("pharmacies")
  listPharmacies(@Query() rawQuery: unknown): Promise<PublicOrganizationListResponse> {
    return this.listOrganizations(rawQuery, "PHARMACY");
  }

  @Get("laboratories")
  listLaboratories(@Query() rawQuery: unknown): Promise<PublicOrganizationListResponse> {
    return this.listOrganizations(rawQuery, "LABORATORY");
  }

  @Get("hospitals/:hospitalId")
  findHospital(@Param("hospitalId") rawId: string): Promise<PublicOrganizationDetail> {
    return this.findOrganization(rawId, "HOSPITAL", "hospital");
  }

  @Get("pharmacies/:organizationId")
  findPharmacy(@Param("organizationId") rawId: string): Promise<PublicOrganizationDetail> {
    return this.findOrganization(rawId, "PHARMACY", "pharmacy");
  }

  @Get("laboratories/:organizationId")
  findLaboratory(@Param("organizationId") rawId: string): Promise<PublicOrganizationDetail> {
    return this.findOrganization(rawId, "LABORATORY", "laboratory");
  }

  private listOrganizations(
    rawQuery: unknown,
    organizationType: PublicOrganizationType,
  ): Promise<PublicOrganizationListResponse> {
    const query = parse(querySchema, rawQuery);
    return this.execute(() =>
      this.discovery.listOrganizations({
        cursor: query.cursor,
        filters: {
          countryCode: query.country,
          emergencyAvailable: query.emergencyAvailable,
          location: query.location,
          openTwentyFourHours: query.openTwentyFourHours,
          query: query.q,
          serviceCode: query.service,
        },
        limit: query.limit,
        organizationType,
      }),
    );
  }

  private async findOrganization(
    rawId: string,
    organizationType: PublicOrganizationType,
    resourceName: string,
  ): Promise<PublicOrganizationDetail> {
    const id = parse(hospitalIdSchema, rawId);
    const organization = await this.discovery.findOrganizationById(id, organizationType);
    if (organization === null) {
      throw new HttpException(
        {
          error: `${resourceName}_not_found`,
          message: `${capitalize(resourceName)} was not found`,
        },
        404,
      );
    }
    return organization;
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof InvalidDiscoveryCursorError) {
        throw new HttpException({ error: "invalid_cursor", message: error.message }, 400);
      }
      throw error;
    }
  }
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
  }
  return result.data;
}
