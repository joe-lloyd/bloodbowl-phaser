import { Inducement } from "@/types/Inducements";
import { surfaceArmourModifier } from "../rules/surfaceArmour";
import { activeRules } from "../variants/activeMatch";
import { GameEventNames } from "../../types/events";
import { type Player, PlayerStatus } from "@/types/Player";
import { movePlayerToBox } from "../rules/playerLocation";
import { activeLayout } from "../variants/activeMatch";
import { ArmourOperation } from "../operations/ArmourOperation";
import { CasualtyOperation } from "../operations/CasualtyOperation";
import { InjuryResult } from "../controllers/InjuryController";
import { KickoffEvent, grantEffect } from "./kickoffEvents";
import {
  type DriveCondition,
  addDriveCondition,
  getDriveEffects,
} from "./driveEffects";
import {
  type KickoffEventResolverContext,
  type ResolverDeps,
  everyoneOnPitch,
  noteBothTeams,
  placeProne,
  placeProneAndStunned,
  playersInWideZone,
  randomPitchPlayer,
  randomWideZone,
  rollOff,
  shoveBack,
  team1IdOf,
} from "./kickoffDice";
import { lineOfScrimmagePlayers, withinTwoOfObstacle } from "./kickoffShoves";
import { grantPotions } from "./streetBowlResolvers";

type Resolve = (ctx: KickoffEventResolverContext) => Promise<void> | void;

function driveCondition(deps: ResolverDeps, condition: DriveCondition, note: string): Resolve {
  return (ctx) => {
    addDriveCondition(deps.state, condition);
    noteBothTeams(ctx, note);
  };
}

export function gutterBowlResolvers(deps: ResolverDeps) {
  return {
    [KickoffEvent.FALLING_ROOF_TILES]: (ctx: KickoffEventResolverContext) =>
      resolveFallingRoofTiles(deps, ctx),
    [KickoffEvent.GUTTER_RIOT]: (ctx: KickoffEventResolverContext) =>
      resolveGutterRiot(deps, ctx),
    [KickoffEvent.QUICK_ATTACK]: () => undefined,
    [KickoffEvent.ROGUE_WASHING_LINE]: (ctx: KickoffEventResolverContext) =>
      resolveWashingLine(deps, ctx),
    [KickoffEvent.ROUND_ON_US]: driveCondition(deps, "round-on-us", "a KO'd player goes to the Reserves on a D6 of 4+ this drive"),
    [KickoffEvent.LOOSE_DOGS]: driveCondition(deps, "loose-dogs", "no team re-rolls on pick-ups or Blocks this drive"),
    [KickoffEvent.BLACK_MARKET_DEALER]: (ctx: KickoffEventResolverContext) => {
      grantPotions(deps, ctx, Inducement.LESSER_MAGIC_POTION);
    },
    [KickoffEvent.FURIOUS_NEIGHBOUR]: (ctx: KickoffEventResolverContext) =>
      resolveFuriousNeighbour(deps, ctx),
    [KickoffEvent.GUARDS_ARE_COMING]: (ctx: KickoffEventResolverContext) =>
      resolveGuardsAreComing(deps, ctx),
    [KickoffEvent.TENTACLED_TERROR]: (ctx: KickoffEventResolverContext) =>
      resolveTentacledTerror(deps, ctx),
    [KickoffEvent.SUDDEN_STINK]: (ctx: KickoffEventResolverContext) => {
      resolveSuddenStink(deps, ctx);
    },
    [KickoffEvent.BATS]: (ctx: KickoffEventResolverContext) =>
      resolveBats(deps, ctx),
    [KickoffEvent.GET_READY_LADS]: () => undefined,
    [KickoffEvent.STICKY_SLUDGE]: driveCondition(deps, "sticky-sludge", "pick-ups are at +1 but a ball carrier cannot Pass this drive"),
    [KickoffEvent.FRESH_SEWAGE]: (ctx: KickoffEventResolverContext) => {
      resolveFreshSewage(deps, ctx);
    },
    [KickoffEvent.SWARM_OF_RATS]: driveCondition(deps, "swarm-of-rats", "a player ending an activation by a wall Falls Over on a D6 of 1 this drive"),
  };
}

async function resolveFallingRoofTiles(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const zone = await randomWideZone(deps, "Falling Roof Tiles");
  const standingArmour = -surfaceArmourModifier(activeRules().armour, "knocked-down");
  for (const player of playersInWideZone(ctx, zone)) {
    grantEffect(ctx.outcome, player.teamId, `${player.playerName} is hit by roof tiles`);
    await deps.flowManager.runToRest(
      new ArmourOperation(player.id, undefined, undefined, "special", standingArmour)
    );
  }
}

async function resolveGutterRiot(
  { diceController, diceShown, eventBus }: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  for (const player of everyoneOnPitch(ctx)) {
    const roll = diceController.rollD6(`Riot!: D6 for ${player.playerName}, a 6 is Stunned`, player.teamId);
    await diceShown();
    if (roll !== 6) continue;
    placeProneAndStunned(eventBus, player);
    grantEffect(ctx.outcome, player.teamId, `${player.playerName} is Placed Prone and Stunned by the riot`);
  }
}

async function resolveWashingLine(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  for (const team of [ctx.kickingTeam, ctx.receivingTeam]) {
    const player = await randomPitchPlayer(deps, team, "Rogue Washing Line");
    if (!player) continue;
    const modifiers = getDriveEffects(deps.state).playerModifiers;
    modifiers[player.id] = {
      ...modifiers[player.id],
      missesTurn: deps.getTurnNumber(team.id) + 1,
    };
    grantEffect(ctx.outcome, team.id, `${player.playerName} is tangled in washing and cannot act next turn`);
  }
}

async function resolveFuriousNeighbour(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const losers = await rollOff(
    deps,
    {
      label: "Furious Neighbour",
      modifierName: "Dedicated Fans",
      modifierOf: (team) => team.dedicatedFans,
      pick: "lowest",
      stakes: "lower total has a player KO'd",
    },
    [ctx.kickingTeam, ctx.receivingTeam]
  );
  for (const team of losers) {
    const player = await randomPitchPlayer(deps, team, "Furious Neighbour");
    if (!player) continue;
    movePlayerToBox(player, { box: "ko" }, deps.eventBus);
    grantEffect(ctx.outcome, team.id, `${player.playerName} is knocked out by a flower pot`);
  }
}

async function resolveGuardsAreComing(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  for (const team of [ctx.kickingTeam, ctx.receivingTeam]) {
    const player = await randomPitchPlayer(deps, team, "The Guards Are Coming!");
    if (!player) continue;
    const roll = deps.diceController.rollD6(`The Guards Are Coming!: D6 for ${player.playerName}, 1-2 is arrested`, team.id);
    await deps.diceShown();
    if (roll > 2) {
      grantEffect(ctx.outcome, team.id, `${player.playerName} slips away from the Guards`);
      continue;
    }
    movePlayerToBox(player, { box: "sent-off" }, deps.eventBus);
    grantEffect(ctx.outcome, team.id, `${player.playerName} is arrested for the rest of the game`);
  }
}

async function resolveTentacledTerror(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const losers = await rollOff(
    deps,
    { label: "Tentacled Terror", modifierOf: () => 0, pick: "lowest", stakes: "lower roll loses a player to the tentacles" },
    [ctx.kickingTeam, ctx.receivingTeam]
  );
  for (const team of losers) {
    const player = await randomPitchPlayer(deps, team, "Tentacled Terror");
    if (player) await becomeCasualty(deps, player);
    if (player) grantEffect(ctx.outcome, team.id, `${player.playerName} is dragged into the sewer`);
  }
}

async function becomeCasualty(deps: ResolverDeps, player: Player): Promise<void> {
  player.status = PlayerStatus.INJURED;
  deps.eventBus.emit(GameEventNames.PlayerCasualtyInflicted, {
    victimId: player.id,
    cause: "special",
    sppEligible: false,
  });
  await deps.flowManager.runToRest(
    new CasualtyOperation(player.id, InjuryResult.BADLY_HURT, undefined, "special")
  );
}

function resolveSuddenStink(deps: ResolverDeps, ctx: KickoffEventResolverContext): void {
  const everyone = everyoneOnPitch(ctx);
  const team1Id = team1IdOf(ctx);
  for (const player of lineOfScrimmagePlayers(everyone, team1Id)) {
    shoveBack(deps, ctx, player);
  }
  noteBothTeams(ctx, "the Lines of Scrimmage reel back from the stink");
}

async function resolveBats(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const losers = await rollOff(
    deps,
    { label: "Bats!", modifierOf: () => 0, pick: "lowest", stakes: "lower roll has a player Stunned" },
    [ctx.kickingTeam, ctx.receivingTeam]
  );
  for (const team of losers) {
    const player = await randomPitchPlayer(deps, team, "Bats!");
    if (!player) continue;
    placeProneAndStunned(deps.eventBus, player);
    grantEffect(ctx.outcome, team.id, `${player.playerName} is Placed Prone and Stunned by bats`);
  }
}

function resolveFreshSewage(deps: ResolverDeps, ctx: KickoffEventResolverContext): void {
  const layout = activeLayout();
  for (const player of everyoneOnPitch(ctx)) {
    if (!player.gridPosition || !withinTwoOfObstacle(layout, player.gridPosition)) continue;
    placeProne(deps.eventBus, player);
    grantEffect(ctx.outcome, player.teamId, `${player.playerName} slips in the sewage and is Placed Prone`);
  }
  noteBothTeams(ctx, "fresh sewage spills from the pits");
}
