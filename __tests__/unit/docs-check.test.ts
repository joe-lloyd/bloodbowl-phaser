import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const fixtures: string[] = [];
const repositoryEnvironmentKeys = execFileSync(
  "git",
  ["rev-parse", "--local-env-vars"],
  {
    encoding: "utf8",
  }
)
  .trim()
  .split("\n");

function isolatedGitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of repositoryEnvironmentKeys) delete env[key];
  return env;
}

function fixture(readme: string, files: Record<string, string> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "bb-docs-check-"));
  fixtures.push(root);
  mkdirSync(path.join(root, "scripts"));
  copyFileSync(
    "scripts/check-docs.mjs",
    path.join(root, "scripts/check-docs.mjs")
  );
  symlinkSync(
    path.resolve("node_modules"),
    path.join(root, "node_modules"),
    "junction"
  );
  const contents = { "README.md": readme, ...files };
  for (const [file, text] of Object.entries(contents)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  const env = isolatedGitEnvironment();
  execFileSync("git", ["init", "--quiet"], { cwd: root, env });
  execFileSync("git", ["add", "--", ...Object.keys(contents)], {
    cwd: root,
    env,
  });
  return () =>
    spawnSync(process.execPath, ["scripts/check-docs.mjs"], {
      cwd: root,
      env,
      encoding: "utf8",
    });
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of fixtures.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("documentation check CLI", () => {
  it("isolates fixtures from the caller's Git repository settings", () => {
    const caller = mkdtempSync(path.join(tmpdir(), "bb-docs-caller-"));
    fixtures.push(caller);
    const index = path.join(caller, "index");
    writeFileSync(index, "caller index remains unchanged\n");
    vi.stubEnv("GIT_INDEX_FILE", index);
    vi.stubEnv("GIT_DIR", path.join(caller, ".git"));
    vi.stubEnv("GIT_WORK_TREE", caller);
    const result = fixture("# Public docs\n")();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "Checked 1 public Markdown files; links resolve and private references are untracked.\n"
    );
    expect(readFileSync(index, "utf8")).toBe(
      "caller index remains unchanged\n"
    );
  });

  it.each([
    "[guide][reference]\n\n[reference]: docs/missing.md",
    "[reference][]\n\n[reference]: docs/missing.md",
    "[reference]\n\n[reference]: docs/missing.md",
    "![image][reference]\n\n[reference]: docs/missing.md",
  ])("rejects a broken reference destination in %s", (markdown) => {
    const result = fixture(markdown)();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "README.md: missing link target docs/missing.md"
    );
  });

  it("accepts angle-bracket destinations with titles and resolved references", () => {
    const check = fixture(
      '[guide](<docs/DEVELOPMENT.md> "Guide")\n\n[guide][reference]\n\n[reference]: <docs/DEVELOPMENT.md> "Guide"',
      { "docs/DEVELOPMENT.md": "# Development\n" }
    );
    const result = check();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "Checked 2 public Markdown files; links resolve and private references are untracked.\n"
    );
  });

  it.each([
    'import "../../docs/rulebook/skills.json";',
    'import rules from "../../docs/rulebook/skills.json";',
    'await import("../../docs/rulebook/skills.json");',
  ])("rejects a private runtime dependency: %s", (source) => {
    const result = fixture("# Public docs\n", { "src/example.ts": source })();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "src/example.ts: runtime import depends on private references"
    );
  });

  it("rejects tracked private books", () => {
    const result = fixture("# Public docs\n", {
      "docs/pdfs/reference.PDF": "Synthetic probe",
    })();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "docs/pdfs/reference.PDF: private reference material must stay ignored"
    );
  });
});
