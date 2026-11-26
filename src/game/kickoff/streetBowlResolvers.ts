import { Inducement } from "@/types/Inducements";
import { grantFreePotion, type PotionInducement } from "../inducements/inventory";
import { type Team } from "@/types/Team";
import { type Player } from "@/types/Player";
import { movePlayerToBox } from "../rules/playerLocation";
import { activeLayout } from "../variants/activeMatch";
import { BombBlastOperation } from "../operations/BombardierOperation";
import { KickoffEvent, grantEffect } from "./kickoffEvents";
import {
  type KickoffEventResolverContext,
  type ResolverDeps,
  everyoneOnPitch,
  grantLoggedEffect,
  knockDownWithArmour,
  onPitch,
  placeProneAndStunned,
  playersInWideZone,
  randomPitchPlayer,
  randomPlayers,
  randomWideZone,
  rollOff,
  shoveBack,
  team1IdOf,
} from "./kickoffDice";
import { lineOfScrimmagePlayers } from "./kickoffShoves";
import { chosenGuardOutcome, guardDice } from "./guardsBlock";

export function streetBowlResolvers(deps: ResolverDeps) {
  return {
    [KickoffEvent.LOOSE_MASONRY]: (ctx: KickoffEventResolverContext) =>
      resolveLooseMasonry(deps, ctx),
    [KickoffEvent.RIOT]: (ctx: KickoffEventResolverContext) =>
      resolveRiot(deps, ctx),
    [KickoffEvent.STRAY_PONY]: (ctx: KickoffEventResolverContext) =>
      resolveStrayPony(deps, ctx),
    [KickoffEvent.POTION_PEDDLER]: (ctx: KickoffEventResolverContext) => {
      grantPotions(deps, ctx, Inducement.MAGIC_POTION);
    },
    [KickoffEvent.BLITZ]: () => undefined,
    [KickoffEvent.THROW_A_BOMB]: (ctx: KickoffEventResolverContext) =>
      resolveThrowABomb(deps, ctx),
    [KickoffEvent.GUARDS]: (ctx: KickoffEventResolverContext) =>
      resolveGuards(deps, ctx),
  };
}

export function grantPotions(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext,
  potion: PotionInducement
): void {
  for (const team of [ctx.kickingTeam, ctx.receivingTeam]) {
    grantFreePotion(deps.state, team.id, potion);
    grantLoggedEffect(deps, ctx, {
      team,
      effect: "magic-potion",
      detail: `gains a free ${potion}`,
    });
  }
}

async function resolveLooseMasonry(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const zone = await randomWideZone(deps, "Loose Masonry");
  for (const player of playersInWideZone(ctx, zone)) {
    grantEffect(ctx.outcome, player.teamId, `${player.playerName} is Knocked Down by falling bricks`);
    await knockDownWithArmour(deps, player, 0);
  }
}

async function resolveRiot(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const losers = await rollOff(
    deps,
    { label: "Riot", modifierOf: () => 0, pick: "lowest", stakes: "lower roll has D3 players Stunned" },
    [ctx.kickingTeam, ctx.receivingTeam]
  );
  for (const team of losers) {
    const count = deps.diceController.rollD3(`Riot: D3 ${team.name} players`, team.id);
    await deps.diceShown();
    const riotPlayers = await randomPlayers(deps, team, { event: "Riot", count });
    for (const player of riotPlayers) {
      placeProneAndStunned(deps.eventBus, player);
      grantEffect(ctx.outcome, team.id, `${player.playerName} is Placed Prone and Stunned by the riot`);
    }
  }
}

async function resolveStrayPony(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const layout = activeLayout();
  const everyone = everyoneOnPitch(ctx);
  const team1Id = team1IdOf(ctx);
  for (const player of lineOfScrimmagePlayers(layout, everyone, team1Id)) {
    if (!shoveBack(deps, ctx, player)) continue;
    await ponyDodge(deps, ctx, player);
  }
}

async function ponyDodge(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext,
  player: Player
): Promise<void> {
  if (player.stats.ST >= 5) {
    grantEffect(ctx.outcome, player.teamId, `the pony goes round ${player.playerName}`);
    return;
  }
  const dodge = deps.diceController.rollSkillCheck({
    reason: "Stray Pony: Dodge",
    target: player.stats.AG,
    modifier: 0,
    playerName: player.playerName,
    teamId: player.teamId,
  });
  await deps.diceShown();
  if (dodge.success) return;
  grantEffect(ctx.outcome, player.teamId, `${player.playerName} is trampled by the pony`);
  await knockDownWithArmour(deps, player, 2);
}

async function resolveThrowABomb(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const targets = await rollOff(
    deps,
    {
      label: "Throw a Bomb",
      modifierName: "Dedicated Fans",
      modifierOf: (team) => team.dedicatedFans,
      pick: "lowest",
      stakes: "lower total is bombed",
    },
    [ctx.kickingTeam, ctx.receivingTeam]
  );
  const [team] = targets;
  if (targets.length !== 1 || !team) {
    grantEffect(ctx.outcome, ctx.kickingTeam.id, "the bomb is a dud");
    return;
  }
  const victim = await randomPitchPlayer(deps, team, "Throw a Bomb");
  if (!victim?.gridPosition) return;
  grantEffect(ctx.outcome, team.id, `${victim.playerName} is hit by a bomb from the crowd`);
  await deps.flowManager.runToRest(new BombBlastOperation({ ...victim.gridPosition }));
}

async function slowestPlayer(deps: ResolverDeps, team: Team): Promise<Player | undefined> {
  const players = onPitch(team);
  const slowest = Math.min(...players.map((player) => player.stats.MA));
  const tied = players.filter((player) => player.stats.MA === slowest);
  if (tied.length <= 1) return tied[0];
  const [picked] = await randomPlayers(deps, team, { event: "Guards!", count: 1, from: tied });
  return picked;
}

async function resolveGuards(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  for (const team of [ctx.kickingTeam, ctx.receivingTeam]) {
    const target = await slowestPlayer(deps, team);
    if (target) await guardsBlock(deps, ctx, target);
  }
}

async function guardsBlock(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext,
  target: Player
): Promise<void> {
  const dice = guardDice(target.stats.ST);
  const faces = deps.diceController.rollBlockDice(dice.count, target.teamId);
  await deps.diceShown();
  const outcome = chosenGuardOutcome(faces.map((face) => face.type), target, dice.chooser);
  if (outcome === "pushed") {
    shoveBack(deps, ctx, target);
    grantEffect(ctx.outcome, target.teamId, `${target.playerName} is shoved back by the Watch`);
  } else if (outcome === "arrested") {
    movePlayerToBox(target, { box: "sent-off" }, deps.eventBus);
    grantEffect(ctx.outcome, target.teamId, `${target.playerName} is arrested for the rest of the game`);
  } else {
    grantEffect(ctx.outcome, target.teamId, `${target.playerName} shrugs off the Watch`);
  }
}
