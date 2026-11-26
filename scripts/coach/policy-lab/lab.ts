import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { snapshotHash } from "../../../src/simulation/runMatch";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import {
  buildMatchDump,
  renderMatchHtml,
} from "../../../src/simulation/viewer";
import { parseLabManifest } from "../../../src/boundary/labManifest";
import type { LabJob } from "../../../src/boundary/labManifest";
import { openTrace } from "../catalogue-study/replay";
import { processPool } from "../policy-study/pool";

type Step = MatchRecording["steps"][number];

interface Replay {
  game: HeadlessGame;
  recording: MatchRecording;
  before?: (step: Step, index: number) => void;
}

interface Annotation {
  entry: string;
  folder: string;
  workers: number;
  annotate: (trace: string, job: LabJob) => Promise<object>;
}

export function argument(index: number): string {
  const value = process.argv[index];
  if (value === undefined)
    throw new Error(`Missing argument ${String(index - 1)}`);
  return value;
}

export function isEntry(url: string): boolean {
  const script = process.argv[1];
  return Boolean(script) && path.resolve(script ?? "") === fileURLToPath(url);
}

export async function replaySteps({ game, recording, before }: Replay) {
  for (const [index, step] of recording.steps.entries()) {
    before?.(step, index);
    const response = await game.execute(step.command);
    if (response.ok !== step.ok)
      throw new Error(`Replay diverged at ${String(index)}`);
  }
}

export function verifiedHash(
  game: HeadlessGame,
  recording: MatchRecording,
  label: string
): string {
  const hash = snapshotHash(game.snapshot());
  if (hash !== recording.final.hash)
    throw new Error(`${label} replay final hash differs`);
  return hash;
}

export function serveJobs(work: (job: LabJob) => Promise<void>): void {
  process.on("message", (job: LabJob | null | false) => {
    if (!job) {
      process.disconnect();
      return;
    }
    work(job).then(
      () => process.send?.({ done: job.id }),
      (error: unknown) =>
        process.send?.({ error: `${job.id}: ${String(error)}` })
    );
  });
  process.send?.({ ready: true });
}

export async function annotateRun(annotation: Annotation) {
  const run = path.resolve(argument(2));
  const out = path.join(run, annotation.folder);
  mkdirSync(out, { recursive: true });
  if (process.argv.includes("--worker")) {
    serveJobs(async (job) => {
      const result = await annotation.annotate(
        path.join(run, "traces", job.id + ".json.gz"),
        job
      );
      writeFileSync(path.join(out, job.id + ".json"), JSON.stringify(result));
    });
    return;
  }
  const manifest = parseLabManifest(
    readFileSync(path.join(run, "manifest.json"), "utf8")
  );
  await processPool(annotation.entry, [run], manifest.jobs, annotation.workers);
  return { run, out, manifest };
}

export function annotationFiles(
  out: string,
  expected: number,
  noun: string
): string[] {
  const files = readdirSync(out).filter((name) => name.endsWith(".json"));
  if (files.length !== expected)
    throw new Error(`Incomplete or foreign ${noun} files`);
  return files;
}

export function analyzerSha256(entry: string): string {
  return createHash("sha256").update(readFileSync(entry)).digest("hex");
}

export async function writeMatchViewer(run: string, out: string, id: string) {
  const { recording, game } = openTrace(path.join(run, "traces", id + ".json.gz"));
  const dump = await buildMatchDump(recording, game);
  writeFileSync(path.join(out, id + ".html"), renderMatchHtml(dump));
  return recording;
}
