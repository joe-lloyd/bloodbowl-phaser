import { type IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { type Team } from "@/types/Team";
import { type Player, PlayerStatus } from "@/types/Player";
import { inducementCount } from "../inducements/inventory";
import { Inducement } from "@/types/Inducements";
import { normalWeather } from "../rules/weather";
import type { KickoffTableId } from "../variants/gameTypeRules";
import {
  KickoffEvent,
  grantEffect,
} from "./kickoffEvents";
import { getDriveEffects } from "./driveEffects";
import {
  type KickoffEventResolver,
  type KickoffEventResolverContext,
  type ResolverDeps,
  grantDriveReroll,
  noteBothTeams,
  placeProneAndStunned,
  randomPitchPlayer,
  rollOff,
  cheerleadersOf,
} from "./kickoffDice";
import { streetBowlResolvers } from "./streetBowlResolvers";
import { beachBowlResolvers } from "./beachBowlResolvers";
import { gutterBowlResolvers } from "./gutterBowlResolvers";

const WEATHER_SCATTER_SQUARES = {
  sevens: 3,
  "street-bowl": 3,
  "beach-bowl": 1,
  "gutter-street": 3,
  "gutter-sewer": 0,
} as const satisfies Record<KickoffTableId, number>;

export function kickoffEventResolvers(
  deps: ResolverDeps
): Record<KickoffEvent, KickoffEventResolver> {
  return {
    ...streetBowlResolvers(deps),
    ...beachBowlResolvers(deps),
    ...gutterBowlResolvers(deps),
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

async function resolveCheeringFans(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  if (ctx.table !== "sevens") {
    await fanFactorReroll(deps, ctx, "Cheering Fans");
    return;
  }
  const { state, eventBus } = deps;
  const winners = await rollOff(
    deps,
    {
      label: "Cheering Fans",
      modifierName: "Cheerleaders",
      stakes: "higher total gets an extra assist",
      modifierOf: (team) => cheerleadersOf(state, team),
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

async function fanFactorReroll(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext,
  label: string
): Promise<void> {
  const winners = await rollOff(
    deps,
    {
      label,
      modifierName: "Dedicated Fans",
      stakes: "higher total gets a free re-roll",
      modifierOf: (team) => team.dedicatedFans,
      pick: "highest",
    },
    [ctx.kickingTeam, ctx.receivingTeam]
  );
  if (winners.length === 1) grantRerollTo(deps, ctx, winners);
}

function grantRerollTo(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext,
  winners: Team[]
): void {
  for (const team of winners) grantDriveReroll(deps, team, ctx.outcome);
}

async function resolveBrilliantCoaching(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  if (ctx.table === "street-bowl") {
    await fanFactorReroll(deps, ctx, "Brilliant Coaching");
    return;
  }
  const { state } = deps;
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
  const tieGivesNothing = ctx.table === "beach-bowl" && winners.length > 1;
  if (!tieGivesNothing) grantRerollTo(deps, ctx, winners);
}

async function resolveChangingWeather(
  { weatherManager, onWeatherScatter, diceShown }: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const weather = weatherManager.rollWeather();
  await diceShown();
  const squares =
    weather === normalWeather(ctx.table)
      ? WEATHER_SCATTER_SQUARES[ctx.table]
      : 0;
  const name = weather === "Nice" ? "Perfect Conditions" : weather;
  const note =
    squares > 0
      ? `weather becomes ${name} — the kick Scatters (${String(squares)}) in the air`
      : `weather becomes ${weather}`;
  noteBothTeams(ctx, note);
  if (squares > 0) onWeatherScatter(squares);
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
    placeProneAndStunned(eventBus, player);
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
