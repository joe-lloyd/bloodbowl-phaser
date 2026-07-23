import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./__tests__/setup/vitest-setup.ts"],
    // Sibling git worktrees live under .worktrees/ and carry their own test
    // copies; never crawl into them from the primary checkout.
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "__tests__/mocks/",
        "__tests__/utils/",
        "__tests__/fixtures/",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
