import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const report = JSON.parse(
  readFileSync(".audit/typescript-standards/eslint.json", "utf8")
);
let count = 0;
function offset(lines, line, column) {
  return (
    lines.slice(0, line - 1).reduce((sum, value) => sum + value.length, 0) +
    column -
    1
  );
}
function fixes(file, legacy = false) {
  const source =
    file.output ?? file.source ?? readFileSync(file.filePath, "utf8");
  const parsed = ts.createSourceFile(file.filePath, source, 99, true);
  const jsx = [];
  function visit(node) {
    if (ts.isJsxExpression(node) && !node.expression) jsx.push(node);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const lines = source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const changes = [];
  for (const message of file.messages) {
    let start = offset(lines, message.line, message.column);
    let end = offset(lines, message.endLine, message.endColumn);
    const original = source.slice(start, end);
    if (message.ruleId === "@typescript-eslint/restrict-template-expressions")
      changes.push({ start, end, text: `String(${original})` });
    if (message.ruleId !== "local/no-comments") continue;
    if (
      (legacy || jsx.some((node) => node.pos <= start && node.end >= end)) &&
      source.slice(0, start).trimEnd().endsWith("{") &&
      source.slice(end).trimStart().startsWith("}")
    ) {
      const braceStart = source.lastIndexOf("{", start);
      const braceEnd = source.indexOf("}", end) + 1;
      if (
        source.slice(braceStart, start).trim() === "{" &&
        source.slice(end, braceEnd).trim() === "}"
      ) {
        start = braceStart;
        end = braceEnd;
      }
    }
    changes.push({ start, end, text: " " });
  }
  return changes;
}
function apply(source, changes) {
  for (const change of changes.sort((a, b) => b.start - a.start))
    source =
      source.slice(0, change.start) + change.text + source.slice(change.end);
  return source;
}
for (const file of report) {
  const changes = fixes(file);
  if (!changes.length) continue;
  const original =
    file.output ?? file.source ?? readFileSync(file.filePath, "utf8");
  const current = readFileSync(file.filePath, "utf8");
  const fixed = apply(original, changes);
  const before = ts.createSourceFile(file.filePath, original, 99, true);
  const after = ts.createSourceFile(file.filePath, fixed, 99, true);
  if (after.parseDiagnostics.length > before.parseDiagnostics.length)
    throw new Error(`Fix introduced invalid syntax: ${file.filePath}`);
  const legacy = apply(original, fixes(file, true));
  if (current === fixed) continue;
  if (fixed === legacy && current !== original) continue;
  if (current !== original && current !== legacy)
    throw new Error(`Report is stale: ${file.filePath}`);
  writeFileSync(file.filePath, fixed);
  count += changes.length;
}
console.log(`Applied ${count} mechanical fixes`);
