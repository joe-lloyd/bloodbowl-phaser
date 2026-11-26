import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { acquisitionDigest } from "../advanced-study/fingerprint";

export function policySourceDigest(root: string, lab: boolean): string {
  const hash = createHash("sha256").update(acquisitionDigest(root));
  const policyFiles = ["run.ts", "pool.ts", "schedule.ts"];

  if (existsSync(join(root, "scripts/coach/policy-study/fingerprint.ts")))
    policyFiles.push("fingerprint.ts");
  for (const file of policyFiles)
    hash
      .update(file)
      .update(readFileSync(join(root, "scripts/coach/policy-study", file)));
  if (lab) {
    const files = ["teams.ts", "evidence.ts"];
    if (existsSync(join(root, "scripts/coach/policy-lab/recover.ts")))
      files.push("recover.ts");
    for (const file of files)
      hash
        .update(file)
        .update(readFileSync(join(root, "scripts/coach/policy-lab", file)));
  }
  return hash.digest("hex");
}

export function treeDigest(base: string, paths: string[]): string {
  const hash = createHash("sha256");
  function visit(path: string) {
    for (const item of readdirSync(path, { withFileTypes: true }).toSorted(
      (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    )) {
      const file = join(path, item.name);
      if (item.isDirectory()) visit(file);
      else
        hash
          .update(relative(base, file).split(sep).join("/"))
          .update(readFileSync(file));
    }
  }
  for (const path of paths) {
    visit(join(base, path));
  }
  return hash.digest("hex");
}
