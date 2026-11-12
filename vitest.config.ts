import { defineUnitConfig } from "obsidian-plugin-dev-kit/vitest";

export default defineUnitConfig({
  rootDir: import.meta.dirname,
  // Garmy's own stub for the node tests; the wizard and settings tests run in jsdom on obsidian-test-mocks.
  obsidian: { node: "./src/test/obsidian-stub.ts", dom: "obsidian-test-mocks" },
  dom: ["src/app/wizard.test.ts", "src/app/settings.test.ts"],
  coverage: {
    include: ["src/core/**/*.ts", "src/api/**/*.ts", "src/app/storage.ts", "src/app/wizard.ts", "src/app/settings.ts"],
    exclude: ["src/core/types.ts", "src/core/catalog.ts"],
  },
});
