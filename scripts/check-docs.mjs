/** Check public documentation without reading ignored reference material. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gitFiles = (...args) =>
  execFileSync("git", ["ls-files", "-z", ...args], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
const tracked = gitFiles("--cached");
const failures = [];
for (const file of tracked) {
  if (
    /^docs\/(pdfs|rulebook)\//i.test(file) ||
    /^docs\/.*\.(pdf|epub|mobi)$/i.test(file)
  ) {
    failures.push(`${file}: private reference material must stay ignored`);
  }
}
const publicFiles = new Set([
  ...tracked,
  ...gitFiles("--others", "--exclude-standard"),
]);
let documents = 0;
for (const file of publicFiles) {
  if (
    !(file.startsWith("docs/") && file.endsWith(".md")) &&
    !/(^|\/)README\.md$/.test(file)
  )
    continue;
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) continue;
  documents++;
  const markdown = readFileSync(absolute, "utf8")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "");
  for (const match of markdown.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const href = match[1].replace(/^<|>$/g, "").split(/\s+"/)[0];
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
    const target = decodeURIComponent(href.split("#")[0]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(absolute), target);
    if (!existsSync(resolved))
      failures.push(`${file}: missing link target ${href}`);
  }
}
// Runtime code must not import an ignored reference folder.
for (const file of tracked.filter((entry) =>
  /^src\/.*\.[cm]?[jt]sx?$/.test(entry)
)) {
  const absolute = path.join(root, file);
  if (
    existsSync(absolute) &&
    statSync(absolute).isFile() &&
    /(?:from\s*|import\s*\()\s*["'][^"']*docs\/(?:pdfs|rulebook)\//.test(
      readFileSync(absolute, "utf8")
    )
  ) {
    failures.push(`${file}: runtime import depends on private references`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${documents} public Markdown files; links resolve and private references are untracked.`
  );
}
