const ALLOWED_TOOL_COMMENT = /^(\s*@ts-expect-error\s+\S|\s*prettier-ignore|\s*[cv]8 ignore|\s*istanbul ignore|\/\s*<reference\s)/;
const DIRECTIVE = /^\s*(eslint|oxlint)-(?<kind>disable-next-line|disable-line|disable|enable)(?<rest>[\s\S]*)$/;

const LOCKED_RULES = new Set([
  "max-lines",
  "max-lines-per-function",
  "complexity",
  "max-depth",
  "max-nested-callbacks",
  "max-params",
  "max-statements",
  "no-nested-ternary",
  "ban-ts-comment",
  "consistent-type-assertions",
  "no-explicit-any",
  "no-non-null-assertion",
  "no-restricted-imports",
  "no-restricted-globals",
  "no-restricted-properties",
  "forbid-elements",
  "no-comments",
  "no-identical-functions",
  "no-duplicated-branches",
  "no-duplicate-string",
]);

function splitDirective(rest) {
  const separator = rest.indexOf("--");
  if (separator === -1) return { rules: rest, reason: "" };
  return { rules: rest.slice(0, separator), reason: rest.slice(separator + 2).trim() };
}

function lockedRuleIn(rules) {
  const names = rules.split(/[\s,]+/).filter(Boolean);
  if (names.length === 0) return "every rule";
  return names.find((name) => LOCKED_RULES.has(name.split("/").at(-1)));
}

function problemWith(comment) {
  if (comment.type === "Shebang" || ALLOWED_TOOL_COMMENT.test(comment.value)) return undefined;
  const directive = DIRECTIVE.exec(comment.value);
  if (!directive?.groups) return { messageId: "comment" };
  if (directive.groups.kind !== "disable-next-line") return { messageId: "scope" };
  const { rules, reason } = splitDirective(directive.groups.rest);
  if (reason === "") return { messageId: "reason" };
  const locked = lockedRuleIn(rules);
  return locked === undefined ? undefined : { messageId: "locked", data: { rule: locked } };
}

const noComments = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      comment: "Delete this comment. Rename or extract until the code says it. Only tool directives with a reason are allowed.",
      scope: "Disable one rule on the next line only, with eslint-disable-next-line or oxlint-disable-next-line.",
      reason: "Give the directive a reason after ` -- `.",
      locked: "{{rule}} has no escape hatch. Change the code instead.",
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const problem = problemWith(comment);
          if (problem) context.report({ loc: comment.loc, ...problem });
        }
      },
    };
  },
};

export default { meta: { name: "house" }, rules: { "no-comments": noComments } };
