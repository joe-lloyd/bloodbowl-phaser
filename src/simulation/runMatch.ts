import { DEFAULT_GAME_TYPE, type GameType } from "../game/variants/gameTypes";
import { gameTypeRules } from "../game/variants/gameTypeRules";
import {
  formatOf,
  keepMatchFormat,
  type MatchFormat,
} from "../game/variants/activeMatch";
import { HeadlessGame, tick } from "../headless/HeadlessGame";
import { stabilizeIds } from "../headless/createHeadlessGame";
import {
  type CommandResponse,
  type HeadlessCommand,
} from "../headless/protocol";
import { type GameSnapshot } from "../headless/serialization";
import { canonical, fnv1a } from "../headless/checksum";
import { TeamFactory } from "../game/TeamFactory";
import { createLineupTeam } from "./lineups";
import { GamePhase, SubPhase } from "../types/GameState";
import { RosterName } from "../types/Team";
import { type ActionType, GameEventNames } from "../types/events";
import {
  type Candidate,
  type DecisionPoint,
  enumerateDecision,
} from "./candidates";
import { type Coach } from "./coach";
import { createRuleMonitor } from "./invariants";
import {
  Inducement,
  type InducementInventoryEntry,
  buildSeventsInducementProfile,
} from "../types/Inducements";
import { startingFreeInducements } from "../game/inducements/catalog";
import { createCoachRng } from "./rng";

export type Lineup = "test-team" | "sevens-lineup";

export const RECORDING_FORMAT = "bb7-sim-recording" as const;

export type FindingKind =
  | "invariant"
  | "engine-error"
  | "rejected-candidate"
  | "no-candidates"
  | "budget-exhausted";

export interface Finding {
  kind: FindingKind;

  key: string;
  message: string;

  step: number;
  phase: string;
  turn: string;
}

export interface RecordedStep {
  command: HeadlessCommand;
  ok: boolean;
  reason?: string;

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

  lineup?: Lineup;

  inducements?: boolean;

  matchFormat?: MatchFormat;
  steps: RecordedStep[];
  final: { phase: string; score: [number, number]; hash: string };
  findings: Finding[];

  stats?: [TeamPlayStats, TeamPlayStats];
}

export interface TeamPlayStats {
  turns: number;
  turnovers: number;

  dodges: number;
  failedDodges: number;
  rushes: number;
  failedRushes: number;

  casualties: number;
  completions: number;

  blocks: number;

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

function countRoll(side: TeamPlayStats, rollType: string, failed: boolean) {
  if (rollType.startsWith("Dodge (")) {
    side.dodges++;
    if (failed) side.failedDodges++;
  } else if (rollType.startsWith("Rush (")) {
    side.rushes++;
    if (failed) side.failedRushes++;
  }
}

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
    key: `${command.type}:${reason.replaceAll(/[0-9a-z-]+-player-\d+/g, "<player>").slice(0, 80)}`,
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

  coachSeed?: number;
  rosters: [RosterName, RosterName];
  coaches: [Coach, Coach];

  rerolls?: number;

  maxCommands?: number;

  inducements?: boolean;

  kickingTeamId?: string;

  game?: HeadlessGame;

  gameType?: GameType;
}

const DEFAULT_MAX_COMMANDS = 6000;

export function createSimGame(
  seed: number,
  rosters: [RosterName, RosterName],
  rerolls: number,
  lineup: Lineup = "test-team",
  format: GameType | MatchFormat = DEFAULT_GAME_TYPE
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
    format: typeof format === "string" ? seededFormat(format, seed) : format,
  });
}

function seededFormat(gameType: GameType, seed: number): MatchFormat {
  const { venues } = gameTypeRules(gameType);
  return {
    gameType,
    venue: venues[Math.abs(seed) % venues.length] ?? venues[0],
  };
}

const SIM_INDUCEMENTS: Record<
  GameType,
  readonly (readonly [Inducement, number])[]
> = {
  sevens: [
    [Inducement.PRAYERS_TO_NUFFLE, 2],
    [Inducement.DESPERATE_MEASURES, 5],
  ],
  "street-bowl": [
    [Inducement.MAGIC_POTION, 2],
    [Inducement.HALFLING_MASTER_CHEF, 1],
  ],
  "beach-bowl": [
    [Inducement.SOUVENIR, 3],
    [Inducement.BLITZERS_BEST_KEGS, 1],
    [Inducement.HALFLING_MASTER_CHEF, 1],
  ],
  "gutter-bowl": [
    [Inducement.LESSER_MAGIC_POTION, 2],
    [Inducement.SUPERIOR_MAGIC_POTION, 1],
    [Inducement.SAWBONES, 1],
    [Inducement.SNACK_STAND, 1],
    [Inducement.NOVICE_WIZARD, 1],
  ],
};

function simGameType(game: HeadlessGame): GameType {
  return game.ctx.gameService.getState().gameType ?? DEFAULT_GAME_TYPE;
}

export async function prepareSimInducements(
  game: HeadlessGame,
  sold: boolean
): Promise<void> {
  if (game.ctx.gameService.getState().inducements) return;
  if (sold) return grantSimInducements(game);
  if (startingFreeInducements(simGameType(game)).length === 0) return;
  await commitSimInducements(game, []);
}

export async function grantSimInducements(game: HeadlessGame): Promise<void> {
  await commitSimInducements(
    game,
    [game.ctx.team1.id, game.ctx.team2.id].flatMap((ownerTeamId) =>
      SIM_INDUCEMENTS[simGameType(game)].map(([inducement, quantity]) => ({
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
}

async function commitSimInducements(
  game: HeadlessGame,
  inventory: InducementInventoryEntry[]
): Promise<void> {
  game.ctx.gameService.commitInducements(
    buildSeventsInducementProfile({ advancedLeague: false }),
    {},
    inventory
  );
  for (let i = 0; i < 20; i++) await tick();
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
    turn: `${snapshot.turn.isHalf2 ? "H2" : "H1"} T${String(snapshot.turn.turnNumber)} ${snapshot.activeTeamId ?? "-"}`,
  };
}

function countDeclaration(side: TeamPlayStats, command: HeadlessCommand): void {
  if (command.type !== "declare-action") return;
  side.actions[command.action] = (side.actions[command.action] ?? 0) + 1;
}

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
        `${team.name} scored ${String(final.score[team.id] ?? 0)} but match stats credit ${String(credited)} touchdowns`
      );
    }
  }
  return out;
}

function kickerAtSetup(
  snapshot: GameSnapshot,
  kickingTeamId: string | null
): string | null {
  return snapshot.subPhase === SubPhase.SETUP_KICKING
    ? snapshot.activeTeamId
    : kickingTeamId;
}

function kickerAfter(
  command: HeadlessCommand,
  teamId: string,
  kickingTeamId: string | null
): string | null {
  return command.type === "kick-ball" ? teamId : kickingTeamId;
}

function forcedKickoff(
  point: DecisionPoint,
  kickingTeamId: string | undefined
): Candidate | null {
  const flipsCoin = point.candidates.some((c) =>
    c.commands.some((command) => command.type === "coin-flip")
  );
  if (!kickingTeamId || !flipsCoin) return null;
  return {
    kind: "setup",
    commands: [{ type: "start-setup", kickingTeamId }],
    label: "Start with the chosen kicker",
  };
}

function ranOutOfBudget(final: GameSnapshot, findings: Finding[]): boolean {
  return (
    final.phase !== GamePhase.GAME_OVER &&
    findings.every((f) => f.kind !== "no-candidates")
  );
}

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
    createSimGame(
      spec.seed,
      spec.rosters,
      rerolls,
      "sevens-lineup",
      spec.gameType
    );
  const format = formatOf(game.ctx.gameService.getState());
  await prepareSimInducements(game, inducements);
  const rng = createCoachRng(coachSeed);
  const steps: RecordedStep[] = [];
  const findings: Finding[] = [];
  let kickingTeamId: string | null = null;

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
    keepMatchFormat(format);
    const snapshot = game.snapshot();
    if (snapshot.phase === GamePhase.GAME_OVER) break;
    kickingTeamId = kickerAtSetup(snapshot, kickingTeamId);

    const point = await enumerateDecision(game, kickingTeamId);
    const forced = forcedKickoff(point, spec.kickingTeamId);
    const candidates = forced
      ? [forced]
      : point.candidates.filter(
          (c) => !refused.has(JSON.stringify(c.commands))
        );
    if (candidates.length === 0) {
      report(
        "no-candidates",
        point.pending?.type ?? snapshot.phase,
        `nothing legal to do (${String(point.candidates.length)} offered, all refused)`,
        snapshot
      );
      break;
    }

    const team = teamIndex(point.teamId);
    const narrowed = { ...point, candidates };
    const choice = forced
      ? { index: 0 }
      : await spec.coaches[team].choose({
          game,
          snapshot,
          point: narrowed,
          rng,
        });
    const candidate = candidates[choice.index] ?? candidates[0];
    if (!candidate) break;

    for (const command of candidate.commands) {
      const before = game.snapshot();
      keepMatchFormat(format);
      const response = await game.execute(command);
      keepMatchFormat(format);
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
      for (const v of violations) report("invariant", v.rule, v.message, response.snapshot)
      ;
    }
  }

  const final = game.snapshot();
  if (ranOutOfBudget(final, findings)) {
    report(
      "budget-exhausted",
      final.phase,
      `still in ${final.phase} after ${String(steps.length)} commands`,
      final
    );
  }

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
    ...(format.gameType === DEFAULT_GAME_TYPE ? {} : { matchFormat: format }),
    steps,
    final: summarize(final),
    findings,
    stats,
  };
}

export function summarize(snapshot: GameSnapshot): MatchRecording["final"] {
  const [home, away] = snapshot.teams;
  return {
    phase: snapshot.phase,
    score: [
      (home ? snapshot.score[home.id] : undefined) ?? 0,
      (away ? snapshot.score[away.id] : undefined) ?? 0,
    ],
    hash: snapshotHash(snapshot),
  };
}

export function snapshotHash(snapshot: GameSnapshot): string {
  return fnv1a(canonical(snapshot, ["name"]));
}
