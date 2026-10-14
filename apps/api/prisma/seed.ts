import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { SYNTHETIC_IDENTITY_ACCOUNTS } from "../scripts/synthetic-identity/accounts.js";
import { PROFESSION_SEEDS, SPECIALTY_SEEDS } from "./seed-data/practitioner-catalogues.js";

const SYNTHETIC_ROLE_IDS = {
  "administrator-reviewer": "0199a18e-a400-7000-8000-000000000001",
  "support-reviewer": "0199a18e-a400-7000-8000-000000000002",
  "patient-reviewer": "0199a18e-a400-7000-8000-000000000003",
  "provider-reviewer": "0199a18e-a400-7000-8000-000000000004",
  "manager-reviewer": "0199a18e-a400-7000-8000-000000000005",
  "logistics-reviewer": "0199a18e-a400-7000-8000-000000000006",
  "hospital-reviewer": "0199a18e-a400-7000-8000-000000000007",
  "pharmacy-reviewer": "0199a18e-a400-7000-8000-000000000008",
  "laboratory-reviewer": "0199a18e-a400-7000-8000-000000000009",
} as const;
const SYNTHETIC_REVIEWER_ROLES = {
  "administrator-reviewer": "ADMINISTRATOR",
  "support-reviewer": "SUPPORT",
  "patient-reviewer": "PATIENT",
  "provider-reviewer": "PROVIDER",
  "manager-reviewer": "MANAGER",
  "logistics-reviewer": "LOGISTICS",
} as const;
const SYNTHETIC_MEMBERSHIPS = [
  {
    membershipId: "0199a18e-a400-7000-8000-000000000021",
    organizationId: "0199a18e-a400-7000-8000-000000000201",
    subject: "hospital-reviewer",
  },
  {
    membershipId: "0199a18e-a400-7000-8000-000000000022",
    organizationId: "0199a18e-a400-7000-8000-000000000203",
    subject: "pharmacy-reviewer",
  },
  {
    membershipId: "0199a18e-a400-7000-8000-000000000023",
    organizationId: "0199a18e-a400-7000-8000-000000000204",
    subject: "laboratory-reviewer",
  },
] as const;
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
const SYNTHETIC_DIAGNOSTIC_PRICE_ID = "0199a18e-a400-7000-8000-000000000451";
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
        supportsHomeCollection: true,
      },
    ],
  },
] as const;
const SYNTHETIC_PRACTITIONERS = [
  {
    id: "0199a18e-a400-7000-8000-000000000601",
    displayName: "Dr. Maya Chen",
    givenName: "Maya",
    familyName: "Chen",
    honorific: "Dr.",
    slug: "synthetic-maya-chen",
    headline: "Synthetic cardiology practitioner profile",
    professionCode: "medicine",
    specialtyCodes: ["cardiology", "internal-medicine"],
    modes: ["VIDEO", "IN_PERSON"],
    languages: ["en", "zh-Hans"],
    location: {
      id: "0199a18e-a400-7000-8000-000000000611",
      label: "Toronto practice area",
      locality: "Toronto",
      administrativeArea: "Ontario",
      postalCode: "M5V 1A1",
      countryCode: "CA",
    },
    yearsExperience: 12,
  },
  {
    id: "0199a18e-a400-7000-8000-000000000602",
    displayName: "Dr. Sofia Keller",
    givenName: "Sofia",
    familyName: "Keller",
    honorific: "Dr.",
    slug: "synthetic-sofia-keller",
    headline: "Synthetic clinical psychology practitioner profile",
    professionCode: "psychology",
    specialtyCodes: ["clinical-psychology"],
    modes: ["VIDEO", "AUDIO", "IN_PERSON"],
    languages: ["de-CH", "en"],
    location: {
      id: "0199a18e-a400-7000-8000-000000000612",
      label: "Zurich practice area",
      locality: "Zurich",
      administrativeArea: null,
      postalCode: "8001",
      countryCode: "CH",
    },
    yearsExperience: 9,
  },
  {
    id: "0199a18e-a400-7000-8000-000000000603",
    displayName: "Aisha Rahman",
    givenName: "Aisha",
    familyName: "Rahman",
    honorific: null,
    slug: "synthetic-aisha-rahman",
    headline: "Synthetic neurological physiotherapy practitioner profile",
    professionCode: "physiotherapy",
    specialtyCodes: ["neurological-physiotherapy"],
    modes: ["IN_PERSON", "HOME_VISIT"],
    languages: ["en", "ms"],
    location: {
      id: "0199a18e-a400-7000-8000-000000000613",
      label: "Singapore practice area",
      locality: "Singapore",
      administrativeArea: null,
      postalCode: "018956",
      countryCode: "SG",
    },
    yearsExperience: 7,
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
  const syntheticIssuer = syntheticIssuerFromEnvironment();

  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const reviewerPrincipals = await seedReviewerIdentities(database, syntheticIssuer);
    await seedPublicDiscovery(database);
    await seedSyntheticServicePrices(database, reviewerPrincipals);
    await seedPractitionerDiscovery(database);
    await seedReviewerPortals(database, reviewerPrincipals);
    await seedOnboardingApplications(database);
  } finally {
    await database.$disconnect();
  }
}

async function seedSyntheticServicePrices(
  database: PrismaClient,
  reviewerPrincipals: ReviewerPrincipalMap,
): Promise<void> {
  const administratorPrincipalId = reviewerPrincipals.get("administrator-reviewer");
  const diagnosticService = SYNTHETIC_SERVICES.find(
    (service) => service.code === "diagnostic-testing",
  );
  if (administratorPrincipalId === undefined || diagnosticService === undefined) {
    throw new Error("Synthetic service pricing requires the administrator and diagnostic service");
  }
  await database.servicePrice.upsert({
    where: { id: SYNTHETIC_DIAGNOSTIC_PRICE_ID },
    create: {
      approvedByPrincipalId: administratorPrincipalId,
      createdByPrincipalId: administratorPrincipalId,
      currency: "SGD",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      id: SYNTHETIC_DIAGNOSTIC_PRICE_ID,
      patientPriceMinor: 12_500n,
      providerPayoutMinor: 10_000n,
      serviceId: diagnosticService.id,
      status: "ACTIVE",
      updatedAt: new Date(),
    },
    update: {},
    select: { id: true },
  });
}

type ReviewerPrincipalMap = ReadonlyMap<string, string>;

async function seedReviewerIdentities(
  database: PrismaClient,
  issuer: string,
): Promise<ReviewerPrincipalMap> {
  const principals = new Map<string, string>();
  for (const account of SYNTHETIC_IDENTITY_ACCOUNTS) {
    const externalIdentity = await database.externalIdentity.findUnique({
      where: { issuer_subject: { issuer, subject: account.subject } },
      select: { principalId: true },
    });
    const principalId =
      externalIdentity === null
        ? (
            await database.identityPrincipal.create({
              data: {
                id: createOpaqueId(),
                externalIdentities: {
                  create: { id: createOpaqueId(), issuer, subject: account.subject },
                },
              },
              select: { id: true },
            })
          ).id
        : externalIdentity.principalId;
    principals.set(account.subject, principalId);

    const platformRole =
      SYNTHETIC_REVIEWER_ROLES[account.subject as keyof typeof SYNTHETIC_REVIEWER_ROLES];
    if (platformRole === undefined) continue;
    await database.roleAssignment.upsert({
      where: { id: SYNTHETIC_ROLE_IDS[account.subject] },
      create: {
        id: SYNTHETIC_ROLE_IDS[account.subject],
        principalId,
        role: platformRole,
        scope: "PLATFORM",
      },
      update: { principalId, role: platformRole, scope: "PLATFORM" },
      select: { id: true },
    });
  }
  return principals;
}

async function seedReviewerPortals(
  database: PrismaClient,
  principals: ReviewerPrincipalMap,
): Promise<void> {
  const patientPrincipalId = requiredReviewerPrincipal(principals, "patient-reviewer");
  await database.patient.upsert({
    where: { principalId: patientPrincipalId },
    create: {
      id: "0199a18e-a400-7000-8000-000000000031",
      principalId: patientPrincipalId,
      familyName: "Reviewer",
      givenName: "Patient",
      preferredLanguage: "en",
    },
    update: { familyName: "Reviewer", givenName: "Patient", preferredLanguage: "en" },
    select: { id: true },
  });

  const providerPrincipalId = requiredReviewerPrincipal(principals, "provider-reviewer");
  await database.practitioner.update({
    where: { id: SYNTHETIC_PRACTITIONERS[0].id },
    data: { principalId: providerPrincipalId },
    select: { id: true },
  });

  const managerPrincipalId = requiredReviewerPrincipal(principals, "manager-reviewer");
  await database.managerProfile.upsert({
    where: { principalId: managerPrincipalId },
    create: {
      id: "0199a18e-a400-7000-8000-000000000032",
      principalId: managerPrincipalId,
      displayName: "Synthetic Manager Reviewer",
    },
    update: { displayName: "Synthetic Manager Reviewer", status: "ACTIVE" },
    select: { id: true },
  });

  for (const fixture of SYNTHETIC_MEMBERSHIPS) {
    const principalId = requiredReviewerPrincipal(principals, fixture.subject);
    await database.membership.upsert({
      where: { id: fixture.membershipId },
      create: {
        id: fixture.membershipId,
        organizationId: fixture.organizationId,
        principalId,
      },
      update: { organizationId: fixture.organizationId, principalId },
      select: { id: true },
    });
    await database.roleAssignment.upsert({
      where: { id: SYNTHETIC_ROLE_IDS[fixture.subject] },
      create: {
        id: SYNTHETIC_ROLE_IDS[fixture.subject],
        membershipId: fixture.membershipId,
        role: "ORGANIZATION_STAFF",
        scope: "ORGANIZATION",
      },
      update: {
        membershipId: fixture.membershipId,
        role: "ORGANIZATION_STAFF",
        scope: "ORGANIZATION",
      },
      select: { id: true },
    });
  }
}

function requiredReviewerPrincipal(principals: ReviewerPrincipalMap, subject: string): string {
  const principalId = principals.get(subject);
  if (principalId === undefined)
    throw new Error(`Missing synthetic reviewer principal: ${subject}`);
  return principalId;
}

function syntheticIssuerFromEnvironment(): string {
  const value = process.env.OIDC_ISSUER_URL;
  if (value === undefined) throw new Error("OIDC_ISSUER_URL is required for the synthetic seed");
  const issuer = new URL(value);
  const loopback =
    issuer.hostname === "localhost" || issuer.hostname === "127.0.0.1" || issuer.hostname === "::1";
  if (issuer.protocol !== "http:" || !loopback) {
    throw new Error("Synthetic identities may only be seeded for a loopback HTTP issuer");
  }
  return issuer.origin;
}

async function seedOnboardingApplications(database: PrismaClient): Promise<void> {
  const applicationFixtures = [
    {
      applicationId: "0199a18e-a400-7000-8000-000000000701",
      applicantId: "0199a18e-a400-7000-8000-000000000711",
      kind: "PATIENT" as const,
      detail: {
        patientDetail: {
          create: {
            countryCode: "CA",
            familyName: "Applicant",
            givenName: "Synthetic Patient",
            preferredLanguage: "en-CA",
          },
        },
      },
    },
    {
      applicationId: "0199a18e-a400-7000-8000-000000000702",
      applicantId: "0199a18e-a400-7000-8000-000000000712",
      kind: "ORGANIZATION" as const,
      detail: {
        organizationDetail: {
          create: {
            administrativeArea: "Ontario",
            contactEmail: "organization-applicant@synthetic.invalid",
            contactName: "Synthetic Operator",
            countryCode: "CA",
            displayName: "Synthetic Applicant Hospital",
            jurisdictionCode: "CA-ON",
            legalName: "Synthetic Applicant Hospital Incorporated",
            locality: "Toronto",
            organizationType: "HOSPITAL" as const,
            registrationAuthority: "Synthetic Ontario Health Regulator",
            registrationNumber: "SYNTHETIC-ORG-001",
            requestedServices: {
              create: { serviceId: SYNTHETIC_SERVICES[0].id },
            },
          },
        },
      },
    },
  ] as const;

  for (const fixture of applicationFixtures) {
    await database.identityPrincipal.upsert({
      where: { id: fixture.applicantId },
      create: { id: fixture.applicantId },
      update: {},
      select: { id: true },
    });
    const existing = await database.onboardingApplication.findUnique({
      select: { id: true },
      where: { id: fixture.applicationId },
    });
    if (existing !== null) continue;
    await database.onboardingApplication.create({
      data: {
        applicantPrincipalId: fixture.applicantId,
        id: fixture.applicationId,
        kind: fixture.kind,
        status: "SUBMITTED",
        submittedAt: new Date("2026-09-30T00:00:00.000Z"),
        statusHistory: {
          create: [
            {
              id: createOpaqueId(),
              noteVisibility: "APPLICANT",
              reasonCategory: "APPLICATION_CREATED",
              requestId: "synthetic-seed-create",
              toStatus: "DRAFT",
            },
            {
              fromStatus: "DRAFT",
              id: createOpaqueId(),
              noteVisibility: "APPLICANT",
              reasonCategory: "APPLICANT_SUBMITTED",
              requestId: "synthetic-seed-submit",
              toStatus: "SUBMITTED",
            },
          ],
        },
        ...fixture.detail,
      },
      select: { id: true },
    });
  }
}

async function seedPractitionerDiscovery(database: PrismaClient): Promise<void> {
  const professionIds = new Map<string, string>();
  for (const profession of PROFESSION_SEEDS) {
    const record = await database.professionTaxonomy.upsert({
      where: { code: profession.code },
      create: { id: createOpaqueId(), ...profession },
      update: { ...profession, status: "ACTIVE" },
      select: { code: true, id: true },
    });
    professionIds.set(record.code, record.id);
  }

  const specialtyIds = new Map<string, string>();
  for (const specialty of SPECIALTY_SEEDS) {
    const record = await database.specialtyTaxonomy.upsert({
      where: { code: specialty.code },
      create: { id: createOpaqueId(), ...specialty },
      update: { ...specialty, status: "ACTIVE" },
      select: { code: true, id: true },
    });
    specialtyIds.set(record.code, record.id);
  }

  for (const fixture of SYNTHETIC_PRACTITIONERS) {
    await database.practitioner.upsert({
      where: { id: fixture.id },
      create: {
        id: fixture.id,
        displayName: fixture.displayName,
        familyName: fixture.familyName,
        givenName: fixture.givenName,
        honorific: fixture.honorific,
        verificationStatus: "VERIFIED",
        verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      update: {
        displayName: fixture.displayName,
        familyName: fixture.familyName,
        givenName: fixture.givenName,
        honorific: fixture.honorific,
        verificationStatus: "VERIFIED",
        verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      select: { id: true },
    });
    await database.practitionerPublicProfile.upsert({
      where: { practitionerId: fixture.id },
      create: {
        practitionerId: fixture.id,
        acceptingPatients: true,
        biography: "Synthetic demonstration profile. Not a real healthcare practitioner.",
        headline: fixture.headline,
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        slug: fixture.slug,
        status: "PUBLISHED",
        yearsExperience: fixture.yearsExperience,
      },
      update: {
        acceptingPatients: true,
        headline: fixture.headline,
        status: "PUBLISHED",
        yearsExperience: fixture.yearsExperience,
      },
      select: { practitionerId: true },
    });
    await database.practitionerLocation.upsert({
      where: { id: fixture.location.id },
      create: {
        ...fixture.location,
        isPrimary: true,
        isPublic: true,
        practitionerId: fixture.id,
      },
      update: { ...fixture.location, isPrimary: true, isPublic: true, status: "ACTIVE" },
      select: { id: true },
    });

    const professionId = professionIds.get(fixture.professionCode);
    if (professionId === undefined)
      throw new Error(`Unknown synthetic profession: ${fixture.professionCode}`);
    await database.practitionerProfession.upsert({
      where: {
        practitionerId_professionId: { practitionerId: fixture.id, professionId },
      },
      create: {
        id: createOpaqueId(),
        isPrimary: true,
        practitionerId: fixture.id,
        professionId,
      },
      update: { isPrimary: true },
      select: { id: true },
    });

    for (const [index, specialtyCode] of fixture.specialtyCodes.entries()) {
      const specialtyId = specialtyIds.get(specialtyCode);
      if (specialtyId === undefined)
        throw new Error(`Unknown synthetic specialty: ${specialtyCode}`);
      await database.practitionerSpecialty.upsert({
        where: {
          practitionerId_specialtyId: { practitionerId: fixture.id, specialtyId },
        },
        create: {
          id: createOpaqueId(),
          isPrimary: index === 0,
          practitionerId: fixture.id,
          specialtyId,
        },
        update: { isPrimary: index === 0 },
        select: { id: true },
      });
    }
    for (const mode of fixture.modes) {
      await database.practitionerServiceMode.upsert({
        where: { practitionerId_mode: { mode, practitionerId: fixture.id } },
        create: { id: createOpaqueId(), mode, practitionerId: fixture.id },
        update: {},
        select: { id: true },
      });
    }
    for (const languageTag of fixture.languages) {
      await database.practitionerLanguage.upsert({
        where: { practitionerId_languageTag: { languageTag, practitionerId: fixture.id } },
        create: { id: createOpaqueId(), languageTag, practitionerId: fixture.id },
        update: {},
        select: { id: true },
      });
    }
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
          supportsHomeCollection:
            "supportsHomeCollection" in organizationService &&
            organizationService.supportsHomeCollection,
        },
        update: {
          status: "ACTIVE",
          supportsHomeCollection:
            "supportsHomeCollection" in organizationService &&
            organizationService.supportsHomeCollection,
        },
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
