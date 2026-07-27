import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./__tests__/setup/vitest-setup.ts"],
    // Sibling git worktrees carry their own copy of every test. Crawling them
    // from the primary checkout does not just duplicate the run: their test
    // files resolve `@/…` through the alias below (this checkout's src) while
    // their relative imports resolve to their own, so the mixed pair fails in
    // ways that say nothing about either tree. Agent worktrees land in
    // .claude/worktrees/, which the old `**/.worktrees/**` glob did not match.
    exclude: [
      ...configDefaults.exclude,
      "**/.worktrees/**",
      "**/.claude/worktrees/**",
    ],
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
