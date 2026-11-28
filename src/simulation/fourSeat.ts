import { HeadlessGame } from "../headless/HeadlessGame";
import { stabilizeIds } from "../headless/createHeadlessGame";
import type { HeadlessCommand } from "../headless/protocol";
import type { GameSnapshot } from "../headless/serialization";
import { DEATHBOWL_FORMAT, keepMatchFormat } from "../game/variants/activeMatch";
import { arenaSquad } from "../game/deathbowl/squad";
import { placings } from "../game/deathbowl/placings";
import { GamePhase } from "../types/GameState";
import { GameEventNames } from "../types/events";
import type { RosterName } from "../types/Team";
import { type Candidate, enumerateDecision } from "./candidates";
import type { Coach } from "./coach";
import { createRuleMonitor, type InvariantViolation, type RuleMonitor } from "./invariants";
import { twoBallViolations } from "./ballInvariants";
import { type CoachRng, createCoachRng } from "./rng";
import {
  type Finding,
  type FindingKind,
  finding,
  refusalFinding,
  snapshotHash,
} from "./runMatch";

export type FourRosters = readonly [RosterName, RosterName, RosterName, RosterName];
export type FourCoaches = readonly [Coach, Coach, Coach, Coach];

export interface FourSeatSpec {
  readonly seed: number;
  readonly rosters: FourRosters;
  readonly coaches: FourCoaches;
  readonly maxCommands?: number;
  readonly saveAt?: number;
}

export interface ResumeCheck {
  readonly step: number;
  readonly hash: string;
  readonly resumedHash: string;
}

export interface FourSeatRun {
  readonly seed: number;
  readonly rosters: FourRosters;
  readonly steps: number;
  readonly final: { readonly phase: string; readonly hash: string };
  readonly touchdowns: readonly number[];
  readonly points: readonly number[];
  readonly places: readonly number[];
  readonly resume: ResumeCheck | null;
  readonly replayHash: string;
  readonly findings: readonly Finding[];
}

interface Run {
  readonly game: HeadlessGame;
  readonly monitor: RuleMonitor;
  readonly rng: CoachRng;
  readonly findings: Finding[];
  readonly commands: HeadlessCommand[];
  readonly awarded: Record<string, number>;
  steps: number;
  refused: Set<string>;
  resume: ResumeCheck | null;
}

interface Report {
  readonly kind: FindingKind;
  readonly key: string;
  readonly message: string;
}

function createFourSeatGame(seed: number, rosters: FourRosters): HeadlessGame {
  const teams = rosters.map((roster, index) =>
    stabilizeIds(arenaSquad(roster, roster, 0xcc0000), `seat${String(index)}`)
  );
  return new HeadlessGame({
    seed,
    teams,
    startingPhase: GamePhase.SETUP,
    format: DEATHBOWL_FORMAT,
  });
}

const key = (commands: readonly HeadlessCommand[]) => JSON.stringify(commands);

function pointsViolations(
  snapshot: GameSnapshot,
  awarded: Readonly<Record<string, number>>
): InvariantViolation[] {
  const points = snapshot.points ?? {};
  return snapshot.teams
    .filter(({ id }) => (points[id] ?? 0) !== (awarded[id] ?? 0))
    .map(({ id }) => ({
      rule: "points-equal-awards",
      message: `${id} holds ${String(points[id] ?? 0)} points but was awarded ${String(awarded[id] ?? 0)}`,
    }));
}

function seatResults(final: GameSnapshot) {
  const tallies = final.teams.map(({ id }) => ({
    teamId: id,
    points: final.points?.[id] ?? 0,
    touchdowns: final.score[id] ?? 0,
  }));
  const placed = placings(tallies);
  return {
    touchdowns: tallies.map(({ touchdowns }) => touchdowns),
    points: tallies.map(({ points }) => points),
    places: tallies.map(({ teamId }) => placed.find((row) => row.teamId === teamId)?.place ?? 0),
  };
}

async function replayHash(spec: FourSeatSpec, commands: readonly HeadlessCommand[]): Promise<string> {
  const game = createFourSeatGame(spec.seed, spec.rosters);
  for (const command of commands) {
    await game.execute(command);
    keepMatchFormat(DEATHBOWL_FORMAT);
  }
  return snapshotHash(game.snapshot());
}

function report(run: Run, at: GameSnapshot, found: Report): void {
  run.findings.push(finding(found.kind, found.key, found.message, run.steps, at));
}

function resumeCheck(game: HeadlessGame, step: number): ResumeCheck | null {
  if (!game.isAtRest() || game.pendingDecision()) return null;
  const hash = snapshotHash(game.snapshot());
  const resumed = new HeadlessGame({ matchSave: game.matchSave() });
  const check = { step, hash, resumedHash: snapshotHash(resumed.snapshot()) };
  keepMatchFormat(DEATHBOWL_FORMAT);
  return check;
}

async function play(run: Run, candidate: Candidate): Promise<void> {
  for (const command of candidate.commands) {
    const before = run.game.snapshot();
    const response = await run.game.execute(command);
    keepMatchFormat(DEATHBOWL_FORMAT);
    run.steps++;
    run.commands.push(command);
    if (!response.ok) {
      report(run, before, refusalFinding(command, response.reason, candidate.label));
      run.refused.add(key(candidate.commands));
      return;
    }
    run.refused = new Set();
    const pending = response.pendingDecision !== null;
    const violations = [
      ...run.monitor.observe(command, before, response.snapshot, pending),
      ...twoBallViolations(response.snapshot),
      ...pointsViolations(response.snapshot, run.awarded),
    ];
    for (const { rule, message } of violations)
      report(run, response.snapshot, { kind: "invariant", key: rule, message });
  }
}

function coachOf(coaches: FourCoaches, snapshot: GameSnapshot, teamId: string): Coach {
  return coaches[snapshot.teams.findIndex(({ id }) => id === teamId)] ?? coaches[0];
}

async function step(run: Run, coaches: FourCoaches): Promise<boolean> {
  const { game } = run;
  const snapshot = game.snapshot();
  const point = await enumerateDecision(game, null);
  const candidates = point.candidates.filter((c) => !run.refused.has(key(c.commands)));
  if (candidates.length === 0) {
    report(run, snapshot, {
      kind: "no-candidates",
      key: point.pending?.type ?? snapshot.phase,
      message: `nothing legal to do (${String(point.candidates.length)} offered, all refused)`,
    });
    return false;
  }
  const coach = coachOf(coaches, snapshot, point.teamId);
  const choice = await coach.choose({ game, snapshot, point: { ...point, candidates }, rng: run.rng });
  const candidate = candidates[choice.index] ?? candidates[0];
  if (candidate) await play(run, candidate);
  return candidate !== undefined;
}

function closingFindings(run: Run, replayed: string): void {
  const final = run.game.snapshot();
  if (replayed !== snapshotHash(final))
    report(run, final, {
      kind: "invariant",
      key: "replay-same-hash",
      message: `the recorded commands replayed to ${replayed}, not ${snapshotHash(final)}`,
    });
  if (final.phase !== GamePhase.GAME_OVER && run.findings.every((f) => f.kind !== "no-candidates"))
    report(run, final, {
      kind: "budget-exhausted",
      key: final.phase,
      message: `still in ${final.phase} after ${String(run.steps)} commands`,
    });
  const { resume } = run;
  if (resume && resume.hash !== resume.resumedHash)
    report(run, final, {
      kind: "invariant",
      key: "resume-same-hash",
      message: `a save at step ${String(resume.step)} resumed to ${resume.resumedHash}, not ${resume.hash}`,
    });
}

export async function runFourSeatMatch(spec: FourSeatSpec): Promise<FourSeatRun> {
  const game = createFourSeatGame(spec.seed, spec.rosters);
  const run: Run = {
    game,
    monitor: createRuleMonitor(),
    rng: createCoachRng(spec.seed),
    findings: [],
    steps: 0,
    refused: new Set(),
    resume: null,
    commands: [],
    awarded: {},
  };
  game.ctx.eventBus.on(GameEventNames.PointsAwarded, ({ teamId, points }) => {
    run.awarded[teamId] = (run.awarded[teamId] ?? 0) + points;
  });
  const maxCommands = spec.maxCommands ?? 8000;
  let going = true;
  while (going && run.steps < maxCommands && game.snapshot().phase !== GamePhase.GAME_OVER) {
    keepMatchFormat(DEATHBOWL_FORMAT);
    if (!run.resume && spec.saveAt !== undefined && run.steps >= spec.saveAt)
      run.resume = resumeCheck(game, run.steps);
    going = await step(run, spec.coaches);
  }
  const replayed = await replayHash(spec, run.commands);
  closingFindings(run, replayed);
  const final = game.snapshot();
  return {
    seed: spec.seed,
    rosters: spec.rosters,
    steps: run.steps,
    final: { phase: final.phase, hash: snapshotHash(final) },
    ...seatResults(final),
    resume: run.resume,
    replayHash: replayed,
    findings: run.findings,
  };
}
