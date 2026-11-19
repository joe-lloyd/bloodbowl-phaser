import { HeadlessGame } from "../headless/HeadlessGame";
import {
  type MatchRecording,
  RECORDING_FORMAT,
  createSimGame,
  grantSimInducements,
  summarize,
} from "./runMatch";
import { createRuleMonitor, type InvariantViolation } from "./invariants";

export interface ReplayResult {
  game: HeadlessGame;

  executed: number;

  divergedAt: number | null;

  matches: boolean;

  violations: (InvariantViolation & { step: number })[];
}

export function parseRecording(text: string): MatchRecording {
  const value = JSON.parse(text) as Partial<MatchRecording>;
  if (value.format !== RECORDING_FORMAT || value.version !== 1) {
    throw new Error(`not a ${RECORDING_FORMAT} v1 file`);
  }
  if (
    !Array.isArray(value.steps) ||
    !Array.isArray(value.rosters) ||
    typeof value.seed !== "number"
  ) {
    throw new Error("recording is missing seed, rosters or steps");
  }
  if (
    value.lineup !== undefined &&
    value.lineup !== "test-team" &&
    value.lineup !== "sevens-lineup"
  ) {
    throw new Error(`unknown lineup "${String(value.lineup)}"`);
  }
  return value as MatchRecording;
}

export async function replayRecording(
  recording: MatchRecording,
  untilStep = recording.steps.length - 1
): Promise<ReplayResult> {
  const game = createSimGame(
    recording.seed,
    recording.rosters,
    recording.rerolls,
    recording.lineup
  );
  if (recording.inducements) await grantSimInducements(game);
  let divergedAt: number | null = null;
  let executed = 0;
  const monitor = createRuleMonitor();
  const violations: ReplayResult["violations"] = [];
  for (const [index, step] of recording.steps.entries()) {
    if (index > untilStep) break;
    const before = game.snapshot();
    const response = await game.execute(step.command);
    executed++;
    if (response.ok !== step.ok && divergedAt === null) divergedAt = index;
    if (response.ok) {
      for (const violation of monitor.observe(
        step.command,
        before,
        response.snapshot,
        !!response.pendingDecision
      )) {
        violations.push({ ...violation, step: index });
      }
    }
  }
  const complete = executed === recording.steps.length;
  const matches =
    complete &&
    divergedAt === null &&
    summarize(game.snapshot()).hash === recording.final.hash;
  return { game, executed, divergedAt, matches, violations };
}

export function trimRecording(
  recording: MatchRecording,
  steps: number
): MatchRecording {
  return {
    ...recording,
    steps: recording.steps.slice(0, steps),
    findings: recording.findings.filter((f) => f.step < steps),
  };
}
