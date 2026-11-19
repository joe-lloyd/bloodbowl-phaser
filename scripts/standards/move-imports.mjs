import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const raw = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(raw.config, ts.sys, process.cwd());
const printer = ts.createPrinter();
let count = 0;
for (const file of config.fileNames) {
  if (file.includes("/src/ui/components/hud/")) continue;
  let source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const module = ts.resolveModuleName(node.moduleSpecifier.text, file, config.options, ts.sys).resolvedModule?.resolvedFileName.replace(/\.tsx?$/, "");
    const move = manifest.find((entry) => path.resolve(entry.oldModule) === module);
    if (!move) continue;
    const moved = bindings.elements.filter((item) => move.names.includes(item.propertyName?.text ?? item.name.text));
    if (!moved.length) continue;
    const retained = bindings.elements.filter((item) => !moved.includes(item));
    let replacement = "";
    if (retained.length || node.importClause.name) {
      const clause = ts.factory.updateImportClause(node.importClause, node.importClause.isTypeOnly, node.importClause.name,
        retained.length ? ts.factory.updateNamedImports(bindings, retained) : undefined);
      replacement += printer.printNode(ts.EmitHint.Unspecified, ts.factory.updateImportDeclaration(node, node.modifiers, clause, node.moduleSpecifier, node.attributes), ast) + "\n";
    }
    let relative = path.relative(path.dirname(file), path.resolve(move.newModule));
    if (!relative.startsWith(".")) relative = "./" + relative;
    replacement += `import ${node.importClause.isTypeOnly ? "type " : ""}{ ${moved.map((item) => item.getText(ast)).join(", ")} } from ${JSON.stringify(relative)};`;
    edits.push({ start: node.getStart(ast), end: node.end, text: replacement });
  }
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  if (edits.length) fs.writeFileSync(file, source);
  count += edits.length;
}
console.log(`Moved ${count} imports`);
