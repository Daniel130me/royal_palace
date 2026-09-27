import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const SYNTHETIC_ISSUER = "https://identity.synthetic.invalid";
const SYNTHETIC_SUPPORT_ROLE_ID = "0199a18e-a400-7000-8000-000000000001";

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
    const principal = await database.identityPrincipal.upsert({
      where: {
        issuer_subject: {
          issuer: SYNTHETIC_ISSUER,
          subject: "support-reviewer",
        },
      },
      create: {
        id: createOpaqueId(),
        issuer: SYNTHETIC_ISSUER,
        subject: "support-reviewer",
      },
      update: {},
      select: { id: true },
    });

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
  } finally {
    await database.$disconnect();
  }
}

await main();
