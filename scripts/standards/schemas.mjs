import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const source = program.getSourceFile("src/headless/serialization.ts");
const declaration = source.statements.find(
  (node) => ts.isInterfaceDeclaration(node) && node.name.text === "MatchSave"
);
const root = checker.getTypeAtLocation(declaration);
const destination = "src/boundary/schemas";
const modules = new Map();
const imports = new Map();
const active = new Set();
const named = new Map();
const LEGACY_DEFAULTS = new Map([
  ["TurnSnapshot.hasThrownTeamMate", "false"],
  ["TurnSnapshot.hasKickedTeamMate", "false"],
  ["TurnSnapshot.hasThrownBomb", "false"],
]);
const LENIENT_ARRAYS = new Set(["Player.keywords"]);

function exportedName(type) {
  const symbol = type.aliasSymbol ?? type.symbol;
  return declarationName(
    symbol?.declarations?.find(
      (item) =>
        ts.isInterfaceDeclaration(item) || ts.isTypeAliasDeclaration(item)
    )
  );
}

function declaredAlias(location) {
  const node = location?.type;
  if (!node || !ts.isTypeReferenceNode(node) || node.typeArguments) return;
  let symbol = checker.getSymbolAtLocation(node.typeName);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias)
    symbol = checker.getAliasedSymbol(symbol);
  const metadata = declarationName(
    symbol?.declarations?.find(ts.isTypeAliasDeclaration)
  );
  const type = checker.getTypeFromTypeNode(node);
  if (!metadata || checker.isArrayType(type) || checker.isTupleType(type))
    return;
  return { type, metadata };
}

function declarationName(node) {
  if (
    !node?.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    )
  )
    return;
  const filename = node.getSourceFile().fileName;
  if (!filename.includes("/src/") && !filename.startsWith("src/")) return;
  const name = node.name.text;
  return {
    name,
    filename,
    schema: `${name[0].toLowerCase()}${name.slice(1)}Schema`,
  };
}

function useImport(module, name, specifier, isType = false) {
  const list = imports.get(module) ?? new Map();
  list.set(`${isType}:${name}:${specifier}`, { name, specifier, isType });
  imports.set(module, list);
}

function unionParts(type) {
  const parts = type.origin?.isUnion() ? type.origin.types : type.types;
  return parts.flatMap((part) =>
    part.isUnion() && !exportedName(part) ? unionParts(part) : [part]
  );
}

function schema(type, context, hint) {
  const metadata = exportedName(type);
  if (
    metadata &&
    type !== context.type &&
    !checker.isArrayType(type) &&
    !checker.isTupleType(type)
  ) {
    const entry = emit(type, metadata);
    useImport(context.file, entry.schema, `./${entry.name}`);
    return entry.schema;
  }
  return expression(type, context, hint);
}

function expression(type, context, hint) {
  const flags = type.flags;
  if (flags & ts.TypeFlags.Any) throw new Error(`Unsafe any at ${hint}`);
  if (flags & ts.TypeFlags.Unknown) return "z.unknown()";
  if (flags & ts.TypeFlags.Never) return "z.never()";
  if (flags & ts.TypeFlags.Undefined) return "z.undefined()";
  if (flags & ts.TypeFlags.Null) return "z.null()";
  if (flags & ts.TypeFlags.StringLiteral)
    return `z.literal(${JSON.stringify(type.value)})`;
  if (flags & ts.TypeFlags.NumberLiteral) return `z.literal(${type.value})`;
  if (flags & ts.TypeFlags.BooleanLiteral)
    return `z.literal(${type.intrinsicName})`;
  if (flags & ts.TypeFlags.String) return "z.string()";
  if (flags & ts.TypeFlags.Number) return "z.number()";
  if (flags & ts.TypeFlags.Boolean) return "z.boolean()";
  if (type.isUnion()) {
    const variants = unionParts(type).map((variant) =>
      schema(variant, context, hint)
    );
    if (
      variants.length === 2 &&
      variants.includes("z.literal(true)") &&
      variants.includes("z.literal(false)")
    )
      return "z.boolean()";
    return `z.union([${variants.join(", ")}])`;
  }
  if (checker.isTupleType(type)) {
    const args = checker.getTypeArguments(type);
    const elements = args.map((element, index) => {
      const child = schema(element, context, `${hint}[${index}]`);
      const flag = type.target.elementFlags[index];
      return flag & ts.ElementFlags.Rest ? `${child}.array()` : child;
    });
    const restIndex = type.target.elementFlags.findIndex(
      (flag) => flag & ts.ElementFlags.Rest
    );
    if (restIndex < 0) return `z.tuple([${elements.join(", ")}])`;
    if (restIndex !== elements.length - 1)
      throw new Error(`Unsupported tuple rest at ${hint}`);
    return `z.tuple([${elements.slice(0, -1).join(", ")}]).rest(${schema(args.at(-1), context, hint)})`;
  }
  if (checker.isArrayType(type))
    return `${schema(checker.getTypeArguments(type)[0], context, `${hint}[]`)}.array()`;
  if (type.getCallSignatures().length) throw new Error(`Function at ${hint}`);
  const properties = checker.getPropertiesOfType(type).filter((property) => type !== context.type || !context.ownFields || context.ownFields.has(property.name));
  const index = checker.getIndexTypeOfType(type, ts.IndexKind.String);
  if (index && properties.length === 0)
    return `z.record(z.string(), ${schema(index, context, `${hint}[key]`)})`;
  if (!properties.length && !index && !(type === context.type && context.ownFields))
    throw new Error(
      `Unsupported empty type ${checker.typeToString(type)} at ${hint}`
    );
  const fields = properties.map((property) => {
    const location = property.valueDeclaration ?? property.declarations?.[0];
    let value = checker.getTypeOfPropertyOfType(type, property.name);
    const optional = Boolean(property.flags & ts.SymbolFlags.Optional);
    const alias = declaredAlias(location);
    if (alias && alias.type !== context.type) {
      const entry = emit(alias.type, alias.metadata);
      useImport(context.file, entry.schema, `./${entry.name}`);
      return `${JSON.stringify(property.name)}: ${entry.schema}${optional ? ".exactOptional()" : ""}`;
    }
    if (optional && value.isUnion()) {
      const variants = (exportedName(value) ? [value] : unionParts(value)).filter(
        (variant) => !(variant.flags & ts.TypeFlags.Undefined)
      );
      const expressions = variants.map((variant) =>
        schema(variant, context, `${hint}.${property.name}`)
      );
      const field =
        expressions.length === 1
          ? expressions[0]
          : `z.union([${expressions.join(", ")}])`;
      return `${JSON.stringify(property.name)}: ${field}.exactOptional()`;
    }
    if (LENIENT_ARRAYS.has(`${hint}.${property.name}`) && checker.isArrayType(value)) {
      const item = schema(checker.getTypeArguments(value)[0], context, `${hint}.${property.name}[]`);
      return `${JSON.stringify(property.name)}: z.unknown().array().transform((items) => items.flatMap((item) => { const known = ${item}.safeParse(item); return known.success ? [known.data] : []; }))`;
    }
    const legacy = LEGACY_DEFAULTS.get(`${hint}.${property.name}`);
    const fallback = legacy === undefined ? "" : `.default(${legacy})`;
    return `${JSON.stringify(property.name)}: ${schema(value, context, `${hint}.${property.name}`)}${optional ? ".exactOptional()" : fallback}`;
  });
  const object = `z.looseObject({\n${fields.map((field) => `  ${field},`).join("\n")}\n})`;
  return index ? `${object}.catchall(${schema(index, context, hint)})` : object;
}

function emit(type, metadata = exportedName(type)) {
  if (named.has(type.id)) return named.get(type.id);
  if (!metadata)
    throw new Error(`Missing exported type for ${checker.typeToString(type)}`);
  const file = path.join(destination, `${metadata.name}.ts`);
  const entry = { ...metadata, file, type };
  named.set(type.id, entry);
  if (active.has(type.id))
    throw new Error(`Recursive schema for ${metadata.name}`);
  active.add(type.id);
  const declaration = (type.aliasSymbol ?? type.symbol)?.declarations?.find(
    ts.isTypeAliasDeclaration
  );
  const intersection =
    declaration && ts.isIntersectionTypeNode(declaration.type)
      ? declaration.type.types
      : undefined;
  const interfaceNode = type.symbol?.declarations?.find(ts.isInterfaceDeclaration);
  const bases = interfaceNode ? checker.getBaseTypes(type) : [];
  if (bases.length) entry.ownFields = new Set(interfaceNode.members.flatMap((member) => member.name ? [member.name.getText()] : []));
  let output =
    intersection?.length === 2
      ? `z.intersection(${schema(checker.getTypeFromTypeNode(intersection[0]), entry, metadata.name)}, ${schema(checker.getTypeFromTypeNode(intersection[1]), entry, metadata.name)})`
      : expression(type, entry, metadata.name);
  for (const base of bases) output = `z.intersection(${schema(base, entry, metadata.name)}, ${output})`;
  active.delete(type.id);
  const relative = path
    .relative(destination, metadata.filename)
    .replaceAll(path.sep, "/")
    .replace(/\.tsx?$/, "");
  useImport(
    file,
    metadata.name,
    relative.startsWith(".") ? relative : `./${relative}`,
    true
  );
  modules.set(
    file,
    `export const ${metadata.schema}: z.ZodType<${metadata.name}> = ${output};\n`
  );
  return entry;
}

emit(root);
const envelopeSource = program.getSourceFile("src/network/envelope.ts");
const envelopeDeclaration = envelopeSource.statements.find(
  (node) => ts.isTypeAliasDeclaration(node) && node.name.text === "Envelope"
);
emit(checker.getTypeAtLocation(envelopeDeclaration));
const recordingSource = program.getSourceFile("src/simulation/runMatch.ts");
const recordingDeclaration = recordingSource.statements.find(
  (node) =>
    (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
    node.name.text === "MatchRecording"
);
emit(checker.getTypeAtLocation(recordingDeclaration));
for (const [file, name] of [
  ["src/competition/types.ts", "CompetitionDoc"],
  ["src/firebase/lobby.ts", "LobbyDoc"],
]) {
  const rootSource = program.getSourceFile(file);
  const rootDeclaration = rootSource.statements.find(
    (node) =>
      (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
      node.name.text === name
  );
  emit(checker.getTypeAtLocation(rootDeclaration));
}
fs.mkdirSync(destination, { recursive: true });
for (const [file, body] of modules) {
  const lines = ['import { z } from "zod";'];
  for (const item of imports.get(file)?.values() ?? []) {
    lines.push(
      `import ${item.isType ? "type " : ""}{ ${item.name} } from ${JSON.stringify(item.specifier)};`
    );
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n\n${body}`);
}
console.log(`Generated ${modules.size} checked schema modules`);
