import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
const paths = execFileSync("rg", ["--files", "-g", "*.ts", "-g", "*.tsx"], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
let count = 0;
for (const file of paths) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, 99, true);
  const edits = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "emit" &&
      node.arguments.length === 1
    )
      edits.push(node.arguments.end);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!edits.length) continue;
  let content = text;
  for (const position of edits.sort((a, b) => b - a))
    content =
      content.slice(0, position) + ", undefined" + content.slice(position);
  writeFileSync(file, content);
  count += edits.length;
}
console.log(`Made ${count} empty event payloads explicit`);
