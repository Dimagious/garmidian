import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { obsidian: fileURLToPath(new URL("./src/test/obsidian-stub.ts", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      // The wizard and settings tab are driven by Obsidian's own UI classes;
      // they are covered end to end by the e2e run, not by unit tests.
      include: ["src/core/**/*.ts", "src/api/**/*.ts", "src/app/storage.ts"],
      exclude: ["src/**/*.test.ts", "src/test/**", "src/core/types.ts", "src/core/catalog.ts"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
