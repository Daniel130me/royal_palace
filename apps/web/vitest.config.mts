// Vitest configuration for the Manager module tests.
// Pure policy tests live in tests/unit; DB-backed policy tests in
// tests/integration (they share the per-run temporary SQLite database
// prepared once by tests/global-setup.ts).

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
    globalSetup: ["tests/global-setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup-environment.ts"],
  },
});
