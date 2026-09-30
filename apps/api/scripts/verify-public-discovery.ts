import { PrismaPg } from "@prisma/adapter-pg";

import { PublicDiscoveryService } from "../src/discovery/application/public-discovery.service.js";
import { PublicPractitionerDiscoveryService } from "../src/discovery/application/public-practitioner-discovery.service.js";
import { PrismaPublicDiscoveryRepository } from "../src/discovery/infrastructure/prisma-public-discovery.repository.js";
import { PrismaPublicPractitionerDiscoveryRepository } from "../src/discovery/infrastructure/prisma-public-practitioner-discovery.repository.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import type { PrismaService } from "../src/platform/database/prisma.service.js";
import { requireDisposableDatabase } from "./database-safety.js";

// PostgreSQL relation joins aggregate the bounded public projection in one round trip.
// The small allowance detects accidental N+1 regressions without coupling this gate to
// harmless metadata statements emitted by a future driver version.
const MAX_LIST_QUERY_COUNT = 2;
const MAX_PRACTITIONER_LIST_QUERY_COUNT = 2;

async function main(): Promise<void> {
  const databaseUrl = requireDisposableDatabase().toString();
  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
    log: [{ emit: "event", level: "query" }],
  });
  let queryCount = 0;
  database.$on("query", () => {
    queryCount += 1;
  });
  const repository = new PrismaPublicDiscoveryRepository(database as unknown as PrismaService);
  const discovery = new PublicDiscoveryService(repository);
  const practitionerDiscovery = new PublicPractitionerDiscoveryService(
    new PrismaPublicPractitionerDiscoveryRepository(database as unknown as PrismaService),
  );

  try {
    const services = await discovery.listServices("HOSPITAL");
    assert(
      services.data.some((service) => service.code === "maternal-care"),
      "Service catalogue is incomplete",
    );

    queryCount = 0;
    const lagos = await discovery.listOrganizations({
      filters: { countryCode: "NG", location: "Lagos" },
      organizationType: "HOSPITAL",
    });
    assert(lagos.data.length === 1, "Location filter returned an unexpected hospital count");
    assert(
      lagos.data[0]?.slug === "synthetic-lagoon-hospital",
      "Location filter returned the wrong hospital",
    );
    const listQueryCount = queryCount;
    assert(
      listQueryCount <= MAX_LIST_QUERY_COUNT,
      `Hospital list used ${listQueryCount} database queries; limit is ${MAX_LIST_QUERY_COUNT}`,
    );

    const maternalCare = await discovery.listOrganizations({
      filters: { serviceCode: "maternal-care" },
      organizationType: "HOSPITAL",
    });
    assert(maternalCare.data.length === 1, "Service filter returned an unexpected hospital count");
    assert(
      maternalCare.data[0]?.slug === "synthetic-family-hospital",
      "Service filter returned the wrong hospital",
    );

    const pharmacies = await discovery.listOrganizations({
      filters: { countryCode: "CA", serviceCode: "prescription-dispensing" },
      organizationType: "PHARMACY",
    });
    assert(pharmacies.data.length === 1, "Pharmacy discovery returned an unexpected result");
    assert(pharmacies.data[0]?.organizationType === "PHARMACY", "Pharmacy type was not preserved");

    const laboratories = await discovery.listOrganizations({
      filters: { countryCode: "SG", serviceCode: "diagnostic-testing" },
      organizationType: "LABORATORY",
    });
    assert(laboratories.data.length === 1, "Laboratory discovery returned an unexpected result");
    assert(
      laboratories.data[0]?.organizationType === "LABORATORY",
      "Laboratory type was not preserved",
    );

    const firstPage = await discovery.listOrganizations({
      filters: {},
      limit: 1,
      organizationType: "HOSPITAL",
    });
    assert(firstPage.pageInfo.hasNextPage, "First discovery page should expose a next cursor");
    const secondPage = await discovery.listOrganizations({
      cursor: firstPage.pageInfo.endCursor ?? undefined,
      filters: {},
      limit: 1,
      organizationType: "HOSPITAL",
    });
    assert(secondPage.data.length === 1, "Second discovery page is missing");
    assert(
      firstPage.data[0]?.id !== secondPage.data[0]?.id,
      "Cursor pagination returned a duplicate",
    );

    const professions = await practitionerDiscovery.listProfessions();
    const specialties = await practitionerDiscovery.listSpecialties();
    assert(professions.data.length >= 15, "Practitioner profession catalogue is incomplete");
    assert(specialties.data.length >= 100, "Practitioner specialty catalogue is incomplete");

    queryCount = 0;
    const practitioners = await practitionerDiscovery.listPractitioners({
      filters: {
        countryCode: "CA",
        languageTag: "en",
        professionCode: "medicine",
        serviceMode: "VIDEO",
        specialtyCode: "cardiology",
      },
    });
    assert(practitioners.data.length === 1, "Practitioner filters returned an unexpected count");
    assert(
      practitioners.data[0]?.slug === "synthetic-maya-chen",
      "Practitioner filters returned the wrong profile",
    );
    const practitionerListQueryCount = queryCount;
    assert(
      practitionerListQueryCount <= MAX_PRACTITIONER_LIST_QUERY_COUNT,
      `Practitioner list used ${practitionerListQueryCount} database queries; limit is ${MAX_PRACTITIONER_LIST_QUERY_COUNT}`,
    );

    const serialized = JSON.stringify([
      ...lagos.data,
      ...maternalCare.data,
      ...pharmacies.data,
      ...laboratories.data,
      ...practitioners.data,
    ]);
    for (const privateField of [
      "legalName",
      "verificationStatus",
      "verifiedAt",
      "principalId",
      "givenName",
      "familyName",
    ] as const) {
      assert(!serialized.includes(privateField), `Public projection leaked ${privateField}`);
    }
    process.stdout.write(
      `Public discovery verification passed with ${listQueryCount} organization queries and ${practitionerListQueryCount} practitioner queries per list request.\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

await main();
