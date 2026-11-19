import { type IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { type GameState } from "@/types/GameState";
import { type Team } from "@/types/Team";
import { type Player, PlayerStatus } from "@/types/Player";
import type { DiceController } from "../controllers/DiceController";
import type { WeatherManager } from "../managers/WeatherManager";
import { inducementCount } from "../inducements/inventory";
import { Inducement } from "@/types/Inducements";
import {
  KickoffEvent,
  type KickoffEventOutcome,
  grantEffect,
} from "./kickoffEvents";
import { getDriveEffects } from "./driveEffects";

interface KickoffEventResolverContext {
  isTeam1Kicking: boolean;
  kickingTeam: Team;
  receivingTeam: Team;
  outcome: KickoffEventOutcome;
}

type KickoffEventResolver = (
  ctx: KickoffEventResolverContext
) => void | Promise<void>;

const PERFECT_CONDITIONS = "Nice";

interface ResolverDeps {
  eventBus: IEventBus;
  state: GameState;
  diceController: DiceController;
  weatherManager: WeatherManager;
  getTurnNumber: (teamId: string) => number;
  moveTurnMarkers: (delta: number) => void;

  onWeatherScatter: () => void;

  diceShown: () => Promise<void>;
}

export function kickoffEventResolvers(
  deps: ResolverDeps
): Record<KickoffEvent, KickoffEventResolver> {
  return {
    [KickoffEvent.GET_THE_REF]: (ctx) => {
      resolveGetTheRef(deps, ctx);
    },
    [KickoffEvent.TIME_OUT]: (ctx) => {
      resolveTimeOut(deps, ctx);
    },
    [KickoffEvent.ALERT_DEFENCE]: () => undefined,
    [KickoffEvent.HIGH_KICK]: () => undefined,
    [KickoffEvent.CHEERING_FANS]: (ctx) => resolveCheeringFans(deps, ctx),
    [KickoffEvent.BRILLIANT_COACHING]: (ctx) =>
      resolveBrilliantCoaching(deps, ctx),
    [KickoffEvent.CHANGING_WEATHER]: (ctx) => resolveChangingWeather(deps, ctx),
    [KickoffEvent.QUICK_SNAP]: () => undefined,
    [KickoffEvent.CHARGE]: () => undefined,
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

interface RollOffRule {
  label: string;

  modifierName?: string;
  modifierOf: (team: Team) => number;
  pick: "highest" | "lowest";

  stakes: string;
}

async function rollTeam(
  { diceController, eventBus, diceShown }: ResolverDeps,
  { label, modifierName, modifierOf, stakes }: RollOffRule,
  team: Team
): Promise<{ team: Team; total: number }> {
  const modifier = modifierOf(team);
  const adds = modifierName && modifier > 0 ? ` + ${String(modifier)} ${modifierName}` : "";
  const roll = diceController.rollD6(`${label}: D6${adds} for ${team.name}, ${stakes}`, team.id);
  await diceShown();
  const total = roll + modifier;
  eventBus.emit(GameEventNames.UI_GameLog, `${label} — ${team.name}: D6 ${String(roll)} + ${String(modifier)} = ${String(total)}`);
  return { team, total };
}

async function rollOff(deps: ResolverDeps, rule: RollOffRule, teams: [Team, Team]): Promise<Team[]> {
  const a = await rollTeam(deps, rule, teams[0]);
  const b = await rollTeam(deps, rule, teams[1]);
  if (a.total === b.total) return [a.team, b.team];
  const aWins = rule.pick === "highest" ? a.total > b.total : a.total < b.total;
  return [aWins ? a.team : b.team];
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

async function randomPitchPlayer(
  { diceController, diceShown }: ResolverDeps,
  team: Team,
  event: string
): Promise<Player | undefined> {
  const onPitch = team.players.filter((player) => !!player.gridPosition);
  if (onPitch.length === 0) return undefined;

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

function removeFromPitch(eventBus: IEventBus, player: Player): void {
  delete player.gridPosition;
  player.status = PlayerStatus.RESERVE;
  eventBus.emit(GameEventNames.PlayerRemoved, player.id);
}
