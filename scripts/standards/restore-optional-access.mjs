import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const paths = execFileSync("rg", ["--files", "-g", "*.ts", "-g", "*.tsx"], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
function signature(node) {
  if (ts.isPropertyAccessExpression(node))
    return signature(node.expression) + "." + node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteral(node.argumentExpression)
  )
    return signature(node.expression) + "." + node.argumentExpression.text;
  if (ts.isCallExpression(node) && node.expression.getText() === "fixtureValue")
    return signature(node.arguments[0]);
  return node.getText().replace(/\s/g, "");
}
function accesses(source) {
  const map = new Map();
  function visit(node) {
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const key = signature(node);
      const group = map.get(key) ?? [];
      group.push(node);
      map.set(key, group);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return map;
}
let total = 0;
for (const file of paths) {
  let before;
  try {
    before = execFileSync("git", ["show", `HEAD:${file}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    continue;
  }
  const current = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, current, 99, true);
  const original = accesses(ts.createSourceFile(file, before, 99, true));
  const edits = [];
  for (const [key, nodes] of accesses(source)) {
    const old = original.get(key);
    if (!old?.some((node) => node.questionDotToken)) continue;
    if (old.length !== nodes.length) {
      console.log(`SKIP ${file}: ${key}`);
      continue;
    }
    nodes.forEach((node, i) => {
      if (
        old[i].questionDotToken &&
        !node.questionDotToken &&
        ts.isElementAccessExpression(node)
      )
        edits.push(node.expression.end);
    });
  }
  let text = current;
  for (const position of edits.sort((a, b) => b - a))
    text = text.slice(0, position) + "?." + text.slice(position);
  if (edits.length) writeFileSync(file, text);
  total += edits.length;
}
console.log(`Restored ${total} optional accesses`);
