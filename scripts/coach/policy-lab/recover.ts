/** Re-observe verified commands when only acquisition instrumentation changed. */
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { processPool } from "../policy-study/pool";
import { gunzipSync, gzipSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import { policySourceDigest, treeDigest } from "../policy-study/fingerprint";
import { replayStudyTrace } from "../catalogue-study/replay";
import type { PolicyJob } from "../policy-study/schedule";

interface Inputs {
  sourceDigest: string;
  baselineDigest: string;
  revision: string;
  opponent?: string;
  jobs: PolicyJob[];
  variants: unknown[];
}
const atomic = (file: string, data: unknown) => {
  writeFileSync(file + ".tmp", JSON.stringify(data));
  renameSync(file + ".tmp", file);
};
const sameInput = (a: Inputs, b: Inputs) =>
  a.baselineDigest === b.baselineDigest &&
  a.opponent === b.opponent &&
  isDeepStrictEqual(a.jobs, b.jobs) &&
  isDeepStrictEqual(a.variants, b.variants);

export function validateRecovery(
  old: Inputs,
  current: Inputs,
  oldSource: string,
  currentSource: string
): string {
  if (policySourceDigest(oldSource, true) !== old.sourceDigest)
    throw new Error("Recovery source differs from original manifest");
  const policyDigest = treeDigest(currentSource, ["src"]);
  if (treeDigest(oldSource, ["src"]) !== policyDigest)
    throw new Error("Recovery cannot reuse changed engine or AI code");
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "scripts/coach/policy-lab/teams.ts",
    "scripts/coach/policy-lab/evidence.ts",
    "scripts/coach/advanced-study/teams.ts",
    "scripts/coach/catalogue-study/play.ts",
  ]) {
    if (
      !readFileSync(join(oldSource, file)).equals(
        readFileSync(join(currentSource, file))
      )
    )
      throw new Error("Recovery cannot reuse changed gameplay input: " + file);
  }
  if (!sameInput(old, current))
    throw new Error(
      "Recovery requires identical builds, schedule and frozen opponent"
    );
  return policyDigest;
}

async function recoverGame(
  job: PolicyJob,
  oldRun: string,
  out: string,
  previous: Inputs
) {
  const oldFile = join(oldRun, "games", job.id + ".json"),
    newFile = join(out, "games", job.id + ".json");
  if (!existsSync(oldFile) || existsSync(newFile)) return;
  const result = JSON.parse(readFileSync(oldFile, "utf8"));
  if (
    !result.verifiedHash ||
    Object.entries(job).some(([k, v]) => !isDeepStrictEqual(result[k], v))
  )
    throw new Error("Invalid recovery game: " + job.id);
  const oldTrace = join(oldRun, "traces", job.id + ".json.gz");
  const replay = await replayStudyTrace(oldTrace);
  if (replay.hash !== result.verifiedHash)
    throw new Error("Recovery replay differs from verified game: " + job.id);
  const lineage = {
    revision: previous.revision,
    sourceDigest: previous.sourceDigest,
    traceSha256: createHash("sha256")
      .update(readFileSync(oldTrace))
      .digest("hex"),
  };
  const trace = JSON.parse(gunzipSync(readFileSync(oldTrace)).toString());
  const observations = {
    ...replay.observations,
    offered: result.offered,
    selected: result.selected,
  };
  writeFileSync(
    join(out, "traces", job.id + ".json.gz"),
    gzipSync(JSON.stringify({ ...trace, observations, recoveredFrom: lineage }))
  );
  atomic(newFile, {
    ...result,
    ...observations,
    verifiedHash: replay.hash,
    recoveredFrom: lineage,
  });
}

export async function recoverVerifiedGames(
  oldRun: string,
  oldSource: string,
  currentSource: string,
  out: string,
  current: Inputs
) {
  if (!oldSource || oldSource === currentSource)
    throw new Error("--reuse-source must name the archived acquisition source");
  const previous = JSON.parse(
    readFileSync(join(oldRun, "manifest.json"), "utf8")
  ) as Inputs;
  const policyDigest = validateRecovery(
    previous,
    current,
    oldSource,
    currentSource
  );
  mkdirSync(join(out, "traces"), { recursive: true });
  let reused = 0;
  const pending = current.jobs.filter(
    (job) =>
      existsSync(join(oldRun, "games", job.id + ".json")) &&
      !existsSync(join(out, "games", job.id + ".json"))
  );
  await processPool(fileURLToPath(import.meta.url), [oldRun, out], pending, 8);
  reused = current.jobs.filter((job) => {
    const file = join(out, "games", job.id + ".json");
    return (
      existsSync(file) &&
      JSON.parse(readFileSync(file, "utf8")).recoveredFrom?.sourceDigest ===
        previous.sourceDigest
    );
  }).length;
  const receipt = {
    fromRevision: previous.revision,
    fromSourceDigest: previous.sourceDigest,
    policyDigest,
    reused,
    scheduled: current.jobs.length,
    scope:
      "Engine and AI source, locked dependencies, builds, schedule and frozen opponent are identical. Only verified command recordings were reused. Gameplay observations were regenerated from live engine events; original decision counters and timings retain their acquisition provenance.",
  };
  atomic(join(out, "recovery.json"), receipt);
  console.log(JSON.stringify(receipt));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
  process.argv.includes("--worker")
) {
  const [oldRun, out] = process.argv.slice(2);
  const previous = JSON.parse(
    readFileSync(join(oldRun, "manifest.json"), "utf8")
  ) as Inputs;
  process.on("message", async (job: PolicyJob | null) => {
    if (!job) {
      process.disconnect();
      return;
    }
    try {
      await recoverGame(job, oldRun, out, previous);
      process.send?.({ done: job.id });
    } catch (error) {
      process.send?.({ error: `${job.id}: ${error}` });
    }
  });
  process.send?.({ ready: true });
}
