import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { byCodeUnit } from "../../../src/game/core/order";
import { acquisitionDigest } from "../advanced-study/fingerprint";

export function policySourceDigest(root: string, lab: boolean): string {
  const hash = createHash("sha256").update(acquisitionDigest(root));
  const policyFiles = ["run.ts", "pool.ts", "schedule.ts"];

  if (existsSync(path.join(root, "scripts/coach/policy-study/fingerprint.ts")))
    policyFiles.push("fingerprint.ts");
  for (const file of policyFiles)
    hash
      .update(file)
      .update(readFileSync(path.join(root, "scripts/coach/policy-study", file)));
  if (lab) {
    const files = ["teams.ts", "evidence.ts"];
    if (existsSync(path.join(root, "scripts/coach/policy-lab/recover.ts")))
      files.push("recover.ts");
    for (const file of files)
      hash
        .update(file)
        .update(readFileSync(path.join(root, "scripts/coach/policy-lab", file)));
  }
  return hash.digest("hex");
}

export function treeDigest(base: string, paths: string[]): string {
  const hash = createHash("sha256");
  function visit(dir: string) {
    const entries = [...readdirSync(dir, { withFileTypes: true })].sort((a, b) =>
      byCodeUnit(a.name, b.name)
    );
    for (const item of entries) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) visit(file);
      else
        hash
          .update(path.relative(base, file).split(path.sep).join("/"))
          .update(readFileSync(file));
    }
  }
  for (const subpath of paths) {
    visit(path.join(base, subpath));
  }
  return hash.digest("hex");
}
