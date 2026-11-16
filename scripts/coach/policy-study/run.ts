import { isDeepStrictEqual } from "node:util";
/** Compare current modular plans with an archived, frozen pre-change planner. */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { policySourceDigest, treeDigest } from "./fingerprint";
import { recoverVerifiedGames } from "../policy-lab/recover";
import { advancedInventory, teamFromVariant } from "../advanced-study/teams";
import { catalogueInventory } from "../catalogue-study/schedule";
import { playStudyGame } from "../catalogue-study/play";
import { replayStudyTrace } from "../catalogue-study/replay";
import { createPlannerCoach } from "../../../src/simulation/ai/planner";
import type { Coach } from "../../../src/simulation/coach";
import { policySchedule, limitPolicyBlocks } from "./schedule";
import type { PolicyJob } from "./schedule";
import { processPool } from "./pool";
import { sppValuesFor } from "../../../src/game/progression/MatchStats";
import { createOpportunityLog } from "../policy-lab/evidence";
import { labInventory } from "../policy-lab/teams";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) =>
  args.includes("--" + name) ? args[args.indexOf("--" + name) + 1] : fallback;
const entry = fileURLToPath(import.meta.url);
const root = resolve(dirname(entry), "../../..");
const out = resolve(flag("out", "sim-results/skill-plans"));
const baseline = flag("baseline", "");
if (!baseline) throw new Error("--baseline must name the frozen source root");
const frozen = resolve(baseline);
const lab = args.includes("--lab");
const labVariants = lab ? labInventory() : null;
const variants = labVariants ?? advancedInventory();
const byId = new Map(variants.map((v) => [v.id, v]));
const snapshots = new Map(labVariants?.map((v) => [v.id, v.team]));
const getTeam = (id: string) => {
  const snapshot = snapshots.get(id);
  return snapshot ? structuredClone(snapshot) : teamFromVariant(byId.get(id)!);
};
const opponent = flag("opponent", "planner");
if (!["planner", "heuristic", "hard", "legend"].includes(opponent))
  throw new Error("Unsupported frozen opponent");

function atomic(file: string, data: unknown) {
  writeFileSync(file + ".tmp", JSON.stringify(data));
  renameSync(file + ".tmp", file);
}
function track(coach: Coach, collectPlans = false) {
  const selected: Record<string, number> = {};
  const opportunities = createOpportunityLog();
  let decisions = 0;
  let milliseconds = 0;
  const tracked: Coach = {
    name: coach.name,
    async choose(context) {
      const start = performance.now();
      const choice = await coach.choose(context);
      milliseconds += performance.now() - start;
      const command = context.point.candidates[choice.index]?.commands[0];
      if (collectPlans) opportunities.observe(context, choice, decisions);
      decisions++;
      if (
        command?.type === "declare-action" &&
        choice.note?.startsWith("moves to feed")
      )
        selected.feedingSupport = (selected.feedingSupport ?? 0) + 1;
      if (command) {
        const key =
          command.type === "declare-action"
            ? `declare:${command.action}${command.blockReplacement ? ":" + command.blockReplacement : ""}`
            : command.type === "special-action"
              ? `special:${command.action}`
              : command.type;
        selected[key] = (selected[key] ?? 0) + 1;
      }
      return choice;
    },
  };
  return {
    coach: tracked,
    selected,
    ...opportunities,
    get milliseconds() {
      return milliseconds;
    },
  };
}

if (args.includes("--worker")) {
  const module = await import(
    pathToFileURL(join(frozen, "src/simulation/commands/shared.ts")).href
  );
  const legacy: Coach = {
    ...module.makeCoach(opponent, []),
    name: "planner-frozen",
  };
  process.on("message", async (job: PolicyJob | null) => {
    if (!job) {
      process.disconnect();
      return;
    }
    try {
      const candidate = track(
        createPlannerCoach({ name: "planner-skill-plans" }),
        lab
      );
      const old = track(legacy);
      const coaches: [Coach, Coach] =
        job.candidateSide === 0
          ? [candidate.coach, old.coach]
          : [old.coach, candidate.coach];
      const result = await playStudyGame(
        job,
        out,
        [getTeam(job.variantIds[0]), getTeam(job.variantIds[1])],
        coaches
      );
      const replay = await replayStudyTrace(
        join(out, "traces", job.id + ".json.gz")
      );
      if (!isDeepStrictEqual(result.counters, replay.observations.counters))
        throw new Error("Replay event counters differ");
      atomic(join(out, "games", job.id + ".json"), {
        ...result,
        ...job,
        verifiedHash: replay.hash,
        policyDecisions: {
          candidate: candidate.selected,
          frozen: old.selected,
        },
        policyMilliseconds: {
          candidate: candidate.milliseconds,
          frozen: old.milliseconds,
        },
        ...(lab
          ? {
              opportunities: {
                legal: candidate.legal,
                proposed: candidate.proposed,
              },
              receipts: candidate.receipts,
            }
          : {}),
      });
      process.send?.({ done: job.id });
    } catch (error) {
      process.send?.({ error: job.id + ": " + String(error) });
    }
  });
  process.send?.({ ready: true });
} else {
  const smoke = args.includes("--smoke");
  const seedBase = Number(flag("seed-base", "13000000"));
  if (
    !Number.isSafeInteger(seedBase) ||
    seedBase < 0 ||
    seedBase > 4_000_000_000
  )
    throw new Error("Invalid seed base");
  let jobs = policySchedule(variants, smoke, seedBase, lab);
  if (lab) {
    if (args.includes("--base-only"))
      jobs = jobs.filter((j) => j.development === "base");
    // Small gates preserve whole blocks. Confirmation visits every recipe.
    const blockLimit = Number(flag("blocks", "0"));
    if (!Number.isSafeInteger(blockLimit) || blockLimit < 0)
      throw new Error("Invalid block limit");
    if (blockLimit) {
      const sentinels = smoke
        ? ["Vampire", "Throw Team-mate", "Multiple Block"].flatMap(
            (capability) => {
              const variant = variants.find((v) => {
                const team = getTeam(v.id);
                return (
                  team.rosterName.includes(capability) ||
                  team.players.some((p) =>
                    p.skills.some((s) => s.type === capability)
                  )
                );
              });
              return variant ? [variant.id] : [];
            }
          )
        : [];
      jobs = limitPolicyBlocks(jobs, blockLimit, sentinels);
    }
    jobs = jobs.map((j) => ({
      ...j,
      persistentInjuries: args.includes("--league"),
    }));
  }
  if (smoke && !lab) {
    const special = new Set(
      variants
        .filter(
          (v) =>
            getTeam(v.id).rosterName.includes("Vampire") ||
            v.allocations.some((a) => a.skill === "Multiple Block")
        )
        .map((v) => v.id)
    );
    jobs = jobs
      .filter(
        (j) => special.has(j.variantIds[0]) || special.has(j.variantIds[1])
      )
      .slice(0, 96);
  }
  const workers = Number(flag("workers", "8"));
  if (!Number.isSafeInteger(workers) || workers < 1)
    throw new Error("Invalid worker count");
  const sourceDigest = policySourceDigest(root, lab);
  const baselineDigest = treeDigest(frozen, ["src"]);
  mkdirSync(join(out, "games"), { recursive: true });
  const inventory = catalogueInventory();
  const objectives = Object.fromEntries(
    inventory.teams.map((t) => [t.rosterName, sppValuesFor(t.rosterName)])
  );
  const manifest = {
    format: "bb7-policy-study-v1",
    created: new Date().toISOString(),
    host: hostname(),
    node: process.version,
    sourceDigest,
    telemetry: "live-gameplay-events-v1",
    baselineDigest,
    baselineRevision: flag("baseline-revision", "unspecified"),
    revision: flag("revision", "unspecified"),
    smoke,
    workers,
    variants,
    inventory,
    objectives,
    jobs,
    ...(lab
      ? {
          lab: true,
          blockSize: 8,
          opponent,
          context: args.includes("--league")
            ? "persistent-fixture"
            : "exhibition",
        }
      : {}),
  };
  const file = join(out, "manifest.json");
  if (existsSync(file)) {
    const previous = JSON.parse(readFileSync(file, "utf8"));
    if (
      previous.sourceDigest !== sourceDigest ||
      previous.baselineDigest !== baselineDigest ||
      previous.opponent !== manifest.opponent ||
      JSON.stringify(previous.jobs) !== JSON.stringify(jobs)
    )
      throw new Error(
        "Source or schedule changed; use a fresh output directory"
      );
  } else atomic(file, manifest);
  const reuse = flag("reuse-run", "");
  if (reuse && !lab) throw new Error("Recovery requires --lab");
  if (reuse)
    await recoverVerifiedGames(
      resolve(reuse),
      resolve(flag("reuse-source", "")),
      root,
      out,
      manifest
    );
  const pending = jobs.filter(
    (job) => !existsSync(join(out, "games", job.id + ".json"))
  );
  const started = Date.now();
  await processPool(entry, args, pending, workers);
  atomic(join(out, "complete.json"), {
    games: jobs.length,
    seconds: (Date.now() - started) / 1000,
    verified: true,
  });
}
