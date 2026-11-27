import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOTS = [
  "__tests__",
  "src/testing",
  "src/data/ruleScenarios",
  "e2e",
  "scripts",
];
const SEATS = new Map([
  ["team1", 0],
  ["team2", 1],
]);
const LIST_OWNERS = [
  "src/headless/createHeadlessGame.ts",
  "src/services/ServiceContainer.ts",
  "src/services/GameService.ts",
  "src/services/gameService/matchStart.ts",
  "src/game/rules-lab/references.ts",
];

const root = process.cwd();
const config = ts.getParsedCommandLineOfConfigFile(
  path.join(root, "tsconfig.json"),
  {},
  { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }
);
const program = ts.createProgram(config.fileNames, config.options);
const checker = program.getTypeChecker();
const unhandled = [];

function inRoots(fileName) {
  const relative = path.relative(root, fileName);
  return ROOTS.some((dir) => relative.startsWith(`${dir}/`));
}

function takesTeamList(type) {
  if (!type) return false;
  const solid = checker.getNonNullableType(type);
  const candidates = solid.isUnion() ? solid.types : [solid];
  return candidates.some((candidate) => {
    const teams = checker.getPropertyOfType(candidate, "teams");
    const file = teams?.valueDeclaration?.getSourceFile().fileName ?? "";
    return (
      !checker.getPropertyOfType(candidate, "team1") &&
      LIST_OWNERS.some((owner) => file.endsWith(owner))
    );
  });
}

function note(sourceFile, node, why) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  unhandled.push(
    `${path.relative(root, sourceFile.fileName)}:${String(line + 1)} ${why}`
  );
}

function accessEdit(node) {
  return {
    start: node.name.getStart(),
    end: node.name.end,
    text: `teams[${String(SEATS.get(node.name.text))}]`,
  };
}

function seatProperty(property) {
  const name = property.name && ts.isIdentifier(property.name) ? property.name.text : "";
  return SEATS.has(name) ? name : null;
}

function valueText(property, sourceFile) {
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text;
  return property.initializer.getText(sourceFile);
}

function removal(properties, index) {
  const property = properties[index];
  const next = properties[index + 1];
  if (next) return { start: property.getStart(), end: next.getStart(), text: "" };
  return { start: properties[index - 1].end, end: property.end, text: "" };
}

function literalEdits(node, sourceFile) {
  const properties = node.properties;
  const seats = properties.flatMap((property, index) => {
    const seat = seatProperty(property);
    return seat ? [{ seat, index, property }] : [];
  });
  if (seats.length === 0) return [];
  const first = seats.find((entry) => entry.seat === "team1");
  const second = seats.find((entry) => entry.seat === "team2");
  if (seats.length !== 2 || !first || !second) {
    note(sourceFile, node, "option object without both team1 and team2");
    return [];
  }
  const list = `teams: [${valueText(first.property, sourceFile)}, ${valueText(second.property, sourceFile)}]`;
  return [
    { start: first.property.getStart(), end: first.property.end, text: list },
    removal(properties, second.index),
  ];
}

function seatSlots(elements, names, sourceFile) {
  const slots = ["", ""];
  elements.forEach((element, index) => {
    if (SEATS.has(names[index])) {
      slots[SEATS.get(names[index])] = element.name.getText(sourceFile);
    }
  });
  return slots[1] ? `[${slots[0]}, ${slots[1]}]` : `[${slots[0]}]`;
}

function listInitializer(node, sourceFile) {
  const plain =
    ts.isIdentifier(node.initializer) ||
    ts.isPropertyAccessExpression(node.initializer) ||
    ts.isCallExpression(node.initializer);
  const source = node.initializer.getText(sourceFile);
  return {
    start: node.initializer.getStart(),
    end: node.initializer.end,
    text: plain ? `${source}.teams` : `(${source}).teams`,
  };
}

function rereadable(expression) {
  if (ts.isIdentifier(expression) || expression.kind === ts.SyntaxKind.ThisKeyword) return true;
  return ts.isPropertyAccessExpression(expression) && rereadable(expression.expression);
}

function splitEdits(node, names, sourceFile) {
  const statement = node.parent.parent;
  const elements = node.name.elements;
  const others = elements.filter((element, index) => !SEATS.has(names[index]));
  const { line } = sourceFile.getLineAndCharacterOfPosition(statement.getStart());
  const indent = /^\s*/.exec(sourceFile.text.split("\n")[line])[0];
  const keyword = node.parent.flags & ts.NodeFlags.Const ? "const" : "let";
  const list = `${keyword} ${seatSlots(elements, names, sourceFile)} = ${node.initializer.getText(sourceFile)}.teams;`;
  return [
    {
      start: node.name.getStart(),
      end: node.name.end,
      text: `{ ${others.map((element) => element.getText(sourceFile)).join(", ")} }`,
    },
    { start: statement.end, end: statement.end, text: `\n${indent}${list}` },
  ];
}

function splittable(node) {
  return (
    ts.isVariableDeclaration(node) &&
    ts.isVariableStatement(node.parent.parent) &&
    node.parent.declarations.length === 1 &&
    rereadable(node.initializer)
  );
}

function bindingEdits(node, sourceFile) {
  const elements = node.name.elements;
  const names = elements.map((element) =>
    (element.propertyName ?? element.name).getText(sourceFile)
  );
  const seated = elements.filter((element, index) => SEATS.has(names[index]));
  if (seated.length === 0) return [];
  if (seated.some((element) => element.initializer || !ts.isIdentifier(element.name))) {
    note(sourceFile, node, "destructures team1/team2 with a default or a pattern");
    return [];
  }
  if (seated.length < elements.length || !ts.isVariableDeclaration(node)) {
    if (splittable(node)) return splitEdits(node, names, sourceFile);
    note(sourceFile, node, "destructures team1/team2 beside other fields");
    return [];
  }
  return [
    { start: node.name.getStart(), end: node.name.end, text: seatSlots(elements, names, sourceFile) },
    listInitializer(node, sourceFile),
  ];
}

function destructuredType(node) {
  if (!node.name || !ts.isObjectBindingPattern(node.name)) return undefined;
  if (ts.isVariableDeclaration(node) && node.initializer) {
    return checker.getTypeAtLocation(node.initializer);
  }
  return ts.isParameter(node) ? checker.getTypeAtLocation(node) : undefined;
}

function editsAt(node, sourceFile) {
  if (ts.isPropertyAccessExpression(node) && SEATS.has(node.name.text)) {
    return takesTeamList(checker.getTypeAtLocation(node.expression)) ? [accessEdit(node)] : [];
  }
  if (ts.isObjectLiteralExpression(node)) {
    return takesTeamList(checker.getContextualType(node)) ? literalEdits(node, sourceFile) : [];
  }
  return takesTeamList(destructuredType(node)) ? bindingEdits(node, sourceFile) : [];
}

function collect(sourceFile) {
  const edits = [];
  const visit = (node) => {
    edits.push(...editsAt(node, sourceFile));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return edits;
}

function outermost(edits) {
  const inside = (inner, outer) =>
    inner !== outer &&
    outer.end > outer.start &&
    inner.start >= outer.start &&
    inner.end <= outer.end;
  const kept = edits.filter((edit) => !edits.some((other) => inside(edit, other)));
  nested += edits.length - kept.length;
  return kept;
}

function apply(text, edits) {
  return outermost(edits)
    .sort((a, b) => b.start - a.start || b.end - a.end)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text
    );
}

let nested = 0;
let changedFiles = 0;
let changedSites = 0;
const pending = [];
for (const sourceFile of program.getSourceFiles()) {
  if (sourceFile.isDeclarationFile || !inRoots(sourceFile.fileName)) continue;
  const edits = collect(sourceFile);
  if (edits.length === 0) continue;
  pending.push([sourceFile.fileName, apply(sourceFile.text, edits)]);
  changedFiles += 1;
  changedSites += edits.length;
}
for (const [fileName, text] of pending) fs.writeFileSync(fileName, text);

console.log(`Rewrote ${String(changedSites)} edits in ${String(changedFiles)} files.`);
for (const line of unhandled) console.log(`Fix by hand: ${line}`);
if (nested > 0) console.log(`Skipped ${String(nested)} nested edits. Run the codemod again.`);
