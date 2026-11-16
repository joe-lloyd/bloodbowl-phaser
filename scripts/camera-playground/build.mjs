import { cp, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { build } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(root, "../..");
const outDir = resolve(process.argv[2] ?? join(repo, "dist/camera-playground"));
if (
  outDir === repo ||
  outDir === root ||
  (!outDir.endsWith("camera-playground") &&
    !outDir.endsWith("camera-playground-2026-11-16"))
) {
  throw new Error(
    "Use a camera-playground output folder. The build replaces its contents."
  );
}
await build({
  configFile: false,
  root,
  base: "./",
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2020",
    rollupOptions: {
      input: [join(root, "index.html"), join(root, "compare.html")],
    },
  },
});
await mkdir(join(outDir, "assets/stadium"), { recursive: true });
for (const layer of ["base", "home", "away"]) {
  await cp(
    join(repo, `public/stadium/bloodbowl/${layer}.webp`),
    join(outDir, `assets/stadium/${layer}.webp`)
  );
}
for (const model of ["human_blitzer", "orc_blitzer"]) {
  await mkdir(join(outDir, "assets", model), { recursive: true });
  for (const layer of ["base", "kit1", "kit2"]) {
    await cp(
      join(repo, `public/sprites/bloodbowl/${model}/${layer}.png`),
      join(outDir, `assets/${model}/${layer}.png`)
    );
  }
}
await stat(join(outDir, "index.html"));
process.stdout.write(`Camera playground built at ${outDir}\n`);
