import { Inject, Injectable } from "@nestjs/common";
import type {
  PublicPractitionerDetail,
  PublicPractitionerListResponse,
  PublicPractitionerSummary,
  PublicProfession,
  PublicSpecialty,
} from "@royal-palace/contracts";

import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import type {
  ListPractitionersQuery,
  PublicPractitionerDiscoveryRepository,
} from "../domain/public-practitioner-discovery.types.js";

const publicPractitionerSummarySelect = {
  displayName: true,
  id: true,
  languages: {
    orderBy: [{ languageTag: "asc" as const }, { id: "asc" as const }],
    select: { languageTag: true },
  },
  locations: {
    orderBy: [{ isPrimary: "desc" as const }, { label: "asc" as const }, { id: "asc" as const }],
    select: {
      administrativeArea: true,
      countryCode: true,
      id: true,
      label: true,
      locality: true,
      postalCode: true,
    },
    where: { isPublic: true, status: "ACTIVE" as const },
  },
  professions: {
    orderBy: [{ isPrimary: "desc" as const }, { profession: { name: "asc" as const } }],
    select: { profession: { select: { code: true, id: true, name: true } } },
    where: { profession: { status: "ACTIVE" as const } },
  },
  publicProfile: {
    select: {
      acceptingPatients: true,
      headline: true,
      slug: true,
      yearsExperience: true,
    },
  },
  serviceModes: {
    orderBy: [{ mode: "asc" as const }, { id: "asc" as const }],
    select: { mode: true },
  },
  specialties: {
    orderBy: [{ isPrimary: "desc" as const }, { specialty: { name: "asc" as const } }],
    select: {
      specialty: { select: { category: true, code: true, id: true, name: true } },
    },
    where: { specialty: { status: "ACTIVE" as const } },
  },
} satisfies Prisma.PractitionerSelect;

const publicPractitionerDetailSelect = {
  ...publicPractitionerSummarySelect,
  affiliations: {
    orderBy: [{ facilityName: "asc" as const }, { id: "asc" as const }],
    select: { facilityName: true, roleTitle: true },
    where: { isPublic: true },
  },
  publicCredentials: {
    orderBy: [{ title: "asc" as const }, { id: "asc" as const }],
    select: { awardedYear: true, issuerName: true, jurisdictionCode: true, title: true },
    where: { isPublic: true, verifiedAt: { not: null } },
  },
  publicProfile: {
    select: {
      acceptingPatients: true,
      biography: true,
      headline: true,
      slug: true,
      yearsExperience: true,
    },
  },
} satisfies Prisma.PractitionerSelect;

type PublicPractitionerSummaryRecord = Prisma.PractitionerGetPayload<{
  select: typeof publicPractitionerSummarySelect;
}>;
type PublicPractitionerDetailRecord = Prisma.PractitionerGetPayload<{
  select: typeof publicPractitionerDetailSelect;
}>;

@Injectable()
export class PrismaPublicPractitionerDiscoveryRepository implements PublicPractitionerDiscoveryRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async listProfessions(): Promise<readonly PublicProfession[]> {
    return this.database.professionTaxonomy.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { code: true, id: true, name: true },
      where: { status: "ACTIVE" },
    });
  }

  async listSpecialties(): Promise<readonly PublicSpecialty[]> {
    return this.database.specialtyTaxonomy.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
      select: { category: true, code: true, id: true, name: true },
      where: { status: "ACTIVE" },
    });
  }

  async listPractitioners(query: ListPractitionersQuery): Promise<PublicPractitionerListResponse> {
    const records = await this.database.practitioner.findMany({
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      relationLoadStrategy: "join",
      select: publicPractitionerSummarySelect,
      take: query.limit + 1,
      where: practitionerWhere(query),
    });
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    return {
      data: page.map(mapPractitionerSummary),
      pageInfo: { endCursor: hasNextPage ? "pending" : null, hasNextPage },
    };
  }

  async findPractitionerById(id: string): Promise<PublicPractitionerDetail | null> {
    const record = await this.database.practitioner.findFirst({
      relationLoadStrategy: "join",
      select: publicPractitionerDetailSelect,
      where: { id, ...basePublicPractitionerWhere() },
    });
    return record === null ? null : mapPractitionerDetail(record);
  }
}

function basePublicPractitionerWhere() {
  return {
    verificationStatus: "VERIFIED" as const,
    publicProfile: { is: { status: "PUBLISHED" as const } },
  };
}

function practitionerWhere(query: ListPractitionersQuery): Prisma.PractitionerWhereInput {
  const basePublicLocationFilter = {
    isPublic: true,
    status: "ACTIVE" as const,
    ...(query.countryCode === undefined ? {} : { countryCode: query.countryCode }),
  };
  return {
    ...basePublicPractitionerWhere(),
    ...(query.countryCode === undefined && query.location === undefined
      ? {}
      : {
          locations: {
            some: {
              ...basePublicLocationFilter,
              ...(query.location === undefined
                ? {}
                : { OR: publicLocationTextPredicates(query.location) }),
            },
          },
        }),
    ...(query.languageTag === undefined
      ? {}
      : {
          languages: {
            some: { languageTag: { equals: query.languageTag, mode: "insensitive" as const } },
          },
        }),
    ...(query.professionCode === undefined
      ? {}
      : {
          professions: {
            some: { profession: { code: query.professionCode, status: "ACTIVE" as const } },
          },
        }),
    ...(query.specialtyCode === undefined
      ? {}
      : {
          specialties: {
            some: { specialty: { code: query.specialtyCode, status: "ACTIVE" as const } },
          },
        }),
    ...(query.serviceMode === undefined
      ? {}
      : { serviceModes: { some: { mode: query.serviceMode } } }),
    ...(query.query === undefined
      ? {}
      : {
          OR: [
            { displayName: { contains: query.query, mode: "insensitive" as const } },
            {
              publicProfile: {
                is: { headline: { contains: query.query, mode: "insensitive" as const } },
              },
            },
            {
              professions: {
                some: {
                  profession: {
                    name: { contains: query.query, mode: "insensitive" as const },
                    status: "ACTIVE" as const,
                  },
                },
              },
            },
            {
              specialties: {
                some: {
                  specialty: {
                    name: { contains: query.query, mode: "insensitive" as const },
                    status: "ACTIVE" as const,
                  },
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

function mapPractitionerSummary(
  record: PublicPractitionerSummaryRecord,
): PublicPractitionerSummary {
  if (record.publicProfile === null)
    throw new Error("Published practitioner is missing a public profile");
  return {
    acceptingPatients: record.publicProfile.acceptingPatients,
    displayName: record.displayName,
    headline: record.publicProfile.headline,
    id: record.id,
    languages: record.languages.map(({ languageTag }) => languageTag),
    locations: record.locations,
    professions: record.professions.map(({ profession }) => profession),
    serviceModes: record.serviceModes.map(({ mode }) => mode),
    slug: record.publicProfile.slug,
    specialties: record.specialties.map(({ specialty }) => specialty),
    yearsExperience: record.publicProfile.yearsExperience,
  };
}

function mapPractitionerDetail(record: PublicPractitionerDetailRecord): PublicPractitionerDetail {
  if (record.publicProfile === null)
    throw new Error("Published practitioner is missing a public profile");
  return {
    ...mapPractitionerSummary(record),
    affiliations: record.affiliations,
    biography: record.publicProfile.biography,
    credentials: record.publicCredentials,
  };
}
