import { defineConfig } from "vitest/config";

import { nodeTestDefaults } from "@royal-palace/config/vitest/node";

export default defineConfig({
  test: {
    ...nodeTestDefaults,
    include: ["tests/**/*.test.ts"],
  },
});
