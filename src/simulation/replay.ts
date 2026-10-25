/**
 * Replays a recording against a fresh engine. No coach runs: the recorded
 * commands are the whole input, so a replay needs no API key and no luck.
 */

import { HeadlessGame } from "../headless/HeadlessGame";
import { createMatchSave, MatchSave } from "../headless/serialization";
import {
  MatchRecording,
  RECORDING_FORMAT,
  createSimGame,
  summarize,
} from "./runMatch";
import { checkInvariants, InvariantViolation } from "./invariants";

export interface ReplayResult {
  game: HeadlessGame;
  /** Steps executed (all of them unless `untilStep` stopped early). */
  executed: number;
  /** First step whose accept/reject differed from the recording, if any. */
  divergedAt: number | null;
  /** Final state matches the recording; only meaningful for a full replay. */
  matches: boolean;
  /** Invariants broken during the replay, with the step that broke them. */
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
  return value as MatchRecording;
}

/** Replay up to and including `untilStep` (default: every step). */
export async function replayRecording(
  recording: MatchRecording,
  untilStep = recording.steps.length - 1
): Promise<ReplayResult> {
  const game = createSimGame(
    recording.seed,
    recording.rosters,
    recording.rerolls
  );
  let divergedAt: number | null = null;
  let executed = 0;
  const violations: ReplayResult["violations"] = [];
  for (const [index, step] of recording.steps.entries()) {
    if (index > untilStep) break;
    const before = game.snapshot();
    const response = await game.execute(step.command);
    executed++;
    if (response.ok !== step.ok && divergedAt === null) divergedAt = index;
    if (response.ok) {
      for (const violation of checkInvariants(
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

/**
 * The first `steps` steps of a recording, as a recording of its own: how a
 * failing match becomes a committed regression fixture. The `final` block is
 * the original's and is not meaningful for the trimmed copy.
 */
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

/**
 * A save the browser can resume, so a headless recording can be opened on
 * the real board at any step (see `pnpm sim:replay --save-at`).
 */
export function matchSaveAt(game: HeadlessGame): MatchSave {
  const gs = game.ctx.gameService;
  const { team1, team2 } = game.ctx;
  const turnManager = gs.captureTurnManagerState();
  const kickingTeamId = turnManager.driveKickingTeamId ?? team1.id;
  return createMatchSave({
    state: gs.getState(),
    teams: [team1, team2],
    drive: {
      kickingTeamId,
      receivingTeamId: kickingTeamId === team1.id ? team2.id : team1.id,
    },
    rng: game.ctx.rng.captureState(),
    matchStats: game.ctx.matchStats.captureState(),
    turnManager,
  });
}
