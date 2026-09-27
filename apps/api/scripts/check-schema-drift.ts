import { join } from "node:path";

import { prismaRoot, runPnpm } from "./database-safety.js";

const schemaPath = join(prismaRoot, "schema.prisma");

await runPnpm([
  "exec",
  "prisma",
  "migrate",
  "diff",
  "--from-schema-datasource",
  schemaPath,
  "--to-schema-datamodel",
  schemaPath,
  "--exit-code",
]);
