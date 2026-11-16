/** Acquisition inputs only: report edits must not invalidate saved games. */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

export function acquisitionDigest(root: string): string {
  const hash = createHash("sha256");
  const add = (file: string) => {
    hash.update(relative(root, file).split(sep).join("/"));
    hash.update(readFileSync(file));
  };
  function visit(directory: string, typescriptOnly = false) {
    const items = readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    );
    for (const item of items) {
      const file = join(directory, item.name);
      if (item.isDirectory()) visit(file, typescriptOnly);
      else if (!typescriptOnly || item.name.endsWith(".ts")) add(file);
    }
  }
  visit(join(root, "src"));
  visit(join(root, "scripts/coach/catalogue-study"), true);
  for (const file of ["fingerprint.ts", "run.ts", "teams.ts", "schedule.ts"])
    add(join(root, "scripts/coach/advanced-study", file));
  for (const file of ["package.json", "pnpm-lock.yaml", "tsconfig.json"])
    add(join(root, file));
  return hash.digest("hex");
}
