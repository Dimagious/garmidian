import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      // The wizard, settings tab and vault storage are driven by Obsidian's own UI classes;
      // they are covered end to end by the e2e run, not by unit tests.
      include: ["src/core/**/*.ts", "src/api/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/core/types.ts", "src/core/catalog.ts"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
