/**
 * The kickoff events that resolve at once, without a coach step: each one
 * rolls its dice, changes the state and records what it granted on the
 * outcome. The interactive events resolve nothing here; KickoffEventManager
 * opens their step.
 */

import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { DiceController } from "../controllers/DiceController";
import { WeatherManager } from "../managers/WeatherManager";
import { inducementCount } from "../inducements/inventory";
import { Inducement } from "@/types/Inducements";
import {
  KickoffEvent,
  KickoffEventOutcome,
  grantEffect,
} from "./kickoffEvents";
import { getDriveEffects } from "./driveEffects";

/** Context handed to each resolver: teams + the outcome being built. */
export interface KickoffEventResolverContext {
  isTeam1Kicking: boolean;
  kickingTeam: Team;
  receivingTeam: Team;
  outcome: KickoffEventOutcome;
}

type KickoffEventResolver = (ctx: KickoffEventResolverContext) => void;

/** Weather-table results 4-10 are Perfect Conditions (logged as "Nice"). */
export const PERFECT_CONDITIONS = "Nice";

interface ResolverDeps {
  eventBus: IEventBus;
  state: GameState;
  diceController: DiceController;
  weatherManager: WeatherManager;
  getTurnNumber: (teamId: string) => number;
  moveTurnMarkers: (delta: number) => void;
  /** Changing Weather → Perfect Conditions: the kick scatters in the air. */
  onWeatherScatter: () => void;
}

/** One resolver per kickoff event; interactive events resolve nothing here. */
export function kickoffEventResolvers(
  deps: ResolverDeps
): Record<KickoffEvent, KickoffEventResolver> {
  return {
    [KickoffEvent.GET_THE_REF]: (ctx) => resolveGetTheRef(deps, ctx),
    [KickoffEvent.TIME_OUT]: (ctx) => resolveTimeOut(deps, ctx),
    [KickoffEvent.ALERT_DEFENCE]: () => {},
    [KickoffEvent.HIGH_KICK]: () => {},
    [KickoffEvent.CHEERING_FANS]: (ctx) => resolveCheeringFans(deps, ctx),
    [KickoffEvent.BRILLIANT_COACHING]: (ctx) =>
      resolveBrilliantCoaching(deps, ctx),
    [KickoffEvent.CHANGING_WEATHER]: (ctx) => resolveChangingWeather(deps, ctx),
    [KickoffEvent.QUICK_SNAP]: () => {},
    [KickoffEvent.CHARGE]: () => {},
    [KickoffEvent.DODGY_SNACK]: (ctx) => resolveDodgySnack(deps, ctx),
    [KickoffEvent.PITCH_INVASION]: (ctx) => resolvePitchInvasion(deps, ctx),
  };
}

function resolveGetTheRef(
  { state, eventBus }: ResolverDeps,
  ctx: KickoffEventResolverContext
): void {
  state.bribes ??= {};
  for (const team of [ctx.kickingTeam, ctx.receivingTeam]) {
    state.bribes[team.id] = (state.bribes[team.id] ?? 0) + 1;
    grantEffect(ctx.outcome, team.id, "gains a Bribe (lost at full time)");
    eventBus.emit(GameEventNames.DriveEffectGranted, {
      teamId: team.id,
      effect: "bribe",
      detail: "one Bribe, usable until the end of the match",
    });
  }
}

function resolveTimeOut(
  { getTurnNumber, moveTurnMarkers }: ResolverDeps,
  ctx: KickoffEventResolverContext
): void {
  const kickingTurn = getTurnNumber(ctx.kickingTeam.id);
  // Sevens K3: markers on 5 or 6 move back one; otherwise forward.
  const delta = kickingTurn >= 5 ? -1 : 1;
  moveTurnMarkers(delta);
  for (const team of [ctx.kickingTeam, ctx.receivingTeam]) {
    grantEffect(
      ctx.outcome,
      team.id,
      delta < 0 ? "turn marker moves back one" : "turn marker moves forward one"
    );
  }
}

/**
 * Shared D6 + modifier roll-off: each team rolls in turn, and `pick` names
 * the side that wins it. Both teams are returned on a tie.
 */
function rollOff(
  { diceController, eventBus }: ResolverDeps,
  label: string,
  modifierOf: (team: Team) => number,
  teams: Team[],
  pick: "highest" | "lowest"
): Team[] {
  const totals: Record<string, number> = {};
  for (const team of teams) {
    const modifier = modifierOf(team);
    const roll = diceController.rollD6(`${label} — ${team.name}`, team.id);
    totals[team.id] = roll + modifier;
    eventBus.emit(
      GameEventNames.UI_GameLog,
      `${label} — ${team.name}: D6 ${roll} + ${modifier} = ${totals[team.id]}`
    );
  }
  const [a, b] = teams;
  if (totals[a.id] === totals[b.id]) return [a, b];
  const aWins =
    pick === "highest"
      ? totals[a.id] > totals[b.id]
      : totals[a.id] < totals[b.id];
  return [aWins ? a : b];
}

function resolveCheeringFans(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): void {
  const { state, eventBus } = deps;
  const winners = rollOff(
    deps,
    "Cheering Fans",
    (team) =>
      team.cheerleaders +
      inducementCount(state, team.id, Inducement.TEMP_AGENCY_CHEERLEADER),
    [ctx.kickingTeam, ctx.receivingTeam],
    "highest"
  );
  for (const team of winners) {
    getDriveEffects(state).owedAssists[team.id] = {
      turn: deps.getTurnNumber(team.id) + 1,
      used: false,
    };
    grantEffect(
      ctx.outcome,
      team.id,
      "owes an extra Offensive Assist to the first Block of its next turn"
    );
    eventBus.emit(GameEventNames.DriveEffectGranted, {
      teamId: team.id,
      effect: "offensive-assist",
      detail: "+1 Offensive Assist on the first Block of your next turn",
    });
  }
}

function resolveBrilliantCoaching(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): void {
  const { state, eventBus } = deps;
  const winners = rollOff(
    deps,
    "Brilliant Coaching",
    (team) =>
      team.coaches +
      inducementCount(state, team.id, Inducement.PART_TIME_ASSISTANT_COACH),
    [ctx.kickingTeam, ctx.receivingTeam],
    "highest"
  );
  for (const team of winners) {
    const effects = getDriveEffects(state);
    effects.freeRerolls[team.id] = (effects.freeRerolls[team.id] ?? 0) + 1;
    grantEffect(
      ctx.outcome,
      team.id,
      "gains a free team re-roll for this drive"
    );
    eventBus.emit(GameEventNames.DriveEffectGranted, {
      teamId: team.id,
      effect: "free-reroll",
      detail: "one free team re-roll for this drive",
    });
  }
}

function resolveChangingWeather(
  { weatherManager, onWeatherScatter }: ResolverDeps,
  ctx: KickoffEventResolverContext
): void {
  const weather = weatherManager.rollWeather();
  const note =
    weather === PERFECT_CONDITIONS
      ? "weather becomes Perfect Conditions — the kick Scatters (3) in the air"
      : `weather becomes ${weather}`;
  for (const team of [ctx.kickingTeam, ctx.receivingTeam]) {
    grantEffect(ctx.outcome, team.id, note);
  }
  if (weather === PERFECT_CONDITIONS) {
    onWeatherScatter();
  }
}

/** Random player of `team` currently on the pitch (D6-indexed, logged). */
function randomPitchPlayer(
  diceController: DiceController,
  team: Team,
  label: string
): Player | undefined {
  const onPitch = team.players.filter((player) => !!player.gridPosition);
  if (onPitch.length === 0) return undefined;
  // Rejection sampling over a D16 keeps every roster slot equally likely.
  const acceptedRange = Math.floor(16 / onPitch.length) * onPitch.length;
  let roll: number;
  do {
    roll = diceController.rollD16(`${label} — ${team.name}`, team.id);
  } while (roll > acceptedRange);
  const index = (roll - 1) % onPitch.length;
  return onPitch[index];
}

function resolveDodgySnack(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): void {
  const { state, eventBus, diceController } = deps;
  const afflicted = rollOff(
    deps,
    "Dodgy Snack",
    () => 0,
    [ctx.kickingTeam, ctx.receivingTeam],
    "lowest"
  );
  for (const team of afflicted) {
    const player = randomPitchPlayer(
      diceController,
      team,
      "Dodgy Snack player"
    );
    if (!player) continue;
    const roll = diceController.rollD6(
      `Dodgy Snack — ${team.name}: ${player.playerName}`,
      team.id
    );
    if (roll === 1) {
      getDriveEffects(state).playerModifiers[player.id] = {
        confinedToReserves: true,
      };
      removeFromPitch(eventBus, player);
      grantEffect(
        ctx.outcome,
        team.id,
        `${player.playerName} is confined to the Reserves for the drive`
      );
    } else {
      getDriveEffects(state).playerModifiers[player.id] = {
        maModifier: -1,
        avModifier: -1,
      };
      grantEffect(
        ctx.outcome,
        team.id,
        `${player.playerName} suffers -1 MA and -1 AV for the drive`
      );
    }
    eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    eventBus.emit(GameEventNames.DriveEffectGranted, {
      teamId: team.id,
      effect: "dodgy-snack",
      detail:
        roll === 1
          ? `${player.playerName} is confined to Reserves for the drive`
          : `${player.playerName} has -1 MA and -1 AV for the drive`,
    });
  }
}

function resolvePitchInvasion(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): void {
  const { eventBus, diceController } = deps;
  const afflicted = rollOff(
    deps,
    "Pitch Invasion",
    (team) => team.dedicatedFans,
    [ctx.kickingTeam, ctx.receivingTeam],
    "lowest"
  );
  for (const team of afflicted) {
    const player = randomPitchPlayer(
      diceController,
      team,
      "Pitch Invasion player"
    );
    if (!player) continue;
    // Placed Stunned: rolls over at the end of that team's next turn.
    player.status = PlayerStatus.STUNNED;
    eventBus.emit(GameEventNames.PlayerKnockedDown, {
      playerId: player.id,
    });
    eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    grantEffect(
      ctx.outcome,
      team.id,
      `${player.playerName} is Placed Prone and Stunned by the crowd`
    );
  }
}

/** Lift a player off the pitch into the Reserves box (visuals via events). */
function removeFromPitch(eventBus: IEventBus, player: Player): void {
  player.gridPosition = undefined;
  player.status = PlayerStatus.RESERVE;
  eventBus.emit(GameEventNames.PlayerRemoved, player.id);
}
