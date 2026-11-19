import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const raw = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(raw.config, ts.sys, process.cwd());
const program = ts.createProgram(config.fileNames, config.options);
const checker = program.getTypeChecker();
const scope = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const helper = path.resolve("src/testing/fixtureValue.ts");
const supported = new Set([2532, 18048, 18047, 2531, 2722, 2345, 2322, 2538]);
let total = 0;

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}
function optional(node) {
  const type = checker.getTypeAtLocation(node);
  return (
    type.isUnion() &&
    type.types.some(
      (part) => part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)
    )
  );
}
function expressionAt(source, diagnostic) {
  let found;
  visit(source, (node) => {
    if (
      node.getStart(source) !== diagnostic.start ||
      node.end !== diagnostic.start + diagnostic.length
    )
      return;
    if (ts.isExpressionNode(node) && optional(node)) found = node;
    if (
      ts.isIdentifier(node) &&
      ts.isPropertyAssignment(node.parent) &&
      optional(node.parent.initializer)
    )
      found = node.parent.initializer;
    if (
      ts.isIdentifier(node) &&
      ts.isVariableDeclaration(node.parent) &&
      node.parent.initializer &&
      optional(node.parent.initializer)
    )
      found = node.parent.initializer;
  });
  return found;
}
function changesFor(source) {
  const nodes = new Map();
  const removals = [];
  visit(source, (node) => {
    if (!ts.isNonNullExpression(node)) return;
    nodes.set(
      node.getStart(source) + ":" + node.expression.end,
      node.expression
    );
    removals.push({ start: node.end - 1, end: node.end, text: "" });
  });
  for (const diagnostic of program.getSemanticDiagnostics(source)) {
    if (!supported.has(diagnostic.code)) continue;
    const node = expressionAt(source, diagnostic);
    if (
      node &&
      !(ts.isBinaryExpression(node.parent) && node.parent.left === node)
    )
      nodes.set(node.getStart(source) + ":" + node.end, node);
  }
  const changes = [...removals];
  for (const node of nodes.values()) {
    changes.push({
      start: node.getStart(source),
      end: node.getStart(source),
      text: "fixtureValue(",
    });
    changes.push({ start: node.end, end: node.end, text: ")" });
  }
  return { changes, count: nodes.size };
}
for (const source of program.getSourceFiles()) {
  if (source.isDeclarationFile || source.fileName.includes("node_modules"))
    continue;
  if (scope && !path.resolve(source.fileName).startsWith(scope + path.sep))
    continue;
  if (
    !scope &&
    !/(?:__tests__|\/e2e\/|\/testing\/cases\/|\.(test|spec)\.)/.test(
      source.fileName
    )
  )
    continue;
  const { changes, count } = changesFor(source);
  if (!count) continue;
  let text = source.text;
  for (const change of changes.sort(
    (a, b) => b.start - a.start || b.end - a.end
  ))
    text = text.slice(0, change.start) + change.text + text.slice(change.end);
  let relative = path
    .relative(path.dirname(source.fileName), helper)
    .replace(/\.ts$/, "");
  if (!relative.startsWith(".")) relative = "./" + relative;
  if (!text.includes("import { fixtureValue }"))
    text = `import { fixtureValue } from ${JSON.stringify(relative)};\n` + text;
  const parsed = ts.createSourceFile(source.fileName, text, 99, true);
  if (parsed.parseDiagnostics.length > source.parseDiagnostics.length)
    throw new Error(`Invalid syntax: ${source.fileName}`);
  writeFileSync(source.fileName, text);
  total += count;
}
console.log(`Checked ${total} fixture values`);
