import fs from "node:fs";
import ts from "typescript";
import { execFileSync } from "node:child_process";

const options = {
  declareAction: ["playerId", "action", "blockReplacement", "options"],
  executePush: [
    "attackerId",
    "defenderId",
    "direction",
    "resultType",
    "followUp",
  ],
  rollBlockDice: ["attackerId", "defenderId", "numDice", "isAttackerChoice"],
  throwBall: ["passerId", "targetX", "targetY", "hailMary"],
};
const files = execFileSync("rg", ["--files", "__tests__/unit/controllers"], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
files.push("__tests__/unit/managers/HighlightManager.test.ts");
let count = 0;
for (const file of files.filter((file) => file.endsWith(".ts"))) {
  let source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const matcher = node.expression.name.text;
      const expectation = node.expression.expression;
      if (
        [
          "toHaveBeenCalledWith",
          "toHaveBeenLastCalledWith",
          "toHaveBeenNthCalledWith",
        ].includes(matcher) &&
        ts.isCallExpression(expectation) &&
        expectation.expression.getText(ast) === "expect"
      ) {
        const target = expectation.arguments[0];
        const name =
          target && ts.isPropertyAccessExpression(target)
            ? target.name.text
            : undefined;
        const offset = matcher === "toHaveBeenNthCalledWith" ? 1 : 0;
        const args = node.arguments.slice(offset);
        if (
          name === "highlightSquare" &&
          args.length >= 3 &&
          !ts.isObjectLiteralExpression(args[0])
        ) {
          const replacement = `{ x: ${args[0].getText(ast)}, y: ${args[1].getText(ast)} }, ${args
            .slice(2)
            .map((arg) => arg.getText(ast))
            .join(", ")}`;
          edits.push({
            start: args[0].getStart(ast),
            end: node.arguments.end,
            text: replacement,
          });
        }
        if (name && options[name] && args.length >= 2) {
          const fields = args.flatMap((arg, index) =>
            arg.getText(ast) === "undefined"
              ? []
              : [`${options[name][index]}: ${arg.getText(ast)}`]
          );
          edits.push({
            start: args[0].getStart(ast),
            end: node.arguments.end,
            text: `{ ${fields.join(", ")} }`,
          });
        }
      }
    }
    if (ts.isStringLiteral(node)) {
      const match = /^(declareAction|executePush)\((.*)\)$/.exec(node.text);
      if (match && !match[2].startsWith("{")) {
        const values = JSON.parse(`[${match[2]}]`);
        const value = Object.fromEntries(
          values.map((item, index) => [options[match[1]][index], item])
        );
        edits.push({
          start: node.getStart(ast),
          end: node.end,
          text: JSON.stringify(`${match[1]}(${JSON.stringify(value)})`),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  if (
    ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
      .parseDiagnostics.length
  )
    throw new Error(`Invalid syntax: ${file}`);
  if (edits.length) fs.writeFileSync(file, source);
  count += edits.length;
}
console.log(`Migrated ${count} mock call assertions`);
