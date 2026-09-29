import { Inject, Injectable } from "@nestjs/common";
import type {
  PublicFacilityLocation,
  PublicOrganizationDetail,
  PublicOrganizationListResponse,
  PublicOrganizationSummary,
  PublicOrganizationType,
  PublicService,
} from "@royal-palace/contracts";

import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import type {
  ListOrganizationsQuery,
  PublicDiscoveryRepository,
} from "../domain/public-discovery.types.js";

const publicOrganizationSelect = {
  displayName: true,
  id: true,
  type: true,
  facilityLocations: {
    orderBy: [{ isPrimary: "desc" as const }, { label: "asc" as const }, { id: "asc" as const }],
    select: {
      addressLine1: true,
      addressLine2: true,
      city: true,
      countryCode: true,
      id: true,
      label: true,
      publicPhone: true,
      state: true,
    },
    where: { isPublic: true, status: "ACTIVE" as const },
  },
  organizationServices: {
    orderBy: [{ service: { name: "asc" as const } }, { id: "asc" as const }],
    select: { service: { select: { category: true, code: true, id: true, name: true } } },
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

  async listOrganizations(query: ListOrganizationsQuery): Promise<PublicOrganizationListResponse> {
    const records = await this.database.organization.findMany({
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
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
      select: publicOrganizationSelect,
      where: { id, ...basePublicOrganizationWhere(organizationType) },
    });
    return record === null ? null : mapOrganizationDetail(record);
  }
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
  const locationFilter = {
    isPublic: true,
    status: "ACTIVE" as const,
    ...(query.city === undefined
      ? {}
      : { city: { equals: query.city, mode: "insensitive" as const } }),
    ...(query.state === undefined
      ? {}
      : { state: { equals: query.state, mode: "insensitive" as const } }),
  };
  const filters = {
    ...basePublicOrganizationWhere(query.organizationType),
    facilityLocations: { some: locationFilter },
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
                  ...locationFilter,
                  city: { contains: query.query, mode: "insensitive" as const },
                },
              },
            },
            {
              facilityLocations: {
                some: {
                  ...locationFilter,
                  state: { contains: query.query, mode: "insensitive" as const },
                },
              },
            },
            {
              facilityLocations: {
                some: {
                  ...locationFilter,
                  addressLine1: { contains: query.query, mode: "insensitive" as const },
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

function mapOrganizationSummary(record: PublicOrganizationRecord): PublicOrganizationSummary {
  if (record.publicProfile === null)
    throw new Error("Published organization is missing its public profile");
  return {
    acceptingPatients: record.publicProfile.acceptingPatients,
    displayName: record.displayName,
    emergencyAvailable: record.publicProfile.emergencyAvailable,
    id: record.id,
    locations: record.facilityLocations as PublicFacilityLocation[],
    openTwentyFourHours: record.publicProfile.openTwentyFourHours,
    organizationType: record.type,
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
