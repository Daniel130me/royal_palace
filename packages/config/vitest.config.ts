import { defineConfig } from "vitest/config";

import { nodeTestDefaults } from "./vitest/node.mjs";

export default defineConfig({
  test: {
    ...nodeTestDefaults,
    include: ["tests/**/*.test.ts"],
  },
});
