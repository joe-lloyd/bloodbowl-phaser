import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { snapshotHash } from "../../../src/simulation/runMatch";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import type { MatchSave } from "../../../src/headless/serialization";
import { createTelemetry } from "./telemetry";

export function openTrace(file: string) {
  const trace = JSON.parse(gunzipSync(readFileSync(file)).toString()) as {
    initial: MatchSave;
    recording: MatchRecording;
  };
  return {
    recording: trace.recording,
    game: new HeadlessGame({ matchSave: trace.initial }),
  };
}

export async function replayStudyTrace(file: string) {
  const { recording, game } = openTrace(file);
  const telemetry = createTelemetry(game);
  for (const [index, step] of recording.steps.entries()) {
    const response = await game.execute(step.command);
    if (response.ok !== step.ok)
      throw new Error(
        `Replay diverged at step ${String(index)}: ${String(response.reason)}`
      );
  }
  const actual = snapshotHash(game.snapshot());
  if (actual !== recording.final.hash)
    throw new Error(
      `Final hash ${actual} differs from ${recording.final.hash}`
    );
  return {
    commands: recording.steps.length,
    hash: actual,
    score: recording.final.score,
    observations: telemetry.snapshot(),
  };
}

if (process.argv[2]?.endsWith(".json.gz"))
  console.log(await replayStudyTrace(process.argv[2]));
