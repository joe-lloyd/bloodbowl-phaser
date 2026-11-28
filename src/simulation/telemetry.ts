import type { HeadlessGame } from "../headless/HeadlessGame";
import type { HeadlessCommand } from "../headless/protocol";
import { type ActionType, GameEventNames } from "../types/events";
import type { Candidate, DecisionPoint } from "./candidates";

export const TALLIES = [
  "turns",
  "turnovers",
  "dodges",
  "failedDodges",
  "rushes",
  "failedRushes",
  "passes",
  "completions",
  "handoffs",
  "interceptions",
  "intercepted",
  "pickups",
  "failedPickups",
  "touchdowns",
  "casualtiesCaused",
  "casualtiesSuffered",
] as const;

export type TallyName = (typeof TALLIES)[number];

export interface Usage {
  readonly tallies: Record<TallyName, number>;
  readonly offered: Record<string, number>;
  readonly chosen: Record<string, number>;
  readonly skills: Record<string, number>;
  readonly rerolls: Record<string, number>;
}

export interface TeamTelemetry extends Usage {
  readonly held: readonly string[];
  readonly actions: Partial<Record<ActionType, number>>;
}

export interface MatchTelemetry {
  readonly decided: (point: DecisionPoint, candidate: Candidate) => void;
  readonly team: (teamId: string) => TeamTelemetry;
  readonly teams: () => TeamTelemetry[];
}

export function optionKey(command: HeadlessCommand): string {
  if (command.type !== "declare-action") return command.type;
  const replacement = command.blockReplacement ? `:${command.blockReplacement}` : "";
  return `declare:${command.action}${replacement}`;
}

const zeroTallies = (): Record<TallyName, number> => ({
  turns: 0,
  turnovers: 0,
  dodges: 0,
  failedDodges: 0,
  rushes: 0,
  failedRushes: 0,
  passes: 0,
  completions: 0,
  handoffs: 0,
  interceptions: 0,
  intercepted: 0,
  pickups: 0,
  failedPickups: 0,
  touchdowns: 0,
  casualtiesCaused: 0,
  casualtiesSuffered: 0,
});

export const emptyUsage = (): Usage => ({
  tallies: zeroTallies(),
  offered: {},
  chosen: {},
  skills: {},
  rerolls: {},
});

const bump = <Key extends string>(counts: Partial<Record<Key, number>>, key: Key, by = 1) => {
  counts[key] = (counts[key] ?? 0) + by;
};

export function addUsage(into: Usage, from: Usage): void {
  for (const tally of TALLIES) into.tallies[tally] += from.tallies[tally];
  const maps = ["offered", "chosen", "skills", "rerolls"] as const;
  for (const map of maps) {
    const counts = Object.entries(from[map]);
    for (const [key, count] of counts) bump(into[map], key, count);
  }
}

interface Side extends Usage {
  readonly held: string[];
  readonly actions: Partial<Record<ActionType, number>>;
}

interface Sides {
  readonly game: HeadlessGame;
  readonly team: (teamId: string | null | undefined) => Side | undefined;
  readonly player: (playerId: string | undefined) => Side | undefined;
}

const count = (side: Side | undefined, tally: TallyName) => {
  if (side) side.tallies[tally]++;
};

const ROLLS = [
  ["Dodge (", "dodges", "failedDodges"],
  ["Rush (", "rushes", "failedRushes"],
] as const;

function watchRolls({ game, team, player }: Sides): void {
  game.ctx.eventBus.on(GameEventNames.DiceRoll, ({ rollType, teamId, resultState }) => {
    const roll = ROLLS.find(([prefix]) => rollType.startsWith(prefix));
    if (!roll) return;
    const state = game.ctx.gameService.getState();
    const side = team(teamId) ?? player(state.activePlayer?.id) ?? team(state.activeTeamId);
    count(side, roll[1]);
    if (resultState === "failure") count(side, roll[2]);
  });
}

function watchBall({ game, team, player }: Sides): void {
  const bus = game.ctx.eventBus;
  bus.on(GameEventNames.PassAttempted, ({ playerId }) => {
    count(player(playerId), "passes");
  });
  bus.on(GameEventNames.PassCompleted, ({ playerId, action }) => {
    count(player(playerId), action === "pass" ? "completions" : "handoffs");
  });
  bus.on(GameEventNames.PassIntercepted, ({ passerId, interceptorId }) => {
    count(player(interceptorId), "interceptions");
    count(player(passerId), "intercepted");
  });
  bus.on(GameEventNames.BallPickup, ({ playerId, success }) => {
    count(player(playerId), "pickups");
    if (!success) count(player(playerId), "failedPickups");
  });
  bus.on(GameEventNames.Touchdown, ({ teamId }) => {
    count(team(teamId), "touchdowns");
  });
}

function watchPlay({ game, team, player }: Sides): void {
  const bus = game.ctx.eventBus;
  bus.on(GameEventNames.TurnStarted, ({ teamId }) => {
    count(team(teamId), "turns");
  });
  bus.on(GameEventNames.Turnover, ({ teamId }) => {
    count(team(teamId), "turnovers");
  });
  bus.on(GameEventNames.PlayerCasualtyInflicted, ({ causerId, victimId }) => {
    if (causerId) count(player(causerId), "casualtiesCaused");
    count(player(victimId), "casualtiesSuffered");
  });
  bus.on(GameEventNames.SkillTriggered, ({ playerId, skill }) => {
    const side = player(playerId);
    if (side) bump(side.skills, skill);
  });
  bus.on(GameEventNames.RerollUsed, ({ playerId, source, skill }) => {
    const side = player(playerId);
    if (side) bump(side.rerolls, skill ? `${source}:${skill}` : source);
  });
}

function decide(side: Side | undefined, point: DecisionPoint, candidate: Candidate): void {
  if (!side) return;
  const offered = new Set(point.candidates.map((option) => optionKey(option.commands[0])));
  for (const key of offered) bump(side.offered, key);
  const [command] = candidate.commands;
  bump(side.chosen, optionKey(command));
  if (command.type === "declare-action") bump(side.actions, command.action);
}

export function watchMatch(game: HeadlessGame): MatchTelemetry {
  const teams = [...game.ctx.teams];
  const sides = new Map<string, Side>(
    teams.map((one) => [
      one.id,
      {
        ...emptyUsage(),
        actions: {},
        held: [...new Set(one.players.flatMap((p) => p.skills.map((s) => s.type)))].sort(),
      },
    ])
  );
  const team = (teamId: string | null | undefined) => (teamId ? sides.get(teamId) : undefined);
  const player = (playerId: string | undefined) =>
    team(teams.find((one) => one.players.some((p) => p.id === playerId))?.id);
  const watched = { game, team, player };
  watchRolls(watched);
  watchBall(watched);
  watchPlay(watched);
  return {
    decided(point, candidate) {
      decide(team(point.teamId), point, candidate);
    },
    team: (teamId) => team(teamId) ?? { ...emptyUsage(), actions: {}, held: [] },
    teams: () => [...sides.values()],
  };
}
