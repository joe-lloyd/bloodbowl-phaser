import { HeadlessGame } from "../headless/HeadlessGame";
import { stabilizeIds } from "../headless/createHeadlessGame";
import type { HeadlessCommand } from "../headless/protocol";
import type { GameSnapshot } from "../headless/serialization";
import { DEATHBOWL_FORMAT, keepMatchFormat } from "../game/variants/activeMatch";
import { arenaSquad } from "../game/deathbowl/squad";
import { GamePhase } from "../types/GameState";
import type { RosterName } from "../types/Team";
import { type Candidate, enumerateDecision } from "./candidates";
import type { Coach } from "./coach";
import { createRuleMonitor, type RuleMonitor } from "./invariants";
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

export interface FourSeatSpec {
  readonly seed: number;
  readonly rosters: FourRosters;
  readonly coach: Coach;
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
  readonly resume: ResumeCheck | null;
  readonly findings: readonly Finding[];
}

interface Run {
  readonly game: HeadlessGame;
  readonly monitor: RuleMonitor;
  readonly rng: CoachRng;
  readonly findings: Finding[];
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
    ];
    for (const { rule, message } of violations)
      report(run, response.snapshot, { kind: "invariant", key: rule, message });
  }
}

async function step(run: Run, coach: Coach): Promise<boolean> {
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
  const choice = await coach.choose({ game, snapshot, point: { ...point, candidates }, rng: run.rng });
  const candidate = candidates[choice.index] ?? candidates[0];
  if (candidate) await play(run, candidate);
  return candidate !== undefined;
}

function closingFindings(run: Run): void {
  const final = run.game.snapshot();
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
  };
  const maxCommands = spec.maxCommands ?? 8000;
  let going = true;
  while (going && run.steps < maxCommands && game.snapshot().phase !== GamePhase.GAME_OVER) {
    keepMatchFormat(DEATHBOWL_FORMAT);
    if (!run.resume && spec.saveAt !== undefined && run.steps >= spec.saveAt)
      run.resume = resumeCheck(game, run.steps);
    going = await step(run, spec.coach);
  }
  closingFindings(run);
  return {
    seed: spec.seed,
    rosters: spec.rosters,
    steps: run.steps,
    final: { phase: game.snapshot().phase, hash: snapshotHash(game.snapshot()) },
    touchdowns: game.ctx.teams.map(({ id }) => game.snapshot().score[id] ?? 0),
    resume: run.resume,
    findings: run.findings,
  };
}
