import fs from "node:fs";
import ts from "typescript";

const manifest = process.argv[2];
if (!manifest) throw new Error("Provide a caller migration manifest");
const records = JSON.parse(fs.readFileSync(manifest, "utf8"));

function tokens(text) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    text
  );
  const result = [];
  for (
    let kind = scanner.scan();
    kind !== ts.SyntaxKind.EndOfFileToken;
    kind = scanner.scan()
  ) {
    result.push(scanner.getTokenText());
  }
  return JSON.stringify(result);
}

for (const [file, recordsForFile] of Map.groupBy(
  records,
  (record) => record.file
)) {
  let source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const currentCalls = new Set();
  function collectCalls(node) {
    if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      node.arguments
    ) {
      currentCalls.add(
        tokens(source.slice(node.arguments.pos, node.arguments.end))
      );
      currentCalls.add(tokens(node.getText(ast)));
    }
    ts.forEachChild(node, collectCalls);
  }
  collectCalls(ast);
  const changes = recordsForFile.filter(
    (record) => !currentCalls.has(tokens(record.replacement))
  );
  let edits = [];
  function visit(node) {
    if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      node.arguments
    ) {
      const args = source.slice(node.arguments.pos, node.arguments.end);
      const name = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : node.expression.getText(ast);
      const change = changes.find(
        (record) =>
          name === record.name &&
          (tokens(record.old) === tokens(args) ||
            tokens(record.old) === tokens(node.getText(ast)))
      );
      if (change) {
        const wholeCall = tokens(change.old) === tokens(node.getText(ast));
        edits.push({
          start: wholeCall ? node.getStart(ast) : node.arguments.pos,
          end: wholeCall ? node.end : node.arguments.end,
          text: change.replacement,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  edits = edits.filter(
    (edit) =>
      !edits.some((outer) => outer.start < edit.start && outer.end >= edit.end)
  );
  if (edits.length !== changes.length)
    throw new Error(
      `${file}: matched ${edits.length}/${changes.length} changes`
    );
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  const updated = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true
  );
  if (updated.parseDiagnostics.length)
    throw new Error(`Invalid syntax in ${file}`);
  fs.writeFileSync(file, source);
}
console.log(`Applied ${records.length} caller migrations`);
