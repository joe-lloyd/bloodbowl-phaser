/**
 * Plays one full Sevens match between two coaches over the headless
 * protocol, checking invariants after every command and recording every
 * command so the match can be replayed exactly.
 */

import { HeadlessGame } from "../headless/HeadlessGame";
import { stabilizeIds } from "../headless/createHeadlessGame";
import { CommandResponse, HeadlessCommand } from "../headless/protocol";
import { GameSnapshot } from "../headless/serialization";
import { TeamFactory } from "../game/TeamFactory";
import { createLineupTeam } from "./lineups";
import { GamePhase, SubPhase } from "../types/GameState";
import { RosterName } from "../types/Team";
import { ActionType, GameEventNames } from "../types/events";
import { enumerateDecision } from "./candidates";
import { Coach } from "./coach";
import { createRuleMonitor } from "./invariants";
import {
  Inducement,
  buildSeventsInducementProfile,
} from "../types/Inducements";
import { createCoachRng } from "./rng";

/**
 * "test-team" is TeamFactory's test team, mostly Linemen; "sevens-lineup"
 * fields each roster's positionals (see lineups.ts).
 */
export type Lineup = "test-team" | "sevens-lineup";

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
  /** Which teams were fielded; absent on recordings made before line-ups. */
  lineup?: Lineup;
  /**
   * Both teams held Prayers to Nuffle and Desperate Measures (see
   * grantSimInducements); absent on recordings made before them.
   */
  inducements?: boolean;
  steps: RecordedStep[];
  final: { phase: string; score: [number, number]; hash: string };
  findings: Finding[];
  /** Per team, home first; absent on recordings made before stats. */
  stats?: [TeamPlayStats, TeamPlayStats];
}

/** How a team played, counted from the engine's own events. */
export interface TeamPlayStats {
  turns: number;
  turnovers: number;
  /** Every Dodge and Rush rolled, re-rolls included. */
  dodges: number;
  failedDodges: number;
  rushes: number;
  failedRushes: number;
  /** Casualties caused that earn SPP, from the match stats. */
  casualties: number;
  completions: number;
  /** Blocks thrown, Blitz blocks included. */
  blocks: number;
  /** Actions declared, by kind. */
  actions: Partial<Record<ActionType, number>>;
}

const emptyStats = (): TeamPlayStats => ({
  turns: 0,
  turnovers: 0,
  dodges: 0,
  failedDodges: 0,
  rushes: 0,
  failedRushes: 0,
  casualties: 0,
  completions: 0,
  blocks: 0,
  actions: {},
});

/** Add one command's events to the stats; `team` is who sent the command. */
function countEvents(
  stats: [TeamPlayStats, TeamPlayStats],
  events: CommandResponse["events"],
  team: 0 | 1,
  teamIndex: (teamId: string) => 0 | 1
): void {
  for (const event of events) {
    const data = event.data as
      | { teamId?: string; rollType?: string; resultState?: string }
      | undefined;
    if (event.name === GameEventNames.TurnStarted && data?.teamId)
      stats[teamIndex(data.teamId)].turns++;
    if (event.name === GameEventNames.Turnover && data?.teamId)
      stats[teamIndex(data.teamId)].turnovers++;
    if (event.name !== GameEventNames.DiceRoll || !data?.rollType) continue;
    const side = stats[data.teamId ? teamIndex(data.teamId) : team];
    countRoll(side, data.rollType, data.resultState === "failure");
  }
}

/** Count a Dodge or Rush roll; other rolls are not tracked. */
function countRoll(side: TeamPlayStats, rollType: string, failed: boolean) {
  if (rollType.startsWith("Dodge (")) {
    side.dodges++;
    if (failed) side.failedDodges++;
  } else if (rollType.startsWith("Rush (")) {
    side.rushes++;
    if (failed) side.failedRushes++;
  }
}

/**
 * HeadlessGame reports refusals and exceptions alike as "command-failed:
 * <message>". Refusals read as codes or sentences ("illegal-stab-target",
 * "Not enough movement to Jump"); a crash reads like a JavaScript runtime
 * error.
 */
function refusalFinding(
  command: HeadlessCommand,
  refusal: string | undefined,
  label: string
): { kind: FindingKind; key: string; message: string } {
  const reason = refusal ?? "unknown";
  const engineError =
    /TypeError|ReferenceError|RangeError|Cannot read propert|is not a function|is not defined|of undefined|of null/.test(
      reason
    );
  return {
    kind: engineError ? "engine-error" : "rejected-candidate",
    key: `${command.type}:${reason.replace(/[0-9a-z-]+-player-\d+/g, "<player>").slice(0, 80)}`,
    message: `${label} → ${reason}`,
  };
}

function recordedStep(
  command: HeadlessCommand,
  response: CommandResponse,
  team: 0 | 1,
  label: string,
  note: string | undefined
): RecordedStep {
  return {
    command,
    ok: response.ok,
    ...(response.reason ? { reason: response.reason } : {}),
    team,
    label,
    ...(note ? { note } : {}),
  };
}

type PlayerMatchStats = ReturnType<
  HeadlessGame["ctx"]["matchStats"]["captureState"]
>["players"];

/** Add each player's casualties, completions and blocks to their team. */
function addPlayerStats(
  stats: [TeamPlayStats, TeamPlayStats],
  playerStats: PlayerMatchStats,
  teamIndex: (teamId: string) => 0 | 1
): void {
  for (const player of playerStats) {
    const side = stats[teamIndex(player.teamId)];
    side.casualties += player.casualties;
    side.completions += player.completions;
    side.blocks += player.blocks;
  }
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
  /** Give both teams Prayers and Desperate Measures; default true. */
  inducements?: boolean;
  /**
   * Play this game instead of building one from `rosters`, such as a
   * knockout tie or a library team as it stands.
   */
  game?: HeadlessGame;
}

const DEFAULT_MAX_COMMANDS = 6000;

/** Build the game a recording describes. Same inputs, same game. */
export function createSimGame(
  seed: number,
  rosters: [RosterName, RosterName],
  rerolls: number,
  lineup: Lineup = "test-team"
): HeadlessGame {
  const build =
    lineup === "sevens-lineup" ? createLineupTeam : TeamFactory.createTestTeam;
  const team1 = stabilizeIds(build(rosters[0], "Home", 0xcc0000), "team1");
  const team2 = stabilizeIds(build(rosters[1], "Away", 0x0000cc), "team2");
  team1.rerolls = rerolls;
  team2.rerolls = rerolls;
  return new HeadlessGame({
    seed,
    team1,
    team2,
    startingPhase: GamePhase.SETUP,
  });
}

/**
 * Both teams hold the Sevens maximum of 2 Prayers to Nuffle and 5 Desperate
 * Measures, free, so every match exercises their tables and decisions. The
 * sim does not buy inducements: it has no petty cash to spend.
 */
export async function grantSimInducements(game: HeadlessGame): Promise<void> {
  game.ctx.gameService.commitInducements(
    buildSeventsInducementProfile({ advancedLeague: false }),
    {},
    [game.ctx.team1.id, game.ctx.team2.id].flatMap((ownerTeamId) =>
      (
        [
          [Inducement.PRAYERS_TO_NUFFLE, 2],
          [Inducement.DESPERATE_MEASURES, 5],
        ] as const
      ).map(([inducement, quantity]) => ({
        inducement,
        ownerTeamId,
        quantity,
        remainingUses: quantity,
        price: 0,
        provenance: "free" as const,
        duration: "match" as const,
      }))
    )
  );
  // Let the rolls run up to the first coach choice.
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function finding(
  kind: FindingKind,
  key: string,
  message: string,
  step: number,
  snapshot: GameSnapshot
): Finding {
  return {
    kind,
    key: `${kind}:${key}`,
    message,
    step,
    phase: `${snapshot.phase}${snapshot.subPhase ? "/" + snapshot.subPhase : ""}`,
    turn: `${snapshot.turn.isHalf2 ? "H2" : "H1"} T${snapshot.turn.turnNumber} ${snapshot.activeTeamId ?? "-"}`,
  };
}

/** Count an accepted declaration by its kind of action. */
function countDeclaration(side: TeamPlayStats, command: HeadlessCommand): void {
  if (command.type !== "declare-action") return;
  side.actions[command.action] = (side.actions[command.action] ?? 0) + 1;
}

/** A message for each team whose score its players' touchdowns do not add up to. */
function uncreditedTouchdowns(
  final: GameSnapshot,
  playerStats: PlayerMatchStats
): string[] {
  const out: string[] = [];
  for (const team of final.teams) {
    const credited = playerStats
      .filter((p) => p.teamId === team.id)
      .reduce((sum, p) => sum + p.touchdowns, 0);
    if (credited !== (final.score[team.id] ?? 0)) {
      out.push(
        `${team.name} scored ${final.score[team.id] ?? 0} but match stats credit ${credited} touchdowns`
      );
    }
  }
  return out;
}

/** The team in kicking set-up is the one that will kick. */
function kickerAtSetup(
  snapshot: GameSnapshot,
  kickingTeamId: string | null
): string | null {
  return snapshot.subPhase === SubPhase.SETUP_KICKING
    ? snapshot.activeTeamId
    : kickingTeamId;
}

/** A team that kicks the ball is the kicking team, whatever came before. */
function kickerAfter(
  command: HeadlessCommand,
  teamId: string,
  kickingTeamId: string | null
): string | null {
  return command.type === "kick-ball" ? teamId : kickingTeamId;
}

/** Unfinished, and not because the game stopped offering anything legal. */
function ranOutOfBudget(final: GameSnapshot, findings: Finding[]): boolean {
  return (
    final.phase !== GamePhase.GAME_OVER &&
    findings.every((f) => f.kind !== "no-candidates")
  );
}

/** The spec with its defaults filled in. */
function matchSettings(spec: MatchSpec) {
  return {
    rerolls: spec.rerolls ?? 3,
    coachSeed: spec.coachSeed ?? spec.seed,
    maxCommands: spec.maxCommands ?? DEFAULT_MAX_COMMANDS,
    inducements: spec.inducements ?? true,
  };
}

export async function runMatch(spec: MatchSpec): Promise<MatchRecording> {
  const { rerolls, coachSeed, maxCommands, inducements } = matchSettings(spec);
  const game =
    spec.game ??
    createSimGame(spec.seed, spec.rosters, rerolls, "sevens-lineup");
  if (inducements) await grantSimInducements(game);
  const rng = createCoachRng(coachSeed);
  const steps: RecordedStep[] = [];
  const findings: Finding[] = [];
  let kickingTeamId: string | null = null;
  /** Candidates refused in the current state, so a coach cannot retry them forever. */
  const monitor = createRuleMonitor();
  const stats: [TeamPlayStats, TeamPlayStats] = [emptyStats(), emptyStats()];
  let refused = new Set<string>();

  const teamIndex = (teamId: string): 0 | 1 =>
    teamId === game.ctx.team1.id ? 0 : 1;
  const report = (
    kind: FindingKind,
    key: string,
    message: string,
    snapshot: GameSnapshot
  ) => findings.push(finding(kind, key, message, steps.length - 1, snapshot));

  while (steps.length < maxCommands) {
    const snapshot = game.snapshot();
    if (snapshot.phase === GamePhase.GAME_OVER) break;
    kickingTeamId = kickerAtSetup(snapshot, kickingTeamId);

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
      countEvents(stats, response.events, team, teamIndex);
      steps.push(
        recordedStep(command, response, team, candidate.label, choice.note)
      );
      if (!response.ok) {
        const { kind, key, message } = refusalFinding(
          command,
          response.reason,
          candidate.label
        );
        report(kind, key, message, before);
        refused.add(JSON.stringify(candidate.commands));
        break;
      }
      kickingTeamId = kickerAfter(command, point.teamId, kickingTeamId);
      countDeclaration(stats[team], command);
      refused = new Set();
      const violations = monitor.observe(
        command,
        before,
        response.snapshot,
        !!response.pendingDecision
      );
      violations.forEach((v) =>
        report("invariant", v.rule, v.message, response.snapshot)
      );
    }
  }

  const final = game.snapshot();
  if (ranOutOfBudget(final, findings)) {
    report(
      "budget-exhausted",
      final.phase,
      `still in ${final.phase} after ${steps.length} commands`,
      final
    );
  }
  // Progression reads match stats, so every point on the scoreboard must
  // have a credited scorer or a player loses the SPP for it.
  const playerStats = game.ctx.matchStats.captureState().players;
  addPlayerStats(stats, playerStats, teamIndex);
  for (const message of uncreditedTouchdowns(final, playerStats))
    report("invariant", "touchdowns-credited", message, final);

  return {
    format: RECORDING_FORMAT,
    version: 1,
    seed: spec.seed,
    coachSeed,
    rosters: spec.rosters,
    coaches: [spec.coaches[0].name, spec.coaches[1].name],
    rerolls,
    lineup: "sevens-lineup",
    inducements,
    steps,
    final: summarize(final),
    findings,
    stats,
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
