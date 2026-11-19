import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const raw = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(raw.config, ts.sys, process.cwd());
const program = ts.createProgram(config.fileNames, config.options);
const checker = program.getTypeChecker();
let count = 0;
function maybeUndefined(node) {
  const type = checker.getTypeAtLocation(node);
  return (
    Boolean(type.flags & ts.TypeFlags.Undefined) ||
    (type.isUnion() &&
      type.types.some((item) => item.flags & ts.TypeFlags.Undefined))
  );
}
function stable(node) {
  if (ts.isIdentifier(node)) return true;
  if (node.kind === ts.SyntaxKind.ThisKeyword) return true;
  return ts.isPropertyAccessExpression(node) && stable(node.expression);
}
function optionalProperties(node, source, edits) {
  const target = checker.getContextualType(node);
  if (!target) return;
  for (const property of node.properties) {
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    )
      continue;
    const name = property.name.getText(source).replace(/^['"]|['"]$/g, "");
    const symbol = checker.getPropertyOfType(target, name);
    const value = ts.isPropertyAssignment(property)
      ? property.initializer
      : property.name;
    if (
      !symbol ||
      !(symbol.flags & ts.SymbolFlags.Optional) ||
      !stable(value) ||
      !maybeUndefined(value)
    )
      continue;
    const text = value.getText(source);
    const replacement = `...(${text} === undefined ? {} : { ${property.name.getText(source)}: ${text} })`;
    edits.set(property.getStart(source), {
      start: property.getStart(source),
      end: property.end,
      text: replacement,
    });
  }
}
function fields(node, source, edits) {
  if (!ts.isPropertyDeclaration(node) || !node.questionToken || !node.type)
    return;
  edits.set(node.questionToken.pos, {
    start: node.questionToken.pos,
    end: node.questionToken.end,
    text: "",
  });
  edits.set(node.type.pos, {
    start: node.type.getStart(source),
    end: node.type.end,
    text: `(${node.type.getText(source)}) | undefined`,
  });
}
function visit(node, source, edits) {
  if (ts.isObjectLiteralExpression(node))
    optionalProperties(node, source, edits);
  fields(node, source, edits);
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left) &&
    node.right.getText(source) === "undefined"
  ) {
    const symbol = checker.getSymbolAtLocation(node.left.name);
    if (
      symbol?.declarations?.some(
        (declaration) =>
          ts.isPropertySignature(declaration) && declaration.questionToken
      )
    )
      edits.set(node.getStart(source), {
        start: node.getStart(source),
        end: node.end,
        text: `delete ${node.left.getText(source)}`,
      });
  }
  ts.forEachChild(node, (child) => visit(child, source, edits));
}
for (const source of program.getSourceFiles()) {
  if (source.isDeclarationFile || source.fileName.includes("node_modules"))
    continue;
  const edits = new Map();
  visit(source, source, edits);
  if (!edits.size) continue;
  let text = source.text;
  for (const edit of [...edits.values()].sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  const parsed = ts.createSourceFile(source.fileName, text, 99, true);
  if (parsed.parseDiagnostics.length > source.parseDiagnostics.length)
    throw new Error(`Invalid syntax: ${source.fileName}`);
  writeFileSync(source.fileName, text);
  count += edits.size;
}
console.log(`Updated ${count} optional properties`);
