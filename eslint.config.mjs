import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const TOOL_DIRECTIVE =
  /^\s*(eslint-disable(-next-line|-line)?\s.*\s--\s+\S|@ts-expect-error\s+\S|prettier-ignore|[cv]8 ignore|istanbul ignore|<reference\s)/;

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
  { files: ["src/boundary/**"], rules: { "no-restricted-syntax": ["error", ...UI_ONLY] } },
  { files: ["src/ui/**"], rules: { "no-restricted-syntax": ["error", ...BOUNDARY_ONLY] } },
);

export const testSizeExceptions = {
  files: ["__tests__/**", "e2e/**", "src/testing/**", "src/data/ruleScenarios/**", "**/*.test.*", "**/*.spec.*"],
  rules: Object.fromEntries([
    "max-lines", "max-lines-per-function", "complexity", "sonarjs/cognitive-complexity",
    "max-depth", "max-nested-callbacks", "max-statements",
    "sonarjs/no-identical-functions", "sonarjs/no-duplicate-string",
  ].map((rule) => [rule, "off"])),
};

export default [...config, testSizeExceptions];
