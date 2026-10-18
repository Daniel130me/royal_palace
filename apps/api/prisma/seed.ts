import { createHmac } from "node:crypto";

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
const SYNTHETIC_LOGISTICS_ORGANIZATION_ID = "0199a18e-a400-7000-8000-000000000205";
const SYNTHETIC_LOGISTICS_MEMBERSHIP_ID = "0199a18e-a400-7000-8000-000000000024";
const SYNTHETIC_LOGISTICS_ROLE_ASSIGNMENTS = {
  courier: "0199a18e-a400-7000-8000-000000000025",
  staff: "0199a18e-a400-7000-8000-000000000026",
} as const;
const SYNTHETIC_LOGISTICS_DELIVERY = {
  assignmentId: "0199a18e-a400-7000-8000-000000000821",
  catalogCategoryId: "0199a18e-a400-7000-8000-000000000811",
  catalogDosageFormId: "0199a18e-a400-7000-8000-000000000812",
  catalogItemId: "0199a18e-a400-7000-8000-000000000813",
  challengeCode: "24681357",
  deliveryId: "0199a18e-a400-7000-8000-000000000822",
  handoffId: "0199a18e-a400-7000-8000-000000000819",
  historyId: "0199a18e-a400-7000-8000-000000000823",
  orderId: "0199a18e-a400-7000-8000-000000000817",
  paymentId: "0199a18e-a400-7000-8000-000000000818",
  quoteId: "0199a18e-a400-7000-8000-000000000814",
  quoteLineId: "0199a18e-a400-7000-8000-000000000815",
  reservationId: "0199a18e-a400-7000-8000-000000000816",
} as const;
const SYNTHETIC_ADMIN_COMPLAINTS = [
  {
    complaintNumber: "SYNTHETIC-COMPLAINT-001",
    description: "Synthetic review fixture for a delayed pharmacy delivery. No real patient data.",
    id: "0199a18e-a400-7000-8000-000000000831",
    priority: "URGENT" as const,
    status: "OPEN" as const,
    subject: "Delayed synthetic pharmacy delivery",
  },
  {
    complaintNumber: "SYNTHETIC-COMPLAINT-002",
    description: "Synthetic review fixture for an appointment communication issue.",
    id: "0199a18e-a400-7000-8000-000000000832",
    priority: "HIGH" as const,
    status: "INVESTIGATING" as const,
    subject: "Appointment communication review",
  },
  {
    complaintNumber: "SYNTHETIC-COMPLAINT-003",
    description: "Synthetic resolved fixture used to review the completed complaint filter.",
    id: "0199a18e-a400-7000-8000-000000000833",
    priority: "NORMAL" as const,
    status: "RESOLVED" as const,
    subject: "Resolved synthetic service concern",
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
    await seedSyntheticAdminComplaints(database, reviewerPrincipals);
    await seedOnboardingApplications(database);
  } finally {
    await database.$disconnect();
  }
}

async function seedSyntheticAdminComplaints(
  database: PrismaClient,
  principals: ReviewerPrincipalMap,
): Promise<void> {
  const administratorPrincipalId = requiredReviewerPrincipal(principals, "administrator-reviewer");
  const patientPrincipalId = requiredReviewerPrincipal(principals, "patient-reviewer");
  const occurredAt = new Date("2026-10-16T12:00:00.000Z");

  for (const [index, fixture] of SYNTHETIC_ADMIN_COMPLAINTS.entries()) {
    const resolvedAt = fixture.status === "RESOLVED" ? occurredAt : null;
    await database.platformComplaint.upsert({
      where: { id: fixture.id },
      create: {
        ...fixture,
        complainantType: "PATIENT",
        createdAt: new Date(occurredAt.getTime() - index * 60 * 60 * 1_000),
        resolvedAt,
        submittedByPrincipalId: patientPrincipalId,
      },
      update: {
        description: fixture.description,
        priority: fixture.priority,
        resolvedAt,
        status: fixture.status,
        subject: fixture.subject,
      },
      select: { id: true },
    });

    if (fixture.status === "OPEN") continue;
    await database.platformComplaintStatusHistory.upsert({
      where: { id: `0199a18e-a400-7000-8000-00000000084${String(index)}` },
      create: {
        actorPrincipalId: administratorPrincipalId,
        complaintId: fixture.id,
        fromStatus: "OPEN",
        id: `0199a18e-a400-7000-8000-00000000084${String(index)}`,
        internalNote: "Synthetic review transition. No real patient information.",
        occurredAt,
        toStatus: fixture.status,
      },
      update: {},
      select: { id: true },
    });
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

  const logisticsPrincipalId = requiredReviewerPrincipal(principals, "logistics-reviewer");
  await database.organization.upsert({
    where: { id: SYNTHETIC_LOGISTICS_ORGANIZATION_ID },
    create: {
      displayName: "Synthetic Logistics Organization",
      id: SYNTHETIC_LOGISTICS_ORGANIZATION_ID,
      legalName: "Synthetic Logistics Organization Limited",
      type: "LOGISTICS",
      verificationStatus: "VERIFIED",
      verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    update: {
      displayName: "Synthetic Logistics Organization",
      status: "ACTIVE",
      verificationStatus: "VERIFIED",
      verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  await database.membership.upsert({
    where: { id: SYNTHETIC_LOGISTICS_MEMBERSHIP_ID },
    create: {
      id: SYNTHETIC_LOGISTICS_MEMBERSHIP_ID,
      organizationId: SYNTHETIC_LOGISTICS_ORGANIZATION_ID,
      principalId: logisticsPrincipalId,
    },
    update: {
      organizationId: SYNTHETIC_LOGISTICS_ORGANIZATION_ID,
      principalId: logisticsPrincipalId,
    },
    select: { id: true },
  });
  for (const [role, id] of [
    ["LOGISTICS", SYNTHETIC_LOGISTICS_ROLE_ASSIGNMENTS.courier],
    ["ORGANIZATION_STAFF", SYNTHETIC_LOGISTICS_ROLE_ASSIGNMENTS.staff],
  ] as const) {
    await database.roleAssignment.upsert({
      where: { id },
      create: {
        id,
        membershipId: SYNTHETIC_LOGISTICS_MEMBERSHIP_ID,
        role,
        scope: "ORGANIZATION",
      },
      update: {
        membershipId: SYNTHETIC_LOGISTICS_MEMBERSHIP_ID,
        role,
        scope: "ORGANIZATION",
      },
      select: { id: true },
    });
  }

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
  await seedSyntheticLogisticsDelivery(database, principals);
}

async function seedSyntheticLogisticsDelivery(
  database: PrismaClient,
  principals: ReviewerPrincipalMap,
): Promise<void> {
  const existing = await database.logisticsDelivery.findUnique({
    select: { id: true },
    where: { id: SYNTHETIC_LOGISTICS_DELIVERY.deliveryId },
  });
  if (existing !== null) return;

  const patientPrincipalId = requiredReviewerPrincipal(principals, "patient-reviewer");
  const pharmacyPrincipalId = requiredReviewerPrincipal(principals, "pharmacy-reviewer");
  const logisticsPrincipalId = requiredReviewerPrincipal(principals, "logistics-reviewer");
  const recipientCode = syntheticRecipientCodeDigest(SYNTHETIC_LOGISTICS_DELIVERY.deliveryId);
  const assignedAt = new Date("2026-10-15T10:00:00.000Z");
  const expiresAt = new Date("2099-01-01T00:00:00.000Z");

  await database.$transaction(async (transaction) => {
    await transaction.pharmacyProductClassification.createMany({
      data: [
        {
          code: "SYNTHETIC-LOGISTICS-CATEGORY",
          id: SYNTHETIC_LOGISTICS_DELIVERY.catalogCategoryId,
          kind: "CATEGORY",
          name: "Synthetic delivery review",
        },
        {
          code: "SYNTHETIC-LOGISTICS-FORM",
          id: SYNTHETIC_LOGISTICS_DELIVERY.catalogDosageFormId,
          kind: "DOSAGE_FORM",
          name: "Synthetic unit",
        },
      ],
      skipDuplicates: true,
    });
    await transaction.pharmacyCatalogItem.upsert({
      where: { id: SYNTHETIC_LOGISTICS_DELIVERY.catalogItemId },
      create: {
        categoryId: SYNTHETIC_LOGISTICS_DELIVERY.catalogCategoryId,
        controlledMedication: false,
        createdByPrincipalId: pharmacyPrincipalId,
        currency: "CAD",
        dosageFormId: SYNTHETIC_LOGISTICS_DELIVERY.catalogDosageFormId,
        id: SYNTHETIC_LOGISTICS_DELIVERY.catalogItemId,
        lowStockThreshold: 10,
        name: "Synthetic non-clinical review item",
        nearExpiryDays: 30,
        pharmacyOrganizationId: "0199a18e-a400-7000-8000-000000000203",
        prescriptionRequired: false,
        sku: "SYNTHETIC-DELIVERY-REVIEW",
        unitPriceMinor: 1_000n,
      },
      update: {},
      select: { id: true },
    });
    await transaction.pharmacyQuote.create({
      data: {
        acceptedAt: assignedAt,
        createdByPrincipalId: pharmacyPrincipalId,
        currency: "CAD",
        expiresAt,
        id: SYNTHETIC_LOGISTICS_DELIVERY.quoteId,
        kind: "DIRECT_OTC",
        patientId: "0199a18e-a400-7000-8000-000000000031",
        pharmacyOrganizationId: "0199a18e-a400-7000-8000-000000000203",
        quoteNumber: "SYNTHETIC-LOGISTICS-QUOTE-001",
        status: "ACCEPTED",
        subtotalMinor: 1_000n,
        totalMinor: 1_000n,
      },
    });
    await transaction.pharmacyQuoteLine.create({
      data: {
        catalogItemId: SYNTHETIC_LOGISTICS_DELIVERY.catalogItemId,
        id: SYNTHETIC_LOGISTICS_DELIVERY.quoteLineId,
        lineNumber: 1,
        lineSubtotalMinor: 1_000n,
        medicationName: "Synthetic non-clinical review item",
        quantity: 1,
        quantityUnit: "unit",
        quoteId: SYNTHETIC_LOGISTICS_DELIVERY.quoteId,
        unitPriceMinor: 1_000n,
      },
    });
    await transaction.inventoryReservation.create({
      data: {
        evidenceHash: "a".repeat(64),
        expiresAt,
        id: SYNTHETIC_LOGISTICS_DELIVERY.reservationId,
        providerCode: "SYNTHETIC_SEED",
        providerReservationReference: "synthetic-logistics-reservation-001",
        quoteId: SYNTHETIC_LOGISTICS_DELIVERY.quoteId,
        status: "COMMITTED",
      },
    });
    await transaction.pharmacyOrder.create({
      data: {
        acceptedAt: assignedAt,
        acceptedByPrincipalId: patientPrincipalId,
        confirmedAt: assignedAt,
        id: SYNTHETIC_LOGISTICS_DELIVERY.orderId,
        orderNumber: "SYNTHETIC-LOGISTICS-ORDER-001",
        patientId: "0199a18e-a400-7000-8000-000000000031",
        pharmacyOrganizationId: "0199a18e-a400-7000-8000-000000000203",
        quoteId: SYNTHETIC_LOGISTICS_DELIVERY.quoteId,
        status: "CONFIRMED",
      },
    });
    await transaction.payment.create({
      data: {
        amountMinor: 1_000n,
        currency: "CAD",
        id: SYNTHETIC_LOGISTICS_DELIVERY.paymentId,
        patientId: "0199a18e-a400-7000-8000-000000000031",
        payableUntil: expiresAt,
        pharmacyOrderId: SYNTHETIC_LOGISTICS_DELIVERY.orderId,
        providerCode: "SYNTHETIC_SEED",
        providerOccurredAt: assignedAt,
        providerPaymentReference: "synthetic-logistics-payment-001",
        purpose: "PHARMACY_ORDER",
        reference: "SYNTHETIC-LOGISTICS-PAYMENT-001",
        status: "SUCCEEDED",
        succeededAt: assignedAt,
      },
    });
    await transaction.pharmacyOrderHandoff.create({
      data: {
        handoffReference: "SYNTHETIC-LOGISTICS-HANDOFF-001",
        id: SYNTHETIC_LOGISTICS_DELIVERY.handoffId,
        method: "DELIVERY",
        orderId: SYNTHETIC_LOGISTICS_DELIVERY.orderId,
        preparedAt: assignedAt,
        preparedByPrincipalId: pharmacyPrincipalId,
        status: "READY",
      },
    });
    await transaction.logisticsDelivery.create({
      data: {
        assignedAt,
        deliveryAddressLine1: "2 Synthetic Patient Street",
        deliveryAdministrativeArea: "Ontario",
        deliveryCountryCode: "CA",
        deliveryInstruction: "Synthetic review data only",
        deliveryLocality: "Toronto",
        deliveryNumber: "SYNTHETIC-DELIVERY-001",
        deliveryPostalCode: "M5V 1A1",
        handoffId: SYNTHETIC_LOGISTICS_DELIVERY.handoffId,
        id: SYNTHETIC_LOGISTICS_DELIVERY.deliveryId,
        logisticsOrganizationId: SYNTHETIC_LOGISTICS_ORGANIZATION_ID,
        orderId: SYNTHETIC_LOGISTICS_DELIVERY.orderId,
        pickupAddressLine1: "3 Example Pharmacy Street",
        pickupAdministrativeArea: "Ontario",
        pickupContactName: "Synthetic Pharmacy Reviewer",
        pickupContactPhoneE164: "+15555550101",
        pickupCountryCode: "CA",
        pickupLocality: "Toronto",
        pickupLocationName: "Synthetic Community Pharmacy",
        pickupPostalCode: "M5V 1A1",
        recipientCodeDigest: recipientCode.digest,
        recipientCodeExpiresAt: expiresAt,
        recipientCodeKeyId: recipientCode.keyId,
        recipientName: "Synthetic Patient Reviewer",
        recipientPhoneE164: "+15555550102",
      },
    });
    await transaction.logisticsRecipientCodeChallenge.create({
      data: { deliveryId: SYNTHETIC_LOGISTICS_DELIVERY.deliveryId },
    });
    await transaction.logisticsDeliveryAssignment.create({
      data: {
        assignedAt,
        assignedByPrincipalId: logisticsPrincipalId,
        courierPrincipalId: logisticsPrincipalId,
        deliveryId: SYNTHETIC_LOGISTICS_DELIVERY.deliveryId,
        id: SYNTHETIC_LOGISTICS_DELIVERY.assignmentId,
        logisticsOrganizationId: SYNTHETIC_LOGISTICS_ORGANIZATION_ID,
      },
    });
    await transaction.logisticsDeliveryStatusHistory.create({
      data: {
        actorPrincipalId: logisticsPrincipalId,
        deliveryId: SYNTHETIC_LOGISTICS_DELIVERY.deliveryId,
        id: SYNTHETIC_LOGISTICS_DELIVERY.historyId,
        idempotencyKey: "synthetic-logistics-delivery-assigned-001",
        occurredAt: assignedAt,
        reasonCode: "SYNTHETIC_REVIEW_FIXTURE",
        toStatus: "ASSIGNED",
      },
    });
  });

  // Keep the local-only code visible to reviewers without placing it in application responses.
  process.stdout.write(
    `Synthetic logistics delivery ${SYNTHETIC_LOGISTICS_DELIVERY.deliveryId} uses recipient code ${SYNTHETIC_LOGISTICS_DELIVERY.challengeCode}.\n`,
  );
}

function syntheticRecipientCodeDigest(deliveryId: string): { digest: string; keyId: string } {
  const keyId = process.env.LOGISTICS_RECIPIENT_CODE_ACTIVE_KEY_ID;
  const keysJson = process.env.LOGISTICS_RECIPIENT_CODE_KEYS;
  if (keyId === undefined || keysJson === undefined) {
    throw new Error("Synthetic logistics seeding requires the configured recipient-code key ring");
  }
  const keys = JSON.parse(keysJson) as Record<string, string>;
  const encodedKey = keys[keyId];
  if (encodedKey === undefined) {
    throw new Error(`Synthetic logistics recipient-code key is unavailable: ${keyId}`);
  }
  return {
    digest: createHmac("sha256", Buffer.from(encodedKey, "base64"))
      .update(`${deliveryId}:${SYNTHETIC_LOGISTICS_DELIVERY.challengeCode}`)
      .digest("hex"),
    keyId,
  };
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
