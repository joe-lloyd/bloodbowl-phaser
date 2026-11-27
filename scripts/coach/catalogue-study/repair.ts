import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { replayStudyTrace } from "./replay";

const entry = fileURLToPath(import.meta.url);
const target = process.argv[2];
if (!target) throw new Error("Usage: repair.ts <study directory>");
const directory = path.resolve(target);

function atomic(file: string, data: string | Buffer) {
  writeFileSync(`${file}.tmp`, data);
  renameSync(`${file}.tmp`, file);
}

async function repair(id: string) {
  const file = path.join(directory, "games", id);
  const game = JSON.parse(readFileSync(file, "utf8"));
  if (game.observationVersion === 2) return;
  const traceFile = path.join(
    directory,
    "traces",
    id.replace(/\.json$/, ".json.gz")
  );
  const replayed = await replayStudyTrace(traceFile);
  const { skills, rolls, decisions, counters } = replayed.observations;
  const trace = JSON.parse(gunzipSync(readFileSync(traceFile)).toString());
  trace.observations = {
    ...trace.observations,
    skills,
    rolls,
    decisions,
    counters,
  };
  trace.observationVersion = 2;
  atomic(traceFile, gzipSync(JSON.stringify(trace)));
  atomic(
    file,
    JSON.stringify({
      ...game,
      skills,
      rolls,
      decisions,
      counters,
      observationVersion: 2,
    })
  );
}

if (process.argv.includes("--worker")) {
  process.on("message", async (ids: string[]) => {
    for (const id of ids) await repair(id);
    process.disconnect();
  });
} else {
  const jobs = readdirSync(path.join(directory, "games")).filter((name) =>
    name.endsWith(".json")
  );
  const workers = Number(process.argv[3] ?? 2);
  if (!Number.isSafeInteger(workers) || workers < 1)
    throw new Error("Invalid worker count");
  await Promise.all(
    Array.from(
      { length: workers },
      (_, i) =>
        new Promise<void>((done, reject) => {
          const child = fork(entry, [directory, "--worker"], {
            execArgv: process.execArgv,
            stdio: ["ignore", "ignore", "pipe", "ipc"],
          });
          child.stderr?.on("data", (data) => process.stderr.write(data));
          child.on("error", reject);
          child.on("exit", (code) => {
            code === 0
              ? done()
              : reject(new Error(`Repair worker exited ${String(code)}`));
          });
          child.send(jobs.filter((_, index) => index % workers === i));
        })
    )
  );
  const telemetryFile = fileURLToPath(new URL("telemetry.ts", import.meta.url));
  const digest = createHash("sha256")
    .update(readFileSync(entry))
    .update(readFileSync(telemetryFile))
    .digest("hex");
  const previousFile = path.join(directory, "observations-v2.json");
  const previous = existsSync(previousFile)
    ? JSON.parse(readFileSync(previousFile, "utf8"))
    : {};
  atomic(
    previousFile,
    JSON.stringify(
      {
        version: 2,
        pipelineDigest: digest,
        gamesVerified: jobs.length,
        verifiedAt: new Date().toISOString(),
        previousVerification: previous.gamesVerified ?? 0,
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({ verified: jobs.length, pipelineDigest: digest })
  );
}
