import * as fs from "node:fs";
import {
  parseRecording,
  replayRecording,
  type ReplayResult,
  trimRecording,
} from "../replay";
import { type MatchRecording } from "../runMatch";
import {
  type GameSnapshot,
  serializeMatchSave,
} from "../../headless/serialization";
import { buildMatchDump, renderMatchHtml } from "../viewer";
import { fail } from "./shared";

export async function replay(argv: string[]): Promise<number> {
  const file =
    argv[0] ??
    fail(
      "usage: pnpm sim:replay <recording.json> [--step n] [--save-at n --save-out file]"
    );
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const recording = parseRecording(fs.readFileSync(file, "utf8"));
  const stepFlag = flag("--step") ?? flag("--save-at");
  const until =
    stepFlag === undefined ? recording.steps.length - 1 : Number(stepFlag);
  const result = await replayRecording(recording, until);
  const snapshot = result.game.snapshot();
  const fullReplay = result.executed === recording.steps.length;

  process.stdout.write(`${headline(recording, result, fullReplay)}\n`);
  const from = Math.max(0, until - 5);
  for (let i = from; i <= Math.min(until, recording.steps.length - 1); i++) {
    const step = recording.steps[i];
    if (!step) continue;
    process.stdout.write(
      `  ${String(i)}: ${step.ok ? "ok  " : "FAIL"} ${step.label}${step.reason ? ` (${step.reason})` : ""}\n`
    );
  }
  for (const finding of recording.findings.filter((f) => f.step === until)) {
    process.stdout.write(`  finding: ${finding.key}: ${finding.message}\n`);
  }
  process.stdout.write(`${stateLine(snapshot)}\n`);

  for (const violation of result.violations) {
    process.stdout.write(
      `  invariant broken at step ${String(violation.step)}: ${violation.rule}: ${violation.message}\n`
    );
  }

  await writeOutputs(flag, recording, result, until);
  const fullReplayFailed = fullReplay && !result.matches;
  return result.divergedAt !== null ||
    fullReplayFailed ||
    result.violations.length > 0
    ? 1
    : 0;
}

function headline(
  recording: MatchRecording,
  result: ReplayResult,
  fullReplay: boolean
): string {
  const behaved =
    result.divergedAt === null
      ? "every step behaved as recorded"
      : `step ${String(result.divergedAt)} behaved differently than recorded`;
  const finalState = result.matches
    ? "; final state matches"
    : "; FINAL STATE DIFFERS";
  return (
    `${recording.rosters[0]} (${recording.coaches[0]}) vs ${recording.rosters[1]} (${recording.coaches[1]}), seed ${String(recording.seed)}\n` +
    `replayed ${String(result.executed)}/${String(recording.steps.length)} steps; ` +
    behaved +
    (fullReplay ? finalState : "")
  );
}

function stateLine(snapshot: GameSnapshot): string {
  const ball = snapshot.ballPosition
    ? `(${String(snapshot.ballPosition.x)},${String(snapshot.ballPosition.y)})`
    : "off pitch";
  return (
    `state: ${snapshot.phase}${snapshot.subPhase ? "/" + snapshot.subPhase : ""}, ` +
    `${snapshot.turn.isHalf2 ? "H2" : "H1"} turn ${String(snapshot.turn.turnNumber)}, ${String(snapshot.activeTeamId)} to act, ` +
    `ball ${ball}`
  );
}

async function writeOutputs(
  flag: (name: string) => string | undefined,
  recording: MatchRecording,
  result: ReplayResult,
  until: number
): Promise<void> {
  const htmlOut = flag("--html");
  if (htmlOut) {
    fs.writeFileSync(htmlOut, renderMatchHtml(await buildMatchDump(recording)));
    process.stdout.write(`playback page written to ${htmlOut}\n`);
  }

  const trimOut = flag("--trim-out");
  if (trimOut) {
    fs.writeFileSync(
      trimOut,
      JSON.stringify(trimRecording(recording, until + 1))
    );
    process.stdout.write(`steps 0-${String(until)} written to ${trimOut}\n`);
  }

  const saveOut = flag("--save-out");
  if (!saveOut) {
    return;
  }

  fs.writeFileSync(saveOut, serializeMatchSave(result.game.matchSave()));
  process.stdout.write(`browser save written to ${saveOut}\n`);
}
