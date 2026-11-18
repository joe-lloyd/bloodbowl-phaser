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

type KickoffEventResolver = (
  ctx: KickoffEventResolverContext
) => void | Promise<void>;

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
  /**
   * Waits while the dice rolled so far land and read, so each roll is shown
   * on its own with its label. A visual barrier only.
   */
  diceShown: () => Promise<void>;
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

/** What a roll-off adds to each team's D6, and what decides it. */
interface RollOffRule {
  label: string;
  /** What is added, such as "Cheerleaders"; none for a bare D6. */
  modifierName?: string;
  modifierOf: (team: Team) => number;
  pick: "highest" | "lowest";
  /** What the roll decides, shown on each die: "higher total gets…". */
  stakes: string;
}

/**
 * Shared D6 + modifier roll-off: each team rolls in turn, and `pick` names
 * the side that wins it. Both teams are returned on a tie. Each die says
 * what it is for, and lands before the next is thrown.
 */
async function rollOff(
  { diceController, eventBus, diceShown }: ResolverDeps,
  { label, modifierName, modifierOf, pick, stakes }: RollOffRule,
  teams: Team[]
): Promise<Team[]> {
  const totals: Record<string, number> = {};
  for (const team of teams) {
    const modifier = modifierOf(team);
    const adds =
      modifierName && modifier > 0 ? ` + ${modifier} ${modifierName}` : "";
    const roll = diceController.rollD6(
      `${label}: D6${adds} for ${team.name}, ${stakes}`,
      team.id
    );
    await diceShown();
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

async function resolveCheeringFans(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const { state, eventBus } = deps;
  const winners = await rollOff(
    deps,
    {
      label: "Cheering Fans",
      modifierName: "Cheerleaders",
      stakes: "higher total gets an extra assist",
      modifierOf: (team) =>
        team.cheerleaders +
        inducementCount(state, team.id, Inducement.TEMP_AGENCY_CHEERLEADER),
      pick: "highest",
    },
    [ctx.kickingTeam, ctx.receivingTeam]
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

async function resolveBrilliantCoaching(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const { state, eventBus } = deps;
  const winners = await rollOff(
    deps,
    {
      label: "Brilliant Coaching",
      modifierName: "Assistant Coaches",
      stakes: "higher total gets a free re-roll",
      modifierOf: (team) =>
        team.coaches +
        inducementCount(state, team.id, Inducement.PART_TIME_ASSISTANT_COACH),
      pick: "highest",
    },
    [ctx.kickingTeam, ctx.receivingTeam]
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

async function resolveChangingWeather(
  { weatherManager, onWeatherScatter, diceShown }: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const weather = weatherManager.rollWeather();
  await diceShown();
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

/** Random player of `team` currently on the pitch (D16-indexed, logged). */
async function randomPitchPlayer(
  { diceController, diceShown }: ResolverDeps,
  team: Team,
  event: string
): Promise<Player | undefined> {
  const onPitch = team.players.filter((player) => !!player.gridPosition);
  if (onPitch.length === 0) return undefined;
  // Rejection sampling over a D16 keeps every roster slot equally likely.
  const acceptedRange = Math.floor(16 / onPitch.length) * onPitch.length;
  let roll: number;
  do {
    roll = diceController.rollD16(
      `${event}: D16 picks which ${team.name} player`,
      team.id
    );
    await diceShown();
  } while (roll > acceptedRange);
  const index = (roll - 1) % onPitch.length;
  return onPitch[index];
}

async function resolveDodgySnack(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const { state, eventBus, diceController, diceShown } = deps;
  const afflicted = await rollOff(
    deps,
    {
      label: "Dodgy Snack",
      modifierOf: () => 0,
      pick: "lowest",
      stakes: "lower roll eats the snack",
    },
    [ctx.kickingTeam, ctx.receivingTeam]
  );
  for (const team of afflicted) {
    const player = await randomPitchPlayer(deps, team, "Dodgy Snack");
    if (!player) continue;
    const roll = diceController.rollD6(
      `Dodgy Snack: D6 for ${player.playerName}, a 1 sends them to the Reserves`,
      team.id
    );
    await diceShown();
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

async function resolvePitchInvasion(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const { eventBus } = deps;
  const afflicted = await rollOff(
    deps,
    {
      label: "Pitch Invasion",
      modifierName: "Dedicated Fans",
      stakes: "lower total has a player Stunned",
      modifierOf: (team) => team.dedicatedFans,
      pick: "lowest",
    },
    [ctx.kickingTeam, ctx.receivingTeam]
  );
  for (const team of afflicted) {
    const player = await randomPitchPlayer(deps, team, "Pitch Invasion");
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
