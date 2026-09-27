import { runPnpm } from "./database-safety.js";

const STATIC_VALIDATION_URL = "postgresql://schema:validation@localhost:5432/schema_validation";
await runPnpm(["exec", "prisma", "validate"], {
  DATABASE_URL: process.env.DATABASE_URL ?? STATIC_VALIDATION_URL,
});
