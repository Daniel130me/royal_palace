// Vitest configuration for the Manager module tests.
// Pure policy tests live in tests/unit; DB-backed policy tests in
// tests/integration (they share the per-run temporary SQLite database
// prepared by tests/setup.ts).

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

import { nodeTestDefaults } from "@royal-palace/config/vitest/node";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    ...nodeTestDefaults,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // The setup prepares one shared temp database; keep files sequential.
    fileParallelism: false,
  },
});
