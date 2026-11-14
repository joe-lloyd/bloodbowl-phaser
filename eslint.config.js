import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import prettier from "eslint-config-prettier";
import globals from "globals";

// Existing violations of the size and complexity rules are recorded in
// eslint-suppressions.json. New code must pass; when a count drops, run
// `pnpm lint --prune-suppressions` and commit the smaller file.
export default tseslint.config(
  {
    ignores: [
      "__tests__/",
      "**/dist/",
      "**/lib/",
      "**/node_modules/",
      "**/*.{js,mjs,cjs}",
      "**/refined-data-rules.ts",
      "**/refined-data-skills.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      react.configs.flat.recommended,
      prettier,
    ],
    plugins: { sonarjs },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    settings: { react: { version: "detect" } },
    rules: {
      "react/react-in-jsx-scope": "off",
      // TypeScript checks props.
      "react/prop-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      complexity: ["error", 15],
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-identical-functions": "error",
      "max-lines": ["error", { max: 800 }],
    },
  },
  {
    // Game code has functions named use* that are not hooks, and Playwright
    // fixtures call use(), so hook rules apply to the UI only.
    files: ["**/*.tsx", "src/ui/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Rosters, skills and rule scenarios are tables, not logic.
    files: ["src/data/*.ts", "src/data/ruleScenarios/*.ts"],
    rules: { "max-lines": "off" },
  }
);
