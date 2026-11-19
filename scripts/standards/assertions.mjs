import { writeFileSync } from "node:fs";
import ts from "typescript";

const raw = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(raw.config, ts.sys, process.cwd());
const program = ts.createProgram(config.fileNames, config.options);
const checker = program.getTypeChecker();
const backups = [];
let total = 0;
function removable(node) {
  if (
    (ts.isAsExpression(node.parent) ||
      ts.isTypeAssertionExpression(node.parent)) &&
    node.parent.expression === node
  )
    return false;
  if (node.type.getText() === "const") return false;
  const value = checker.getTypeAtLocation(node.expression);
  const target = checker.getTypeFromTypeNode(node.type);
  if ((value.flags | target.flags) & ts.TypeFlags.Any) return false;
  return checker.isTypeAssignableTo(value, target);
}
function editsFor(source) {
  const edits = [];
  function visit(node) {
    if (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
      removable(node)
    ) {
      if (
        ts.isArrayLiteralExpression(node.expression) &&
        !node.expression.elements.length &&
        ts.isArrayTypeNode(node.type)
      ) {
        edits.push({
          start: node.getStart(source),
          end: node.end,
          text: `new Array<${node.type.elementType.getText(source)}>()`,
        });
      } else if (ts.isAsExpression(node)) {
        const literal =
          ts.isObjectLiteralExpression(node.expression) ||
          ts.isArrayLiteralExpression(node.expression);
        const text =
          literal && !ts.isVariableDeclaration(node.parent)
            ? " satisfies " + node.type.getText(source)
            : "";
        edits.push({ start: node.expression.end, end: node.end, text });
      } else
        edits.push({
          start: node.getStart(source),
          end: node.expression.getStart(source),
          text: "",
        });
      if (ts.isVariableDeclaration(node.parent) && !node.parent.type)
        edits.push({
          start: node.parent.name.end,
          end: node.parent.name.end,
          text: ": " + node.type.getText(source),
        });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return edits;
}
for (const source of program.getSourceFiles()) {
  if (source.isDeclarationFile || source.fileName.includes("node_modules"))
    continue;
  const edits = editsFor(source);
  if (!edits.length) continue;
  let text = source.text;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  const next = ts.createSourceFile(source.fileName, text, 99, true);
  if (next.parseDiagnostics.length > source.parseDiagnostics.length)
    throw new Error(`Invalid syntax: ${source.fileName}`);
  backups.push({ file: source.fileName, before: source.text });
  writeFileSync(source.fileName, text);
  total += edits.length;
}
writeFileSync(
  ".audit/typescript-standards/assertion-backup.json",
  JSON.stringify(backups)
);
console.log(`Removed ${total} assertion edits`);
