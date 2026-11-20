import { build } from "vite";
import path from "node:path";

const out = path.resolve(process.argv[2]);

await build({
  configFile: false,
  logLevel: "warn",
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: path.dirname(out),
    minify: false,
    lib: {
      entry: path.resolve("src/game/names/playerNames.ts"),
      formats: ["es"],
      fileName: () => path.basename(out),
    },
  },
});
