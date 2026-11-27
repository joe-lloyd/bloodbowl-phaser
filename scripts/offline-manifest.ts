import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

const MANIFEST_FILE = "offline-manifest.json";
const SKIPPED = new Set(["sw.js", MANIFEST_FILE]);
const MODEL_FILE = /^sprites\/bloodbowl\/(?!sideline_)([^/]+)\/(.+)$/;

type FileHashes = Record<string, string>;

interface OfflineManifest {
  core: FileHashes;
  models: Record<string, FileHashes>;
  bytes: Record<string, number>;
}

interface FileFacts {
  hash: string;
  size: number;
}

async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .filter((file) => !SKIPPED.has(file))
    .sort((a, b) => a.localeCompare(b));
}

async function factsOf(file: string): Promise<FileFacts> {
  const bytes = await readFile(file);
  return { hash: createHash("sha256").update(bytes).digest("hex").slice(0, 12), size: bytes.length };
}

function place(manifest: OfflineManifest, file: string, { hash, size }: FileFacts): void {
  const [, model, rest] = MODEL_FILE.exec(file) ?? [];
  if (model === undefined || rest === undefined) {
    manifest.core[`/${file}`] = hash;
    return;
  }
  const files = manifest.models[model] ?? {};
  files[rest] = hash;
  manifest.models[model] = files;
  manifest.bytes[model] = (manifest.bytes[model] ?? 0) + size;
}

async function writeOfflineManifest(root: string): Promise<void> {
  const manifest: OfflineManifest = { core: {}, models: {}, bytes: {} };
  const files = await filesUnder(root);
  for (const file of files) place(manifest, file, await factsOf(path.join(root, file)));
  await writeFile(path.join(root, MANIFEST_FILE), JSON.stringify(manifest));
}

export function offlineManifest(): Plugin {
  let outDir = "dist";
  return {
    name: "offline-manifest",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await writeOfflineManifest(outDir);
    },
  };
}
