import { copyFileSync } from "node:fs";
import path from "node:path";

for (const name of ["index.ts", "worker.json"]) {
  copyFileSync(path.join(import.meta.dirname, name), path.join(import.meta.dirname, "../dist", name));
}
