import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { cpus, hostname, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogueInventory, studySchedule } from "./catalogue-study/schedule";
import { playStudyGame } from "./catalogue-study/play";
import type { StudyGame, StudyJob } from "./catalogue-study/model";
import { forkWorkers } from "./catalogue-study/workers";

const entry = fileURLToPath(import.meta.url);
const root = resolve(dirname(entry), "../..");
const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? fallback : (args[index + 1] ?? fallback);
};

function sourceDigest(): string {
  const hash = createHash("sha256");
  const visit = (directory: string) => {
    for (const item of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      const file = join(directory, item.name);
      if (item.isDirectory()) visit(file);
      else hash.update(file.slice(root.length)).update(readFileSync(file));
    }
  };
  visit(join(root, "src"));
  for (const name of ["model.ts", "play.ts", "schedule.ts", "telemetry.ts"])
    hash
      .update(name)
      .update(readFileSync(join(root, "scripts/coach/catalogue-study", name)));
  hash.update(readFileSync(entry));
  hash.update(readFileSync(join(root, "pnpm-lock.yaml")));
  return hash.digest("hex");
}

function saveResult(out: string, result: StudyGame) {
  const file = join(out, "games", `${result.id}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(result));
  renameSync(`${file}.tmp`, file);
}

async function worker(out: string) {
  process.on("message", async (job: StudyJob | "done") => {
    if (job === "done") {
      process.disconnect();
      return;
    }
    try {
      const result = await playStudyGame(job, out);
      saveResult(out, result);
      process.send?.({
        id: job.id,
        ms: result.ms,
        completed: result.completed,
      });
    } catch (error) {
      process.send?.({ error: String(error), id: job.id });
    }
  });
  process.send?.({ ready: true });
}

async function run() {
  const out = resolve(flag("out", "sim-results/catalogue-study"));
  if (args.includes("--worker")) {
    await worker(out);
    return;
  }
  const workers = Number(
    flag("workers", String(Math.max(1, Math.min(10, cpus().length - 2))))
  );
  if (!Number.isSafeInteger(workers) || workers < 1)
    throw new Error("workers must be a positive integer");
  const cohorts = flag("cohorts", "league,calibration,hard,legend").split(",");
  const limit = Number(flag("limit", "0"));
  let jobs = studySchedule().filter((job) => cohorts.includes(job.cohort));
  if (jobs.length === 0)
    throw new Error("No jobs matched the requested cohorts");
  if (limit > 0) jobs = jobs.slice(0, limit);
  mkdirSync(join(out, "games"), { recursive: true });
  const manifestFile = join(out, "manifest.json");
  const digest = sourceDigest();
  const manifest = {
    format: "bb7-catalogue-study-v1",
    sourceDigest: digest,
    revision: flag("revision", "unspecified"),
    created: new Date().toISOString(),
    host: hostname(),
    cores: cpus().length,
    ramBytes: totalmem(),
    node: process.version,
    workers,
    ruleset: "default Sevens",
    freeInducements: false,
    inventory: catalogueInventory(),
    jobs,
  };
  if (existsSync(manifestFile)) {
    const previous = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (
      previous.sourceDigest !== digest ||
      JSON.stringify(previous.jobs) !== JSON.stringify(jobs)
    )
      throw new Error(
        "Source or schedule changed; use a fresh output directory"
      );
  } else writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  const pending = jobs.filter(
    (job) => !existsSync(join(out, "games", `${job.id}.json`))
  );
  const started = Date.now();
  let next = 0;
  let done = jobs.length - pending.length;
  console.log(
    JSON.stringify({
      out,
      requested: jobs.length,
      resumed: done,
      workers,
      sourceDigest: digest,
    })
  );
  await forkWorkers(
    {
      entry,
      args: ["--worker", "--out", out],
      count: Math.min(workers, pending.length),
    },
    (child, resolveWorker, reject) => {
      let current: StudyJob | undefined;
      child.on(
        "message",
        (message: {
          error?: string;
          id?: string;
          ready?: boolean;
          ms?: number;
          completed?: boolean;
        }) => {
          if (message.error) {
            reject(new Error(`${String(message.id)}: ${message.error}`));
            return;
          }
          if (message.id) {
            done++;
            if (done % 10 === 0 || done === jobs.length)
              console.log(
                JSON.stringify({
                  done,
                  total: jobs.length,
                  elapsedSeconds: Math.round((Date.now() - started) / 1000),
                  last: message.id,
                  ms: message.ms,
                })
              );
          }
          current = pending[next++];
          child.send(current ?? "done");
        }
      );
      child.on("exit", (code, signal) => {
        if (current || code !== 0)
          reject(
            new Error(
              `Worker exited ${String(signal ?? code)} during ${String(current?.id)}`
            )
          );
        else resolveWorker();
      });
    }
  );
  writeFileSync(
    join(out, "complete.json"),
    JSON.stringify({
      completed: new Date().toISOString(),
      games: done,
      seconds: (Date.now() - started) / 1000,
    })
  );
  console.log(
    `Completed ${String(done)}/${String(jobs.length)} games. Results: ${out}`
  );
}

await run();
