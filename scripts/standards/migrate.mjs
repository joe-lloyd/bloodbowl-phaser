import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const paths = execFileSync("rg", ["--files", "-g", "*.ts", "-g", "*.tsx"], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
const sources = paths.map((path) =>
  ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true
  )
);
const enums = new Set();
const directive =
  /^\s*(eslint-disable(-next-line|-line)?\s.*\s--\s+\S|@ts-expect-error\s+\S|prettier-ignore|[cv]8 ignore|istanbul ignore|<reference\s)/;
const phase = process.argv[2];
let changed = 0;

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

for (const source of sources) {
  visit(source, (node) => {
    if (ts.isEnumDeclaration(node)) enums.add(node.name.text);
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.type.getText(source).includes(`[keyof typeof ${node.name.text}]`)
    )
      enums.add(node.name.text);
  });
}

function writeChanges(source, changes) {
  let text = source.text;
  for (const change of changes.sort(
    (a, b) => b.start - a.start || b.end - a.end
  )) {
    text = text.slice(0, change.start) + change.text + text.slice(change.end);
  }
  if (text === source.text) return;
  writeFileSync(source.fileName, text);
  changed++;
}

function replaceEnum(node, source) {
  const name = node.name.text;
  const members = node.members.map((member) => {
    if (!member.initializer)
      throw new Error(
        `Enum requires an explicit value: ${source.fileName}:${name}`
      );
    return `${member.name.getText(source)}: ${member.initializer.getText(source)}`;
  });
  const exported = node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
  )
    ? "export "
    : "";
  return `${exported}const ${name} = {\n${members.join(",\n")}\n} as const;\n${exported}type ${name} = (typeof ${name})[keyof typeof ${name}];`;
}

function parameterProperties(node, source, changes) {
  const constructor = node.members.find(ts.isConstructorDeclaration);
  if (!constructor?.body) return;
  const parameters = constructor.parameters.filter((parameter) =>
    ts.isParameterPropertyDeclaration(parameter, constructor)
  );
  if (!parameters.length) return;
  const fields = parameters.map((parameter) => {
    if (!ts.isIdentifier(parameter.name))
      throw new Error(`Unsupported parameter property: ${source.fileName}`);
    const text = parameter.initializer?.getText(source);
    const inferred =
      text === "false" || text === "true"
        ? "boolean"
        : text === "MATCH_SAVE_STORAGE_KEY"
          ? "string"
          : "number";
    return `${parameter.modifiers.map((modifier) => modifier.getText(source)).join(" ")} ${parameter.name.text}${parameter.questionToken ? "?" : ""}: ${parameter.type?.getText(source) ?? inferred};`;
  });
  changes.push({
    start: constructor.getStart(source),
    end: constructor.getStart(source),
    text: fields.join("\n") + "\n",
  });
  for (const parameter of parameters) {
    changes.push({
      start: parameter.getStart(source),
      end: parameter.name.getStart(source),
      text: "",
    });
  }
  const superCall = constructor.body.statements.find(
    (statement) =>
      ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression) &&
      statement.expression.expression.kind === ts.SyntaxKind.SuperKeyword
  );
  const position = superCall?.end ?? constructor.body.getStart(source) + 1;
  const assignments = parameters.map(
    (parameter) =>
      `this.${parameter.name.getText(source)} = ${parameter.name.getText(source)};`
  );
  changes.push({
    start: position,
    end: position,
    text: "\n" + assignments.join("\n"),
  });
}

function syntax(source) {
  const changes = [];
  visit(source, (node) => {
    if (ts.isEnumDeclaration(node))
      changes.push({
        start: node.getStart(source),
        end: node.end,
        text: replaceEnum(node, source),
      });
    if (
      ts.isTypeReferenceNode(node) &&
      ts.isQualifiedName(node.typeName) &&
      enums.has(node.typeName.left.getText(source))
    ) {
      changes.push({
        start: node.getStart(source),
        end: node.getStart(source),
        text: "typeof ",
      });
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node))
      parameterProperties(node, source, changes);
  });
  writeChanges(source, changes);
}

function comments(source) {
  const ranges = new Map();
  function collect(comments) {
    for (const comment of comments ?? []) {
      const value = source.text.slice(
        comment.pos + 2,
        comment.end -
          (comment.kind === ts.SyntaxKind.MultiLineCommentTrivia ? 2 : 0)
      );
      if (!directive.test(value))
        ranges.set(comment.pos, {
          start: comment.pos,
          end: comment.end,
          text: "",
        });
    }
  }
  visit(source, (node) => {
    collect(ts.getLeadingCommentRanges(source.text, node.pos));
    collect(ts.getTrailingCommentRanges(source.text, node.end));
  });
  writeChanges(source, [...ranges.values()]);
}

function compiler(source) {
  const log = readFileSync(".audit/typescript-standards/typecheck.log", "utf8");
  const lines = log
    .split("\n")
    .filter((line) => line.startsWith(source.fileName + "("));
  const changes = new Map();
  for (const line of lines) {
    const match = line.match(/\((\d+),(\d+)\): error TS(1484|4111):/);
    if (!match) continue;
    const position = source.getPositionOfLineAndCharacter(
      Number(match[1]) - 1,
      Number(match[2]) - 1
    );
    visit(source, (node) => {
      if (node.getStart(source) > position || node.end <= position) return;
      if (match[3] === "1484" && ts.isImportSpecifier(node) && !node.isTypeOnly)
        changes.set(node.pos, {
          start: node.getStart(source),
          end: node.getStart(source),
          text: "type ",
        });
      if (
        match[3] === "4111" &&
        ts.isPropertyAccessExpression(node) &&
        node.name.getStart(source) === position
      )
        changes.set(node.pos, {
          start: node.expression.end,
          end: node.end,
          text: `${node.questionDotToken ? "?." : ""}[${JSON.stringify(node.name.text)}]`,
        });
    });
  }
  writeChanges(source, [...changes.values()]);
}

const phases = { syntax, comments, compiler };
if (!Object.hasOwn(phases, phase))
  throw new Error("Choose syntax, comments, or compiler");
for (const source of sources) phases[phase](source);
console.log(`${phase}: changed ${changed} files`);
