import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const scope = process.argv[2];
if (!scope) throw Error("Provide a fixture directory");
let count = 0;
for (const f of fs
  .readdirSync(scope, { recursive: true })
  .filter((x) => x.endsWith(".ts"))) {
  const filename = path.join(scope, f);
  let source = fs.readFileSync(filename, "utf8");
  const ast = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const edits = [],
    imports = new Map();
  function schema(type) {
    switch (type.kind) {
      case ts.SyntaxKind.StringKeyword:
        return "z.string()";
      case ts.SyntaxKind.NumberKeyword:
        return "z.number()";
      case ts.SyntaxKind.BooleanKeyword:
        return "z.boolean()";
      case ts.SyntaxKind.UnknownKeyword:
        return "z.unknown()";
      case ts.SyntaxKind.UndefinedKeyword:
        return "z.undefined()";
    }
    if (ts.isTypeLiteralNode(type)) {
      const fields = type.members.map((m) => {
        if (!ts.isPropertySignature(m) || !m.type) throw Error("member");
        return (
          m.name.getText(ast) +
          ": " +
          schema(m.type) +
          (m.questionToken ? ".exactOptional()" : "")
        );
      });
      return "z.object({ " + fields.join(", ") + " })";
    }
    if (ts.isUnionTypeNode(type))
      return "z.union([" + type.types.map(schema).join(", ") + "])";
    if (ts.isArrayTypeNode(type)) return schema(type.elementType) + ".array()";
    if (ts.isParenthesizedTypeNode(type)) return schema(type.type);
    if (ts.isTypeQueryNode(type))
      return "z.literal(" + type.exprName.getText(ast) + ")";
    if (ts.isLiteralTypeNode(type))
      return type.literal.kind === ts.SyntaxKind.NullKeyword
        ? "z.null()"
        : "z.literal(" + type.literal.getText(ast) + ")";
    if (ts.isTypeReferenceNode(type)) {
      const name = type.typeName.getText(ast);
      if (name === "Record")
        return "z.record(" + type.typeArguments.map(schema).join(", ") + ")";
      const file = "src/boundary/schemas/" + name + ".ts";
      if (fs.existsSync(file)) {
        const variable = name[0].toLowerCase() + name.slice(1) + "Schema";
        imports.set(
          variable,
          path.relative(path.dirname(filename), file).replace(/\.ts$/, "")
        );
        return variable;
      }
    }
    throw Error("type " + type.getText(ast));
  }
  function visit(node) {
    if (
      ts.isAsExpression(node) &&
      !ts.isAsExpression(node.parent) &&
      node.type.getText(ast) !== "const"
    ) {
      const originalImports = new Map(imports);
      try {
        if (
          ts.isTypeLiteralNode(node.type) ||
          ts.isUnionTypeNode(node.type) ||
          node.expression.getText(ast).endsWith(".data")
        ) {
          const validation = schema(node.type);
          edits.push({
            start: node.getStart(ast),
            end: node.end,
            text: validation + ".parse(" + node.expression.getText(ast) + ")",
          });
          return;
        }
      } catch {
        imports.clear();
        for (const [k, v] of originalImports) imports.set(k, v);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (edits.length) {
    for (const e of edits.sort((a, b) => b.start - a.start))
      source = source.slice(0, e.start) + e.text + source.slice(e.end);
    source =
      'import { z } from "zod";\n' +
      [...imports]
        .map(([name, p]) => "import { " + name + ' } from "' + p + '";\n')
        .join("") +
      source;
    const next = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true
    );
    if (next.parseDiagnostics.length)
      throw Error("Invalid syntax: " + filename);
    fs.writeFileSync(filename, source);
    count += edits.length;
  }
}
console.log("Replaced " + count + " cast projections with runtime schemas");
