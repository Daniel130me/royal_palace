import { PrismaPg } from "@prisma/adapter-pg";

import { PublicDiscoveryService } from "../src/discovery/application/public-discovery.service.js";
import { PrismaPublicDiscoveryRepository } from "../src/discovery/infrastructure/prisma-public-discovery.repository.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import type { PrismaService } from "../src/platform/database/prisma.service.js";
import { requireDisposableDatabase } from "./database-safety.js";

// Prisma batches the root, one-to-one profile, locations, offerings, and taxonomy
// reads. This remains five queries regardless of page size and prevents N+1 growth.
const MAX_LIST_QUERY_COUNT = 5;

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

  try {
    const services = await discovery.listServices("HOSPITAL");
    assert(
      services.data.some((service) => service.code === "maternal-care"),
      "Service catalogue is incomplete",
    );

    queryCount = 0;
    const lagos = await discovery.listOrganizations({
      filters: { state: "Lagos" },
      organizationType: "HOSPITAL",
    });
    assert(lagos.data.length === 1, "State filter returned an unexpected hospital count");
    assert(
      lagos.data[0]?.slug === "synthetic-lagoon-hospital",
      "State filter returned the wrong hospital",
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
      filters: { serviceCode: "prescription-dispensing", state: "Lagos" },
      organizationType: "PHARMACY",
    });
    assert(pharmacies.data.length === 1, "Pharmacy discovery returned an unexpected result");
    assert(pharmacies.data[0]?.organizationType === "PHARMACY", "Pharmacy type was not preserved");

    const laboratories = await discovery.listOrganizations({
      filters: { serviceCode: "diagnostic-testing", state: "Lagos" },
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

    const serialized = JSON.stringify([
      ...lagos.data,
      ...maternalCare.data,
      ...pharmacies.data,
      ...laboratories.data,
    ]);
    for (const privateField of ["legalName", "verificationStatus", "verifiedAt"] as const) {
      assert(!serialized.includes(privateField), `Public projection leaked ${privateField}`);
    }
    process.stdout.write(
      `Public discovery verification passed with ${listQueryCount} queries per list request.\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

await main();
