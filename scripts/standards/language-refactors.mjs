import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const configFile = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  process.cwd()
);
const versions = new Map();
const snapshots = new Map();
const host = {
  ...ts.sys,
  getCompilationSettings: () => config.options,
  getScriptFileNames: () => config.fileNames,
  getScriptVersion: (file) => String(versions.get(file) ?? 0),
  getScriptSnapshot(file) {
    if (!snapshots.has(file)) {
      const content = ts.sys.readFile(file);
      if (content === undefined) return undefined;
      snapshots.set(file, ts.ScriptSnapshot.fromString(content));
    }
    return snapshots.get(file);
  },
  getCurrentDirectory: () => process.cwd(),
  getCanonicalFileName: (file) => file,
  useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
};
const service = ts.createLanguageService(host);
const visited = new Set();
const refactor = "Convert parameters to destructured object";
let count = 0;
const limit = Number(process.argv[2] ?? "20");
const scope = process.argv[3];

function candidates(source) {
  const found = [];
  function visit(node) {
    if (ts.isFunctionLike(node) && node.body && node.parameters.length > 3)
      found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function applyEdits(edits) {
  const files = edits.map((edit) => {
    const before = readFileSync(edit.fileName, "utf8");
    let content = before;
    for (const change of edit.textChanges.sort(
      (a, b) => b.span.start - a.span.start
    )) {
      content =
        content.slice(0, change.span.start) +
        change.newText +
        content.slice(change.span.start + change.span.length);
    }
    const old = ts.createSourceFile(edit.fileName, before, 99, true);
    const next = ts.createSourceFile(edit.fileName, content, 99, true);
    if (next.parseDiagnostics.length > old.parseDiagnostics.length)
      throw new Error(`Refactor introduced invalid syntax: ${edit.fileName}`);
    return { file: edit.fileName, before, content };
  });
  writeFileSync(
    `.audit/typescript-standards/parameter-backup-${String(Date.now())}.json`,
    JSON.stringify(files)
  );
  for (const { file, content } of files) {
    writeFileSync(file, content);
    snapshots.delete(file);
    versions.set(file, (versions.get(file) ?? 0) + 1);
  }
}

function convert(source, node) {
  const key =
    source.fileName +
    ":" +
    (node.name?.getText(source) ?? node.getText(source).slice(0, 90));
  if (count >= limit || visited.has(key)) return false;
  visited.add(key);
  const position = node.parameters[0].getStart(source);
  const available = service.getApplicableRefactors(
    source.fileName,
    position,
    {},
    "invoked"
  );
  if (!available.some((item) => item.name === refactor)) return false;
  let result;
  try {
    result = service.getEditsForRefactor(
      source.fileName,
      { indentSize: 2, convertTabsToSpaces: true },
      position,
      refactor,
      refactor,
      {}
    );
  } catch (error) {
    console.log(`SKIP ${key}: ${error.message}`);
    return false;
  }
  if (!result?.edits.length) return false;
  applyEdits(result.edits);
  count++;
  console.log(`${count}: ${key}`);
  return true;
}

for (const file of config.fileNames) {
  if (count >= limit) break;
  if (scope && !file.includes(scope)) continue;
  if (!file.includes("/src/") || /\.(test|spec)\./.test(file)) continue;
  let changed = true;
  while (changed) {
    const source = service.getProgram().getSourceFile(file);
    changed = candidates(source).some((node) => convert(source, node));
  }
}
console.log(`Converted ${count} functions`);
