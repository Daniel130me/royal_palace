import { Controller, Get, HttpException, Inject, Param, Query } from "@nestjs/common";
import type {
  PublicPractitionerDetail,
  PublicPractitionerListResponse,
  PublicProfessionListResponse,
  PublicSpecialtyListResponse,
} from "@royal-palace/contracts";
import { z } from "zod";

import { InvalidDiscoveryCursorError } from "../application/discovery-cursor.js";
import { MAX_PAGE_SIZE } from "../application/public-discovery.service.js";
import { PublicPractitionerDiscoveryService } from "../application/public-practitioner-discovery.service.js";

const catalogueCode = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(100);
const practitionerQuerySchema = z
  .object({
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    cursor: z.string().min(1).max(2048).optional(),
    language: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/)
      .max(35)
      .optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    location: z.string().trim().min(1).max(200).optional(),
    mode: z.enum(["VIDEO", "AUDIO", "CHAT", "IN_PERSON", "HOME_VISIT"]).optional(),
    profession: catalogueCode.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    specialty: catalogueCode.optional(),
  })
  .strict();
const practitionerIdSchema = z.uuid();
const emptyQuerySchema = z.object({}).strict();

@Controller("v1/public")
export class PublicPractitionerDiscoveryController {
  constructor(
    @Inject(PublicPractitionerDiscoveryService)
    private readonly discovery: PublicPractitionerDiscoveryService,
  ) {}

  @Get("professions")
  listProfessions(@Query() rawQuery: unknown): Promise<PublicProfessionListResponse> {
    parse(emptyQuerySchema, rawQuery);
    return this.discovery.listProfessions();
  }

  @Get("specialties")
  listSpecialties(@Query() rawQuery: unknown): Promise<PublicSpecialtyListResponse> {
    parse(emptyQuerySchema, rawQuery);
    return this.discovery.listSpecialties();
  }

  @Get("practitioners")
  listPractitioners(@Query() rawQuery: unknown): Promise<PublicPractitionerListResponse> {
    const query = parse(practitionerQuerySchema, rawQuery);
    return this.execute(() =>
      this.discovery.listPractitioners({
        cursor: query.cursor,
        filters: {
          countryCode: query.country,
          languageTag: query.language,
          location: query.location,
          professionCode: query.profession,
          query: query.q,
          serviceMode: query.mode,
          specialtyCode: query.specialty,
        },
        limit: query.limit,
      }),
    );
  }

  @Get("practitioners/:practitionerId")
  async findPractitioner(
    @Param("practitionerId") rawId: string,
  ): Promise<PublicPractitionerDetail> {
    const id = parse(practitionerIdSchema, rawId);
    const practitioner = await this.discovery.findPractitionerById(id);
    if (practitioner === null) {
      throw new HttpException(
        { error: "practitioner_not_found", message: "Practitioner was not found" },
        404,
      );
    }
    return practitioner;
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

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
  }
  return result.data;
}
