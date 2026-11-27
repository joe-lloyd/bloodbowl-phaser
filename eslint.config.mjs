import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
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
  "no-array-sort", "no-array-reverse", "prefer-number-coercion", "prefer-math-trunc", "prefer-code-point",
  "prefer-then-catch", "no-thenable", "no-computed-property-existence-check", "prefer-query-selector",
  "prefer-options-parameter", "no-break-in-nested-loop", "prefer-observer-apis", "prefer-path2d",
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
    extends: [tseslint.configs.base],
    languageOptions: { globals: globals.browser },
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

      "sonarjs/cognitive-complexity": ["error", 12],
      "sonarjs/no-identical-functions": ["error", 3],
      "sonarjs/no-duplicated-branches": "error",
      "sonarjs/no-identical-expressions": "error",
      "sonarjs/no-duplicate-string": ["error", { threshold: 3 }],

      "local/no-comments": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...BOUNDARY_ONLY, ...UI_ONLY] },
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
  {
    files: [
      "e2e/**", "__tests__/**", "src/testing/**", "src/main.ts", "src/ui/pages/GamePage.tsx",
      "src/network/ComputerMatch.ts", "src/network/computerCoach.ts", "src/gallery/isolate.ts",
    ],
    rules: { "unicorn/no-global-object-property-assignment": "off" },
  },
  {
    files: ["e2e/**", "__tests__/**"],
    rules: { "unicorn/prefer-event-target": "off", "unicorn/dom-node-dataset": "off" },
  },
  {
    files: ["e2e/fullgame/uxProbe.ts"],
    rules: { "unicorn/consistent-function-scoping": "off" },
  },
  {
    files: ["src/data/persistence/teamPersistence.ts"],
    rules: { "unicorn/consistent-conditional-object-spread": "off" },
  },
  { files: ["src/boundary/**", "studio/boundary/**"], rules: { "no-restricted-syntax": ["error", ...UI_ONLY] } },
  { files: ["src/ui/**"], rules: { "no-restricted-syntax": ["error", ...BOUNDARY_ONLY] } },
);

const testSizeExceptions = {
  files: ["__tests__/**", "e2e/**", "src/testing/**", "src/data/ruleScenarios/**", "**/*.test.*", "**/*.spec.*"],
  rules: Object.fromEntries([
    "sonarjs/cognitive-complexity", "sonarjs/no-identical-functions", "sonarjs/no-duplicate-string",
    "unicorn/max-nested-calls", "unicorn/no-top-level-assignment-in-function",
    "unicorn/prefer-structured-clone",
  ].map((rule) => [rule, "off"])),
};

export default [...config, testSizeExceptions];
