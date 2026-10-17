import { Inject, Injectable } from "@nestjs/common";
import type {
  PublicFacilityLocation,
  PublicOrganizationDetail,
  PublicOrganizationListResponse,
  PublicOrganizationSummary,
  PublicOrganizationType,
  PublicService,
  PublicServicePrice,
  PublicServicePriceListResponse,
} from "@royal-palace/contracts";

import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { requirePublicOrganizationType } from "../../platform/organization-types.js";
import type {
  ListOrganizationsQuery,
  ListPublicServicePricesQuery,
  PublicDiscoveryRepository,
} from "../domain/public-discovery.types.js";

const publicOrganizationSelect = {
  displayName: true,
  id: true,
  type: true,
  facilityLocations: {
    orderBy: [{ isPrimary: "desc" as const }, { label: "asc" as const }, { id: "asc" as const }],
    select: {
      administrativeArea: true,
      addressLine1: true,
      addressLine2: true,
      countryCode: true,
      id: true,
      label: true,
      locality: true,
      postalCode: true,
      publicPhone: true,
    },
    where: { isPublic: true, status: "ACTIVE" as const },
  },
  organizationServices: {
    orderBy: [{ service: { name: "asc" as const } }, { id: "asc" as const }],
    select: {
      service: { select: { category: true, code: true, id: true, name: true } },
      supportsHomeCollection: true,
    },
    where: {
      ...availableAtPublicFacilityWhere(),
      status: "ACTIVE" as const,
      service: { status: "ACTIVE" as const },
    },
  },
  publicProfile: {
    select: {
      acceptingPatients: true,
      emergencyAvailable: true,
      openTwentyFourHours: true,
      slug: true,
      summary: true,
      websiteUrl: true,
    },
  },
  ratingSummary: { select: { ratingCount: true, ratingSum: true } },
} satisfies Prisma.OrganizationSelect;

type PublicOrganizationRecord = Prisma.OrganizationGetPayload<{
  select: typeof publicOrganizationSelect;
}>;

@Injectable()
export class PrismaPublicDiscoveryRepository implements PublicDiscoveryRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async listServices(organizationType: PublicOrganizationType): Promise<readonly PublicService[]> {
    return this.database.serviceTaxonomy.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
      select: { category: true, code: true, id: true, name: true },
      where: {
        status: "ACTIVE",
        organizationServices: { some: publicOrganizationOfferingWhere(organizationType) },
      },
    });
  }

  async listServicePrices(
    query: ListPublicServicePricesQuery,
  ): Promise<PublicServicePriceListResponse> {
    const records = await this.database.servicePrice.findMany({
      orderBy: [{ service: { name: "asc" } }, { id: "asc" }],
      select: {
        currency: true,
        effectiveFrom: true,
        effectiveUntil: true,
        id: true,
        patientPriceMinor: true,
        service: { select: { category: true, code: true, id: true, name: true } },
      },
      take: query.limit + 1,
      where: {
        effectiveFrom: { lte: query.effectiveAt },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: query.effectiveAt } }],
        service: { status: "ACTIVE" },
        status: "ACTIVE",
        ...(query.cursor === undefined
          ? {}
          : {
              AND: [
                {
                  OR: [
                    { service: { name: { gt: query.cursor.displayName } } },
                    {
                      id: { gt: query.cursor.id },
                      service: { name: query.cursor.displayName },
                    },
                  ],
                },
              ],
            }),
      },
    });
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    return {
      data: page.map(mapPublicServicePrice),
      pageInfo: {
        endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
        hasNextPage,
      },
    };
  }

  async listOrganizations(query: ListOrganizationsQuery): Promise<PublicOrganizationListResponse> {
    const records = await this.database.organization.findMany({
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      relationLoadStrategy: "join",
      select: publicOrganizationSelect,
      take: query.limit + 1,
      where: organizationWhere(query),
    });
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    return {
      data: page.map(mapOrganizationSummary),
      pageInfo: { endCursor: hasNextPage ? "pending" : null, hasNextPage },
    };
  }

  async findOrganizationById(
    id: string,
    organizationType: PublicOrganizationType,
  ): Promise<PublicOrganizationDetail | null> {
    const record = await this.database.organization.findFirst({
      relationLoadStrategy: "join",
      select: publicOrganizationSelect,
      where: { id, ...basePublicOrganizationWhere(organizationType) },
    });
    return record === null ? null : mapOrganizationDetail(record);
  }
}

function mapPublicServicePrice(record: {
  currency: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  patientPriceMinor: bigint;
  service: PublicService;
}): PublicServicePrice {
  return {
    currency: record.currency,
    effectiveFrom: record.effectiveFrom.toISOString(),
    effectiveUntil: record.effectiveUntil?.toISOString() ?? null,
    patientPriceMinor: record.patientPriceMinor.toString(),
    service: record.service,
  };
}

function basePublicOrganizationWhere(organizationType: PublicOrganizationType) {
  return {
    facilityLocations: { some: { isPublic: true, status: "ACTIVE" as const } },
    publicProfile: { is: { status: "PUBLISHED" as const } },
    status: "ACTIVE" as const,
    type: organizationType,
    verificationStatus: "VERIFIED" as const,
  };
}

function publicOrganizationOfferingWhere(organizationType: PublicOrganizationType) {
  return {
    ...availableAtPublicFacilityWhere(),
    organization: basePublicOrganizationWhere(organizationType),
    status: "ACTIVE" as const,
  };
}

function availableAtPublicFacilityWhere() {
  return {
    facilityServices: {
      some: {
        location: { isPublic: true, status: "ACTIVE" as const },
        status: "ACTIVE" as const,
      },
    },
  };
}

function organizationWhere(query: ListOrganizationsQuery) {
  const basePublicLocationFilter = {
    isPublic: true,
    status: "ACTIVE" as const,
    ...(query.countryCode === undefined ? {} : { countryCode: query.countryCode }),
  };
  const publicLocationFilter = {
    ...basePublicLocationFilter,
    ...(query.location === undefined
      ? {}
      : {
          OR: publicLocationTextPredicates(query.location),
        }),
  };
  const filters = {
    ...basePublicOrganizationWhere(query.organizationType),
    facilityLocations: { some: publicLocationFilter },
    ...(query.emergencyAvailable === undefined
      ? {}
      : {
          publicProfile: {
            is: { status: "PUBLISHED" as const, emergencyAvailable: query.emergencyAvailable },
          },
        }),
    ...(query.openTwentyFourHours === undefined
      ? {}
      : {
          publicProfile: {
            is: { status: "PUBLISHED" as const, openTwentyFourHours: query.openTwentyFourHours },
          },
        }),
    ...(query.serviceCode === undefined
      ? {}
      : {
          organizationServices: {
            some: {
              ...availableAtPublicFacilityWhere(),
              service: { code: query.serviceCode, status: "ACTIVE" as const },
              status: "ACTIVE" as const,
            },
          },
        }),
    ...(query.query === undefined
      ? {}
      : {
          OR: [
            { displayName: { contains: query.query, mode: "insensitive" as const } },
            {
              publicProfile: {
                is: { summary: { contains: query.query, mode: "insensitive" as const } },
              },
            },
            {
              facilityLocations: {
                some: {
                  ...basePublicLocationFilter,
                  OR: publicLocationTextPredicates(query.query),
                },
              },
            },
            {
              organizationServices: {
                some: {
                  ...availableAtPublicFacilityWhere(),
                  service: { name: { contains: query.query, mode: "insensitive" as const } },
                  status: "ACTIVE" as const,
                },
              },
            },
          ],
        }),
    ...(query.cursor === undefined
      ? {}
      : {
          AND: [
            {
              OR: [
                { displayName: { gt: query.cursor.displayName } },
                { displayName: query.cursor.displayName, id: { gt: query.cursor.id } },
              ],
            },
          ],
        }),
  };
  return filters;
}

function publicLocationTextPredicates(value: string) {
  const contains = { contains: value, mode: "insensitive" as const };
  return [
    { addressLine1: contains },
    { addressLine2: contains },
    { administrativeArea: contains },
    { locality: contains },
    { postalCode: contains },
  ];
}

function mapOrganizationSummary(record: PublicOrganizationRecord): PublicOrganizationSummary {
  if (record.publicProfile === null)
    throw new Error("Published organization is missing its public profile");
  return {
    acceptingPatients: record.publicProfile.acceptingPatients,
    displayName: record.displayName,
    emergencyAvailable: record.publicProfile.emergencyAvailable,
    homeCollectionServiceCodes: record.organizationServices
      .filter((offering) => offering.supportsHomeCollection)
      .map((offering) => offering.service.code),
    id: record.id,
    locations: record.facilityLocations as PublicFacilityLocation[],
    openTwentyFourHours: record.publicProfile.openTwentyFourHours,
    organizationType: requirePublicOrganizationType(record.type),
    rating: {
      averageScore:
        record.ratingSummary === null || record.ratingSummary.ratingCount === 0
          ? null
          : record.ratingSummary.ratingSum / record.ratingSummary.ratingCount,
      reviewCount: record.ratingSummary?.ratingCount ?? 0,
    },
    services: record.organizationServices.map((offering) => offering.service),
    slug: record.publicProfile.slug,
    summary: record.publicProfile.summary,
  };
}

function mapOrganizationDetail(record: PublicOrganizationRecord): PublicOrganizationDetail {
  if (record.publicProfile === null)
    throw new Error("Published organization is missing its public profile");
  return { ...mapOrganizationSummary(record), websiteUrl: record.publicProfile.websiteUrl };
}
