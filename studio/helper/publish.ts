import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Character } from "../boundary/studio";
import { DRAFTS, PUBLISHES, TREE, TREE_CHARACTERS } from "./paths";
import { run, type OnLine } from "./run";

const BRANCH = "studio/art";
const ART = ["public/sprites", "src/game/presentation/spriteManifest.json", "__tests__/fixtures/layered", "scripts/sprites/factory/characters"];
const PULL_REQUEST_BODY = "Sprite art exported from the character studio. Each commit adds or updates one model.";

const git = (...args: string[]) => run({ program: "git", args, cwd: TREE });
const gh = (...args: string[]) => run({ program: "gh", args, cwd: TREE });

async function openPullRequest(): Promise<string> {
  return gh("pr", "list", "--head", BRANCH, "--state", "open", "--json", "url", "-q", ".[0].url");
}

export async function refreshTree(): Promise<void> {
  if (!PUBLISHES) return;
  await git("fetch", "-q", "--prune", "origin");
  await git("reset", "-q", "--hard");
  await git("clean", "-fdq", ...ART);
  const pending = await openPullRequest();
  await git("checkout", "-q", "-B", BRANCH, pending ? `origin/${BRANCH}` : "origin/main");
  if (!pending) return;
  try {
    await git("rebase", "-q", "origin/main");
  } catch (error) {
    await git("rebase", "--abort").catch(() => {
      throw error;
    });
    throw new Error(`The open art pull request conflicts with main. Merge or close it, then export again: ${pending}`, { cause: error });
  }
}

export async function publish(character: Character, onLine: OnLine): Promise<void> {
  if (!PUBLISHES) {
    onLine("Installed. Changed files:");
    await run({ program: "git", args: ["status", "--short", "--", ...ART], cwd: TREE, onLine });
    return;
  }
  mkdirSync(TREE_CHARACTERS, { recursive: true });
  const file = `${character.key}.json`;
  copyFileSync(path.join(DRAFTS, file), path.join(TREE_CHARACTERS, file));
  await git("add", "-A", ...ART);
  if (await git("status", "--porcelain", "--", ...ART)) {
    await git("-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", `art: export ${character.label} from the character studio`);
  }
  await git("-c", "core.hooksPath=/dev/null", "push", "-q", "--force-with-lease", "-u", "origin", BRANCH);
  const pending = await openPullRequest();
  const url = pending || (await gh("pr", "create", "--base", "main", "--head", BRANCH, "--title", "Add art from the character studio", "--body", PULL_REQUEST_BODY));
  onLine(`Pull request: ${url.split("\n").pop() ?? ""}`);
}
