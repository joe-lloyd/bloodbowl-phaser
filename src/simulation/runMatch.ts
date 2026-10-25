/**
 * Plays one full Sevens match between two coaches over the headless
 * protocol, checking invariants after every command and recording every
 * command so the match can be replayed exactly.
 */

import { HeadlessGame } from "../headless/HeadlessGame";
import { stabilizeIds } from "../headless/createHeadlessGame";
import { HeadlessCommand } from "../headless/protocol";
import { GameSnapshot } from "../headless/serialization";
import { TeamFactory } from "../game/TeamFactory";
import { GamePhase, SubPhase } from "../types/GameState";
import { RosterName } from "../types/Team";
import { enumerateDecision } from "./candidates";
import { Coach } from "./coach";
import { checkInvariants } from "./invariants";
import { createCoachRng } from "./rng";

export const RECORDING_FORMAT = "bb7-sim-recording" as const;

export type FindingKind =
  /** A rule that must always hold was broken. */
  | "invariant"
  /** The engine threw while executing a command. */
  | "engine-error"
  /** The engine refused a command its own legality checks offered. */
  | "rejected-candidate"
  /** The game is waiting but offers nothing legal to do. */
  | "no-candidates"
  /** The match did not finish inside the command budget. */
  | "budget-exhausted";

export interface Finding {
  kind: FindingKind;
  /** Stable grouping key for summaries, e.g. "invariant:score-monotonic". */
  key: string;
  message: string;
  /** Index into `steps` of the command that exposed it (-1 if none). */
  step: number;
  phase: string;
  turn: string;
}

export interface RecordedStep {
  command: HeadlessCommand;
  ok: boolean;
  reason?: string;
  /** 0 = home (team1), 1 = away (team2). */
  team: 0 | 1;
  label: string;
  note?: string;
}

export interface MatchRecording {
  format: typeof RECORDING_FORMAT;
  version: 1;
  seed: number;
  coachSeed: number;
  rosters: [RosterName, RosterName];
  coaches: [string, string];
  rerolls: number;
  steps: RecordedStep[];
  final: { phase: string; score: [number, number]; hash: string };
  findings: Finding[];
}

export interface MatchSpec {
  seed: number;
  /** Seeds coach choices; defaults to `seed`. */
  coachSeed?: number;
  rosters: [RosterName, RosterName];
  coaches: [Coach, Coach];
  /** Team re-rolls each side starts with. */
  rerolls?: number;
  /** Commands before the match counts as stuck. */
  maxCommands?: number;
}

const DEFAULT_MAX_COMMANDS = 6000;

/** Build the game a recording describes. Same inputs, same game. */
export function createSimGame(
  seed: number,
  rosters: [RosterName, RosterName],
  rerolls: number
): HeadlessGame {
  const team1 = stabilizeIds(
    TeamFactory.createTestTeam(rosters[0], "Home", 0xcc0000),
    "team1"
  );
  const team2 = stabilizeIds(
    TeamFactory.createTestTeam(rosters[1], "Away", 0x0000cc),
    "team2"
  );
  team1.rerolls = rerolls;
  team2.rerolls = rerolls;
  return new HeadlessGame({
    seed,
    team1,
    team2,
    startingPhase: GamePhase.SETUP,
  });
}

export async function runMatch(spec: MatchSpec): Promise<MatchRecording> {
  const rerolls = spec.rerolls ?? 3;
  const coachSeed = spec.coachSeed ?? spec.seed;
  const maxCommands = spec.maxCommands ?? DEFAULT_MAX_COMMANDS;
  const game = createSimGame(spec.seed, spec.rosters, rerolls);
  const rng = createCoachRng(coachSeed);
  const steps: RecordedStep[] = [];
  const findings: Finding[] = [];
  let kickingTeamId: string | null = null;
  /** Candidates refused in the current state, so a coach cannot retry them forever. */
  let refused = new Set<string>();

  const teamIndex = (teamId: string): 0 | 1 =>
    teamId === game.ctx.team1.id ? 0 : 1;
  const report = (
    kind: FindingKind,
    key: string,
    message: string,
    snapshot: GameSnapshot
  ) =>
    findings.push({
      kind,
      key: `${kind}:${key}`,
      message,
      step: steps.length - 1,
      phase: `${snapshot.phase}${snapshot.subPhase ? "/" + snapshot.subPhase : ""}`,
      turn: `${snapshot.turn.isHalf2 ? "H2" : "H1"} T${snapshot.turn.turnNumber} ${snapshot.activeTeamId ?? "-"}`,
    });

  while (steps.length < maxCommands) {
    const snapshot = game.snapshot();
    if (snapshot.phase === GamePhase.GAME_OVER) break;
    if (snapshot.subPhase === SubPhase.SETUP_KICKING)
      kickingTeamId = snapshot.activeTeamId;

    const point = await enumerateDecision(game, kickingTeamId);
    const candidates = point.candidates.filter(
      (c) => !refused.has(JSON.stringify(c.commands))
    );
    if (candidates.length === 0) {
      report(
        "no-candidates",
        `${point.pending?.type ?? snapshot.phase}`,
        `nothing legal to do (${point.candidates.length} offered, all refused)`,
        snapshot
      );
      break;
    }

    const team = teamIndex(point.teamId);
    const narrowed = { ...point, candidates };
    const choice = await spec.coaches[team].choose({
      game,
      snapshot,
      point: narrowed,
      rng,
    });
    const candidate = candidates[choice.index] ?? candidates[0];

    for (const command of candidate.commands) {
      const before = game.snapshot();
      const response = await game.execute(command);
      steps.push({
        command,
        ok: response.ok,
        ...(response.reason ? { reason: response.reason } : {}),
        team,
        label: candidate.label,
        ...(choice.note ? { note: choice.note } : {}),
      });
      if (command.type === "kick-ball" && response.ok)
        kickingTeamId = point.teamId;

      if (!response.ok) {
        const reason = response.reason ?? "unknown";
        // HeadlessGame reports engine refusals as "command-failed: <code>";
        // anything that is not a bare code is an exception message.
        const engineError =
          reason.startsWith("command-failed") &&
          !/^command-failed: [a-z0-9:-]+$/.test(reason);
        report(
          engineError ? "engine-error" : "rejected-candidate",
          `${command.type}:${reason.replace(/[0-9a-z-]+-player-\d+/g, "<player>").slice(0, 80)}`,
          `${candidate.label} → ${reason}`,
          before
        );
        refused.add(JSON.stringify(candidate.commands));
        break;
      }
      refused = new Set();
      for (const violation of checkInvariants(
        before,
        response.snapshot,
        !!response.pendingDecision
      )) {
        report(
          "invariant",
          violation.rule,
          violation.message,
          response.snapshot
        );
      }
    }
  }

  const final = game.snapshot();
  if (
    final.phase !== GamePhase.GAME_OVER &&
    findings.every((f) => f.kind !== "no-candidates")
  ) {
    report(
      "budget-exhausted",
      final.phase,
      `still in ${final.phase} after ${steps.length} commands`,
      final
    );
  }
  // Progression reads match stats, so every point on the scoreboard must
  // have a credited scorer or a player loses the SPP for it.
  const stats = game.ctx.matchStats.captureState().players;
  for (const team of final.teams) {
    const credited = stats
      .filter((p) => p.teamId === team.id)
      .reduce((sum, p) => sum + p.touchdowns, 0);
    if (credited !== (final.score[team.id] ?? 0)) {
      report(
        "invariant",
        "touchdowns-credited",
        `${team.name} scored ${final.score[team.id] ?? 0} but match stats credit ${credited} touchdowns`,
        final
      );
    }
  }

  return {
    format: RECORDING_FORMAT,
    version: 1,
    seed: spec.seed,
    coachSeed,
    rosters: spec.rosters,
    coaches: [spec.coaches[0].name, spec.coaches[1].name],
    rerolls,
    steps,
    final: summarize(final),
    findings,
  };
}

export function summarize(snapshot: GameSnapshot): MatchRecording["final"] {
  return {
    phase: snapshot.phase,
    score: [
      snapshot.score[snapshot.teams[0].id] ?? 0,
      snapshot.score[snapshot.teams[1].id] ?? 0,
    ],
    hash: snapshotHash(snapshot),
  };
}

/** FNV-1a over the snapshot minus generated names, which are not seeded. */
export function snapshotHash(snapshot: GameSnapshot): string {
  const text = JSON.stringify(snapshot, (key, value) =>
    key === "name" ? undefined : value
  );
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
