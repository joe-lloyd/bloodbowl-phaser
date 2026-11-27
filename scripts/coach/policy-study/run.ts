import { isDeepStrictEqual } from "node:util";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { policySourceDigest, treeDigest } from "./fingerprint";
import { recoverVerifiedGames } from "../policy-lab/recover";
import { advancedInventory, teamFromVariant } from "../advanced-study/teams";
import { catalogueInventory } from "../catalogue-study/schedule";
import { playStudyGame, withInducementFlag } from "../catalogue-study/play";
import { replayStudyTrace } from "../catalogue-study/replay";
import { createPlannerCoach } from "../../../src/simulation/ai/planner";
import { STANDARD_VARIETY } from "../../../src/simulation/ai/gamePlans";
import {
  DEFAULT_WEIGHTS,
  GAME_TYPE_WEIGHTS,
  ROSTER_WEIGHTS,
  parseWeightFile,
} from "../../../src/simulation/ai/weights";
import type { Coach } from "../../../src/simulation/coach";
import { policySchedule, limitPolicyBlocks } from "./schedule";
import type { PolicyJob } from "./schedule";
import { processPool } from "./pool";
import { sppValuesFor } from "../../../src/game/progression/MatchStats";
import { createOpportunityLog } from "../policy-lab/evidence";
import { labInventory } from "../policy-lab/teams";
import { readGameType } from "../../../src/game/variants/gameTypes";
import { gameTypeRules } from "../../../src/game/variants/gameTypeRules";
import {
  SEVENS_FORMAT,
  type MatchFormat,
} from "../../../src/game/variants/activeMatch";
import { isVenue } from "../../../src/game/variants/pitchLayouts";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) =>
  args.includes("--" + name)
    ? (args[args.indexOf("--" + name) + 1] ?? fallback)
    : fallback;
const entry = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(entry), "../../..");
const out = path.resolve(flag("out", "sim-results/skill-plans"));
const baseline = flag("baseline", "");
if (!baseline) throw new Error("--baseline must name the frozen source root");
const frozen = path.resolve(baseline);
const lab = args.includes("--lab");
const gameType = readGameType(flag("game-type", "sevens"));
const venues = gameTypeRules(gameType).venues;
const venueFlag = flag("venue", "");
if (venueFlag && !(isVenue(venueFlag) && venues.includes(venueFlag)))
  throw new Error(`--venue must be one of ${venues.join(", ")}`);
const formatFor = (seed: number): MatchFormat => ({
  gameType,
  venue:
    venues.find((v) => v === venueFlag) ??
    venues[seed % venues.length] ??
    venues[0],
});
const labVariants = lab ? labInventory(gameType) : null;
const variants = labVariants ?? advancedInventory(gameType);
const byId = new Map(variants.map((v) => [v.id, v]));
const snapshots = new Map(labVariants?.map((v) => [v.id, v.team]));
const getTeam = (id: string) => {
  const snapshot = snapshots.get(id);
  return snapshot
    ? structuredClone(snapshot)
    : teamFromVariant(byId.get(id)!, gameType);
};
const opponent = flag("opponent", "planner");
if (!["planner", "heuristic", "hard", "legend"].includes(opponent))
  throw new Error("Unsupported frozen opponent");

const candidateKind = flag("candidate", "planner");
if (!["planner", "standard"].includes(candidateKind))
  throw new Error("Unsupported candidate");

const weightsFile = flag("weights", "");
const weightsText = weightsFile
  ? readFileSync(path.resolve(weightsFile), "utf8")
  : "";
const {
  weights: candidateWeights,
  rosters: candidateRosters,
  gameTypes: candidateGameTypes,
} = weightsFile
  ? parseWeightFile(JSON.parse(weightsText))
  : {
      weights: DEFAULT_WEIGHTS,
      rosters: ROSTER_WEIGHTS,
      gameTypes: GAME_TYPE_WEIGHTS,
    };
const candidateCoach = () =>
  createPlannerCoach(candidateKind === "standard" ? {
        name: "standard",
        variety: STANDARD_VARIETY,
        weights: candidateWeights,
        rosters: candidateRosters,
        gameTypes: candidateGameTypes,
      } : {
        name: "planner-skill-plans",
        weights: candidateWeights,
        rosters: candidateRosters,
        gameTypes: candidateGameTypes,
      });

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
        selected["feedingSupport"] = (selected["feedingSupport"] ?? 0) + 1;
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

const RUN_KEYS = [
  "sourceDigest",
  "baselineDigest",
  "node",
  "opponent",
  "candidate",
  "candidateWeights",
  "candidateRosters",
  "candidateGameTypes",
  "jobs",
] as const;

function sameRun(previous: unknown, current: Record<string, unknown>) {
  if (typeof previous !== "object" || previous === null) return false;
  const saved = new Map(Object.entries(previous));
  return RUN_KEYS.every(
    (name) => JSON.stringify(saved.get(name)) === JSON.stringify(current[name])
  );
}

interface FormatActivator {
  activateMatchFormat: (format: MatchFormat) => void;
}

function activatesFormats(module: unknown): module is FormatActivator {
  return (
    typeof module === "object" &&
    module !== null &&
    "activateMatchFormat" in module &&
    typeof module.activateMatchFormat === "function"
  );
}

async function frozenFormats(): Promise<FormatActivator | null> {
  if (gameType === "sevens") return null;
  const module: unknown = await import(
    pathToFileURL(path.join(frozen, "src/game/variants/activeMatch.ts")).href
  );
  if (!activatesFormats(module))
    throw new Error("The frozen tree cannot switch game types");
  return module;
}

if (args.includes("--worker")) {
  const module = await import(
    pathToFileURL(path.join(frozen, "src/simulation/commands/shared.ts")).href
  );
  const legacy: Coach = {
    ...module.makeCoach(opponent, []),
    name: "planner-frozen",
  };
  const frozenFormat = await frozenFormats();
  process.on("message", async (job: PolicyJob | false) => {
    if (!job) {
      process.disconnect();
      return;
    }
    try {
      frozenFormat?.activateMatchFormat(job.format ?? SEVENS_FORMAT);
      const candidate = track(candidateCoach(), lab);
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
        path.join(out, "traces", job.id + ".json.gz")
      );
      if (!isDeepStrictEqual(result.counters, replay.observations.counters))
        throw new Error("Replay event counters differ");
      atomic(path.join(out, "games", job.id + ".json"), {
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
        ...(lab && {
              opportunities: {
                legal: candidate.legal,
                proposed: candidate.proposed,
              },
              receipts: candidate.receipts,
            }),
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
              return variant ? variant.id : [];
            }
          )
        : [];
      jobs = limitPolicyBlocks(jobs, blockLimit, sentinels);
    }

    if (args.includes("--rosters")) {
      const listed = args[args.indexOf("--rosters") + 1] ?? "";
      const wanted = new Set(listed.split(",").map((name) => name.trim()));
      const known = new Set<string>(
        variants.map((v) => getTeam(v.id).rosterName)
      );
      const unknown = [...wanted].filter((name) => !known.has(name));
      if (!listed || listed.startsWith("--") || unknown.length > 0)
        throw new Error(
          `--rosters needs a comma-separated list of lab rosters; unknown: ${unknown.join(", ") || "none given"}`
        );
      jobs = jobs.filter((j) =>
        j.variantIds.some((id) => wanted.has(getTeam(id).rosterName))
      );
      if (jobs.length === 0) throw new Error(`No lab games for ${listed}`);
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
  jobs = withInducementFlag(jobs, args);
  if (gameType !== "sevens")
    jobs = jobs.map((j) => ({ ...j, format: formatFor(j.seed) }));
  const workers = Number(flag("workers", "8"));
  if (!Number.isSafeInteger(workers) || workers < 1)
    throw new Error("Invalid worker count");
  const sourceDigest = policySourceDigest(root, lab);
  const baselineDigest = treeDigest(frozen, ["src"]);
  mkdirSync(path.join(out, "games"), { recursive: true });
  const inventory = catalogueInventory(gameType);
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
    gameType,
    smoke,
    opponent,
    candidate: candidateKind,
    candidateWeights,
    candidateRosters,
    candidateGameTypes,
    workers,
    variants,
    inventory,
    objectives,
    jobs,
    ...(lab && {
          lab: true,
          blockSize: 8,
          context: args.includes("--league")
            ? "persistent-fixture"
            : "exhibition",
        }),
  };
  const file = path.join(out, "manifest.json");
  if (existsSync(file)) {
    const previous: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!sameRun(previous, manifest))
      throw new Error(
        "Source or schedule changed; use a fresh output directory"
      );
  } else atomic(file, manifest);
  const reuse = flag("reuse-run", "");
  if (reuse && !lab) throw new Error("Recovery requires --lab");
  if (reuse)
    await recoverVerifiedGames(
      path.resolve(reuse),
      path.resolve(flag("reuse-source", "")),
      root,
      out,
      manifest
    );
  const pending = jobs.filter(
    (job) => !existsSync(path.join(out, "games", job.id + ".json"))
  );
  const started = Date.now();
  await processPool(entry, args, pending, workers);
  atomic(path.join(out, "complete.json"), {
    games: jobs.length,
    seconds: (Date.now() - started) / 1000,
    verified: true,
  });
}
