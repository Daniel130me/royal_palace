import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const SYNTHETIC_ISSUER = "https://identity.synthetic.invalid";
const SYNTHETIC_SUPPORT_ROLE_ID = "0199a18e-a400-7000-8000-000000000001";
const SYNTHETIC_SERVICES = [
  {
    id: "0199a18e-a400-7000-8000-000000000101",
    code: "emergency-care",
    name: "Emergency Care",
    category: "Urgent Care",
  },
  {
    id: "0199a18e-a400-7000-8000-000000000102",
    code: "general-medicine",
    name: "General Medicine",
    category: "Outpatient Care",
  },
  {
    id: "0199a18e-a400-7000-8000-000000000103",
    code: "maternal-care",
    name: "Maternal Care",
    category: "Women and Children",
  },
  {
    id: "0199a18e-a400-7000-8000-000000000104",
    code: "prescription-dispensing",
    name: "Prescription Dispensing",
    category: "Pharmacy Services",
  },
  {
    id: "0199a18e-a400-7000-8000-000000000105",
    code: "diagnostic-testing",
    name: "Diagnostic Testing",
    category: "Laboratory Services",
  },
] as const;
const SYNTHETIC_ORGANIZATIONS = [
  {
    id: "0199a18e-a400-7000-8000-000000000201",
    locationId: "0199a18e-a400-7000-8000-000000000211",
    slug: "synthetic-lagoon-hospital",
    displayName: "Synthetic Lagoon Hospital",
    locality: "Ikeja",
    administrativeArea: "Lagos",
    postalCode: "100001",
    countryCode: "NG",
    addressLine1: "1 Example Health Avenue",
    emergencyAvailable: true,
    openTwentyFourHours: true,
    type: "HOSPITAL" as const,
    services: [
      {
        code: "emergency-care",
        facilityServiceId: "0199a18e-a400-7000-8000-000000000411",
        offeringId: "0199a18e-a400-7000-8000-000000000311",
      },
      {
        code: "general-medicine",
        facilityServiceId: "0199a18e-a400-7000-8000-000000000412",
        offeringId: "0199a18e-a400-7000-8000-000000000312",
      },
    ],
  },
  {
    id: "0199a18e-a400-7000-8000-000000000202",
    locationId: "0199a18e-a400-7000-8000-000000000212",
    slug: "synthetic-family-hospital",
    displayName: "Synthetic Family Hospital",
    locality: "Zurich",
    administrativeArea: null,
    postalCode: "8001",
    countryCode: "CH",
    addressLine1: "2 Example Care Strasse",
    emergencyAvailable: false,
    openTwentyFourHours: false,
    type: "HOSPITAL" as const,
    services: [
      {
        code: "general-medicine",
        facilityServiceId: "0199a18e-a400-7000-8000-000000000421",
        offeringId: "0199a18e-a400-7000-8000-000000000321",
      },
      {
        code: "maternal-care",
        facilityServiceId: "0199a18e-a400-7000-8000-000000000422",
        offeringId: "0199a18e-a400-7000-8000-000000000322",
      },
    ],
  },
  {
    id: "0199a18e-a400-7000-8000-000000000203",
    locationId: "0199a18e-a400-7000-8000-000000000213",
    slug: "synthetic-community-pharmacy",
    displayName: "Synthetic Community Pharmacy",
    locality: "Toronto",
    administrativeArea: "Ontario",
    postalCode: "M5V 1A1",
    countryCode: "CA",
    addressLine1: "3 Example Pharmacy Street",
    emergencyAvailable: false,
    openTwentyFourHours: true,
    type: "PHARMACY" as const,
    services: [
      {
        code: "prescription-dispensing",
        facilityServiceId: "0199a18e-a400-7000-8000-000000000431",
        offeringId: "0199a18e-a400-7000-8000-000000000331",
      },
    ],
  },
  {
    id: "0199a18e-a400-7000-8000-000000000204",
    locationId: "0199a18e-a400-7000-8000-000000000214",
    slug: "synthetic-diagnostic-laboratory",
    displayName: "Synthetic Diagnostic Laboratory",
    locality: "Singapore",
    administrativeArea: null,
    postalCode: "018956",
    countryCode: "SG",
    addressLine1: "4 Example Diagnostic Way",
    emergencyAvailable: false,
    openTwentyFourHours: false,
    type: "LABORATORY" as const,
    services: [
      {
        code: "diagnostic-testing",
        facilityServiceId: "0199a18e-a400-7000-8000-000000000441",
        offeringId: "0199a18e-a400-7000-8000-000000000341",
      },
    ],
  },
] as const;

function assertSyntheticSeedIsAllowed(): void {
  if (process.env.APP_ENV === "production") {
    throw new Error("Synthetic seed is permanently disabled in production");
  }

  if (process.env.ALLOW_SYNTHETIC_SEED !== "true") {
    throw new Error("Set ALLOW_SYNTHETIC_SEED=true to load synthetic development data");
  }
}

async function main(): Promise<void> {
  assertSyntheticSeedIsAllowed();
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) throw new Error("DATABASE_URL is required");

  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const externalIdentity = await database.externalIdentity.findUnique({
      where: {
        issuer_subject: {
          issuer: SYNTHETIC_ISSUER,
          subject: "support-reviewer",
        },
      },
      select: { principalId: true },
    });
    const principal =
      externalIdentity === null
        ? await database.identityPrincipal.create({
            data: {
              id: createOpaqueId(),
              externalIdentities: {
                create: {
                  id: createOpaqueId(),
                  issuer: SYNTHETIC_ISSUER,
                  subject: "support-reviewer",
                },
              },
            },
            select: { id: true },
          })
        : { id: externalIdentity.principalId };

    await database.roleAssignment.upsert({
      where: { id: SYNTHETIC_SUPPORT_ROLE_ID },
      create: {
        id: SYNTHETIC_SUPPORT_ROLE_ID,
        principalId: principal.id,
        role: "SUPPORT",
        scope: "PLATFORM",
      },
      update: {},
      select: { id: true },
    });
    await seedPublicDiscovery(database);
  } finally {
    await database.$disconnect();
  }
}

async function seedPublicDiscovery(database: PrismaClient): Promise<void> {
  for (const service of SYNTHETIC_SERVICES) {
    await database.serviceTaxonomy.upsert({
      where: { code: service.code },
      create: { ...service },
      update: { category: service.category, name: service.name, status: "ACTIVE" },
      select: { id: true },
    });
  }

  for (const organization of SYNTHETIC_ORGANIZATIONS) {
    await database.organization.upsert({
      where: { id: organization.id },
      create: {
        id: organization.id,
        type: organization.type,
        legalName: `${organization.displayName} Limited`,
        displayName: organization.displayName,
        verificationStatus: "VERIFIED",
        verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      update: {
        displayName: organization.displayName,
        status: "ACTIVE",
        verificationStatus: "VERIFIED",
        verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      select: { id: true },
    });
    await database.organizationPublicProfile.upsert({
      where: { organizationId: organization.id },
      create: {
        organizationId: organization.id,
        slug: organization.slug,
        status: "PUBLISHED",
        summary: "Synthetic demonstration profile. Not a real healthcare provider.",
        acceptingPatients: true,
        emergencyAvailable: organization.emergencyAvailable,
        openTwentyFourHours: organization.openTwentyFourHours,
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      update: {
        acceptingPatients: true,
        emergencyAvailable: organization.emergencyAvailable,
        openTwentyFourHours: organization.openTwentyFourHours,
        status: "PUBLISHED",
      },
      select: { organizationId: true },
    });
    await database.facilityLocation.upsert({
      where: { id: organization.locationId },
      create: {
        id: organization.locationId,
        organizationId: organization.id,
        label: "Main facility",
        addressLine1: organization.addressLine1,
        administrativeArea: organization.administrativeArea,
        countryCode: organization.countryCode,
        isPrimary: true,
        isPublic: true,
        locality: organization.locality,
        postalCode: organization.postalCode,
      },
      update: {
        addressLine1: organization.addressLine1,
        administrativeArea: organization.administrativeArea,
        countryCode: organization.countryCode,
        isPublic: true,
        locality: organization.locality,
        postalCode: organization.postalCode,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    for (const organizationService of organization.services) {
      const service = SYNTHETIC_SERVICES.find(
        (candidate) => candidate.code === organizationService.code,
      );
      if (service === undefined)
        throw new Error(`Unknown synthetic service: ${organizationService.code}`);
      await database.organizationService.upsert({
        where: {
          organizationId_serviceId: { organizationId: organization.id, serviceId: service.id },
        },
        create: {
          id: organizationService.offeringId,
          organizationId: organization.id,
          serviceId: service.id,
        },
        update: { status: "ACTIVE" },
        select: { id: true },
      });
      await database.facilityService.upsert({
        where: {
          locationId_organizationServiceId: {
            locationId: organization.locationId,
            organizationServiceId: organizationService.offeringId,
          },
        },
        create: {
          id: organizationService.facilityServiceId,
          locationId: organization.locationId,
          organizationId: organization.id,
          organizationServiceId: organizationService.offeringId,
        },
        update: { status: "ACTIVE" },
        select: { id: true },
      });
    }
  }
}

await main();
