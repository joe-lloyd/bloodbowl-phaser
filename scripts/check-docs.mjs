/** Check public documentation without reading ignored reference material. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

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
  const tokens = marked.lexer(readFileSync(absolute, "utf8"));
  marked.walkTokens(tokens, (token) => {
    if (token.type !== "link" && token.type !== "image") return;
    const href = token.href;
    if (
      /^[a-z][a-z0-9+.-]*:/i.test(href) ||
      href.startsWith("#") ||
      href.startsWith("//")
    )
      return;
    const target = decodeURIComponent(href.split(/[?#]/)[0]);
    if (!target) return;
    const resolved = target.startsWith("/")
      ? path.resolve(root, target.slice(1))
      : path.resolve(path.dirname(absolute), target);
    if (!existsSync(resolved))
      failures.push(`${file}: missing link target ${href}`);
  });
}
// Runtime code must not import an ignored reference folder.
for (const file of tracked.filter((entry) =>
  /^src\/.*\.[cm]?[jt]sx?$/.test(entry)
)) {
  const absolute = path.join(root, file);
  if (
    existsSync(absolute) &&
    statSync(absolute).isFile() &&
    /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)\s*["'][^"']*docs\/(?:pdfs|rulebook)\//.test(
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
