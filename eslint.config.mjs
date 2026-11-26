import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import js from "@eslint/js";
import n from "eslint-plugin-n";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const TOOL_DIRECTIVE =
  /^\s*(eslint-disable-next-line\s.*\s--\s+\S|@ts-expect-error\s+\S|prettier-ignore|[cv]8 ignore|istanbul ignore|<reference\s)/;

const noComments = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      comment:
        "Delete this comment. Rename or extract until the code says it. Only tool directives with a reason are allowed.",
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const allowed = comment.type === "Shebang" || TOOL_DIRECTIVE.test(comment.value);
          if (!allowed) context.report({ loc: comment.loc, messageId: "comment" });
        }
      },
    };
  },
};

const BOUNDARY_ONLY = [
  { selector: "CallExpression[callee.name='fetch']", message: "Call fetch only in src/boundary/, behind a schema." },
  { selector: "CallExpression[callee.object.name='JSON'][callee.property.name='parse']", message: "Parse JSON only in src/boundary/, with a schema." },
  { selector: "CallExpression[callee.property.name='json'][arguments.length=0]", message: "Read response bodies only in src/boundary/, with a schema." },
  { selector: "MemberExpression[object.name='process'][property.name='env']", message: "Read process.env only in src/boundary/, with a schema." },
];
const UI_ONLY = [
  { selector: "JSXOpeningElement[name.name=/^(a|button|dialog|input|select|textarea)$/]", message: "Use the component from src/ui/ instead of the raw element." },
];
const BANNED_PACKAGES = [
  { group: ["moment", "dayjs", "luxon"], message: "Use date-fns." },
  { group: ["axios", "got", "ky", "node-fetch", "superagent", "cross-fetch"], message: "Use fetch in src/boundary/." },
  { group: ["lodash", "lodash/*", "lodash-es", "underscore", "ramda"], message: "Use the built-in array and object methods." },
  { group: ["uuid", "nanoid"], message: "Use crypto.randomUUID()." },
  { group: ["classnames"], message: "Use clsx." },
];

const GUARDED_RULES = [
  "max-lines", "max-lines-per-function", "complexity", "sonarjs/cognitive-complexity",
  "max-depth", "max-nested-callbacks", "max-params", "max-statements", "no-nested-ternary",
  "local/no-comments", "@typescript-eslint/ban-ts-comment",
  "@typescript-eslint/consistent-type-assertions", "@typescript-eslint/no-non-null-assertion",
  "@typescript-eslint/no-explicit-any", "no-restricted-syntax", "no-restricted-imports",
  "sonarjs/no-identical-functions", "sonarjs/no-duplicated-branches",
  "sonarjs/no-identical-expressions", "sonarjs/no-duplicate-string", "unicorn/max-nested-calls",
  "@eslint-community/eslint-comments/*",
];
const NEWER_THAN_ES2023 = [
  "prefer-abort-signal-any", "prefer-array-from-async", "prefer-get-or-insert-computed", "prefer-group-by",
  "prefer-iterator-helpers", "prefer-iterator-to-array", "prefer-iterator-to-array-at-end", "prefer-iterator-zip",
  "prefer-promise-try", "prefer-promise-with-resolvers", "prefer-set-methods", "prefer-dom-node-html-methods",
];
const UNICORN_OFF = [
  "no-null", "filename-case", "name-replacements", "consistent-boolean-name",
  "consistent-arrow-return-style", "no-nested-ternary", "prefer-switch", "prefer-ternary",
  "prefer-combined-guards", "require-css-escape", "prefer-await", "prefer-simple-condition-first",
  "consistent-class-member-order",
  ...NEWER_THAN_ES2023,
];

const NODE_FILES = [
  "scripts/**/*.ts", "functions/**/*.ts", "e2e/**/*.ts", "src/headless/**/*.ts", "src/simulation/**/*.ts",
  "studio/helper/**/*.ts", "*.config.ts", "playwright.*.ts",
];

const config = defineConfig(
  { ignores: ["dist", "build", "coverage", "node_modules", "**/lib/**", "dist-*", "**/.*/**", "**/vendor/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      sonarjs,
      local: { rules: { "no-comments": noComments } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],

      "max-lines": ["error", { max: 800, skipBlankLines: false, skipComments: false }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, IIFEs: true }],
      complexity: ["error", 10],
      "sonarjs/cognitive-complexity": ["error", 12],
      "max-depth": ["error", 3],
      "max-nested-callbacks": ["error", 3],
      "max-params": ["error", 3],
      "max-statements": ["error", 20],
      "no-nested-ternary": "error",
      "no-else-return": ["error", { allowElseIf: false }],

      "sonarjs/no-identical-functions": ["error", 3],
      "sonarjs/no-duplicated-branches": "error",
      "sonarjs/no-identical-expressions": "error",
      "sonarjs/no-duplicate-string": ["error", { threshold: 3 }],

      "local/no-comments": "error",
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": "allow-with-description" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: BANNED_PACKAGES }],
      "no-restricted-syntax": ["error", ...BOUNDARY_ONLY, ...UI_ONLY],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [unicorn.configs.recommended],
    rules: {
      ...Object.fromEntries(UNICORN_OFF.map((rule) => [`unicorn/${rule}`, "off"])),
      "unicorn/number-literal-case": ["error", { hexadecimalValue: "lowercase" }],
      "unicorn/numeric-separators-style": ["error", { hexadecimal: { onlyIfContainsSeparator: true } }],
      "unicorn/switch-case-braces": ["error", "avoid"],
      "unicorn/prefer-smaller-scope": ["error", { checkTypeAliases: false }],
      "unicorn/catch-error-name": ["error", { ignore: ["^cause$", "^reason$"] }],
      "unicorn/no-useless-undefined": ["error", { checkArrowFunctionBody: false }],
      "no-nested-ternary": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [comments.recommended],
    rules: {
      "@eslint-community/eslint-comments/require-description": ["error", { ignore: [] }],
      "@eslint-community/eslint-comments/no-restricted-disable": ["error", ...GUARDED_RULES],
      "@eslint-community/eslint-comments/no-use": ["error", { allow: ["eslint-disable-next-line"] }],
    },
  },
  {
    files: NODE_FILES,
    extends: [n.configs["flat/recommended-module"]],
    rules: {
      "n/no-missing-import": "off",
      "n/no-unpublished-import": "off",
      "n/no-unsupported-features/node-builtins": ["error", { ignores: ["localStorage", "navigator", "Worker"] }],
    },
  },
  {
    files: ["scripts/**/*.ts", "src/headless/cli.ts", "src/simulation/cli.ts", "src/simulation/commands/**/*.ts"],
    rules: { "n/no-process-exit": "off", "unicorn/no-process-exit": "off" },
  },
  { files: ["src/boundary/**", "studio/boundary/**"], rules: { "no-restricted-syntax": ["error", ...UI_ONLY] } },
  { files: ["src/ui/**"], rules: { "no-restricted-syntax": ["error", ...BOUNDARY_ONLY] } },
);

export const testSizeExceptions = {
  files: ["__tests__/**", "e2e/**", "src/testing/**", "src/data/ruleScenarios/**", "**/*.test.*", "**/*.spec.*"],
  rules: Object.fromEntries([
    "max-lines", "max-lines-per-function", "complexity", "sonarjs/cognitive-complexity",
    "max-depth", "max-nested-callbacks", "max-statements",
    "sonarjs/no-identical-functions", "sonarjs/no-duplicate-string",
    "unicorn/max-nested-calls", "unicorn/no-top-level-assignment-in-function",
  ].map((rule) => [rule, "off"])),
};

export default [...config, testSizeExceptions];
