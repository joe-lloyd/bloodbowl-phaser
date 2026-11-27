import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { byCodeUnit } from "../../../src/game/core/order";

export function acquisitionDigest(root: string): string {
  const hash = createHash("sha256");
  const add = (file: string) => {
    hash.update(path.relative(root, file).split(path.sep).join("/"));
    hash.update(readFileSync(file));
  };
  function visit(directory: string, typescriptOnly = false) {
    const items = [...readdirSync(directory, { withFileTypes: true })].sort(
      (a, b) => byCodeUnit(a.name, b.name)
    );
    for (const item of items) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) visit(file, typescriptOnly);
      else if (!typescriptOnly || item.name.endsWith(".ts")) add(file);
    }
  }
  visit(path.join(root, "src"));
  visit(path.join(root, "scripts/coach/catalogue-study"), true);
  for (const file of ["fingerprint.ts", "run.ts", "teams.ts", "schedule.ts"])
    add(path.join(root, "scripts/coach/advanced-study", file));
  for (const file of ["package.json", "pnpm-lock.yaml", "tsconfig.json"])
    add(path.join(root, file));
  return hash.digest("hex");
}
