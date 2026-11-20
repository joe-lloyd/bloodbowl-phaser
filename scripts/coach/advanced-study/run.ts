import { isDeepStrictEqual } from "node:util";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { cpus, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { advancedInventory, teamFromVariant } from "./teams";
import { advancedSchedule } from "./schedule";
import { acquisitionDigest } from "./fingerprint";
import type { AdvancedJob } from "./schedule";
import { playStudyGame, withInducementFlag } from "../catalogue-study/play";
import { replayStudyTrace } from "../catalogue-study/replay";
import { forkWorkers } from "../catalogue-study/workers";
import { catalogueInventory } from "../catalogue-study/schedule";
import { SKILL_DEFINITIONS } from "../../../src/types/Skills";
import { RULE_SCENARIOS } from "../../../src/data/ruleScenarios";

const entry = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (key: string, fallback: string) =>
  args.includes("--" + key) ? (args[args.indexOf("--" + key) + 1] ?? fallback) : fallback;
const out = resolve(flag("out", "sim-results/advanced-study"));
const variants = advancedInventory();
const byId = new Map(variants.map((v) => [v.id, v]));

function atomic(file: string, value: unknown) {
  writeFileSync(file + ".tmp", JSON.stringify(value));
  renameSync(file + ".tmp", file);
}

if (args.includes("--worker")) {
  process.on("message", async (job: AdvancedJob | false) => {
    if (!job) {
      process.disconnect();
      return;
    }
    try {
      const result = await playStudyGame(job, out, [
        teamFromVariant(byId.get(job.variantIds[0])!),
        teamFromVariant(byId.get(job.variantIds[1])!),
      ]);
      const replay = await replayStudyTrace(
        join(out, "traces", job.id + ".json.gz")
      );
      if (!isDeepStrictEqual(replay.observations.counters, result.counters))
        throw new Error("Replay event counters differ");
      atomic(join(out, "games", job.id + ".json"), {
        ...result,
        variantIds: job.variantIds,
        comparison: job.comparison,
        verifiedHash: replay.hash,
      });
      process.send?.({ done: job.id });
    } catch (error) {
      process.send?.({ error: String(error), id: job.id });
    }
  });
  process.send?.({ ready: true });
} else {
  const workers = Number(
    flag("workers", String(Math.max(1, Math.min(10, cpus().length - 2))))
  );
  if (!Number.isSafeInteger(workers) || workers < 1)
    throw new Error("Invalid worker count");
  let jobs = advancedSchedule(variants);
  const limit = Number(flag("limit", "0"));
  if (limit > 0) jobs = jobs.slice(0, limit);
  jobs = withInducementFlag(jobs, args);
  mkdirSync(join(out, "games"), { recursive: true });
  const sourceDigest = acquisitionDigest(resolve(dirname(entry), "../../.."));
  const manifest = {
    format: "bb7-advanced-study-v1",
    sourceDigest,
    created: new Date().toISOString(),
    host: hostname(),
    node: process.version,
    revision: flag("revision", "unspecified"),
    workers,
    variants,
    inventory: catalogueInventory(),
    definitions: SKILL_DEFINITIONS,
    scenarios: RULE_SCENARIOS.map((e) => ({
      skill: e.skill,
      configs: e.configs.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        provenance: c.skillProvenance ?? [],
      })),
    })),
    jobs,
  };
  const manifestFile = join(out, "manifest.json");
  if (existsSync(manifestFile)) {
    const old = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (
      old.sourceDigest !== sourceDigest ||
      JSON.stringify(old.jobs) !== JSON.stringify(jobs)
    )
      throw new Error("Source or schedule changed; use a fresh directory");
  } else atomic(manifestFile, manifest);
  const pending = jobs.filter(
    (j) => !existsSync(join(out, "games", j.id + ".json"))
  );
  let next = 0,
    done = jobs.length - pending.length;
  const started = Date.now();
  await forkWorkers(
    {
      entry,
      args: ["--worker", "--out", out],
      count: Math.min(workers, pending.length),
    },
    (child, yes, no) => {
      let current: AdvancedJob | undefined;
      child.on(
        "message",
        (message: { done?: string; error?: string; id?: string }) => {
          if (message.error) {
            no(new Error(message.id + ": " + message.error));
            return;
          }
          if (message.done) {
            done++;
            if (done % 20 === 0 || done === jobs.length)
              console.log(
                JSON.stringify({
                  done,
                  total: jobs.length,
                  seconds: Math.round((Date.now() - started) / 1000),
                })
              );
          }
          current = pending[next++];
          child.send(current ?? false);
        }
      );
      child.on("exit", (code) => {
        current || code !== 0
          ? no(new Error("Worker exited during " + current?.id))
          : yes();
      });
    }
  );
  atomic(join(out, "complete.json"), {
    games: done,
    seconds: (Date.now() - started) / 1000,
    verified: true,
  });
  console.log(JSON.stringify({ complete: done, out }));
}
