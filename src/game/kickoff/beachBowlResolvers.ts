import { type Player } from "@/types/Player";
import { movePlayerToBox } from "../rules/playerLocation";
import { activeLayout } from "../variants/activeMatch";
import {
  isInsideLayout,
  type Square,
  twoTeamFrames,
} from "../variants/pitchLayouts";
import { InjuryOperation } from "../operations/InjuryOperation";
import { knockDownPlayer } from "../operations/knockDown";
import { KickoffEvent, grantEffect } from "./kickoffEvents";
import {
  type WideZone,
  addDriveCondition,
  getDriveEffects,
} from "./driveEffects";
import {
  type KickoffEventResolverContext,
  type ResolverDeps,
  cheerleadersOf,
  everyoneOnPitch,
  grantDriveReroll,
  movePlayers,
  noteBothTeams,
  playersInWideZone,
  randomPitchPlayer,
  randomWideZone,
  rollOff,
} from "./kickoffDice";
import { type PitchMove, d8Step, washedTo } from "./kickoffShoves";

export function beachBowlResolvers(deps: ResolverDeps) {
  return {
    [KickoffEvent.HIGH_TIDE]: (ctx: KickoffEventResolverContext) =>
      resolveHighTide(deps, ctx),
    [KickoffEvent.ROUSTED]: (ctx: KickoffEventResolverContext) =>
      resolveRousted(deps, ctx),
    [KickoffEvent.LOST_BALL]: (ctx: KickoffEventResolverContext) =>
      resolveLostBall(deps, ctx),
    [KickoffEvent.SAMBA]: (ctx: KickoffEventResolverContext) =>
      resolveSamba(deps, ctx),
    [KickoffEvent.JELLYFISH]: (ctx: KickoffEventResolverContext) =>
      resolveJellyfish(deps, ctx),
    [KickoffEvent.SEAGULL_ATTACK]: (ctx: KickoffEventResolverContext) => {
      addDriveCondition(deps.state, "seagulls");
      noteBothTeams(ctx, "passes suffer -1 (Quick, Short) or -2 (Long, Bomb) this drive");
    },
    [KickoffEvent.MONSTER_WAVE]: (ctx: KickoffEventResolverContext) =>
      resolveMonsterWave(deps, ctx),
  };
}

function wadeTarget(square: Square, zone: WideZone, taken: (square: Square) => boolean): Square | null {
  const { centre } = twoTeamFrames(activeLayout())[0].arm;
  const step = zone === "top" ? 1 : -1;
  const first = zone === "top" ? centre.min : centre.max;
  for (let y = first; y >= centre.min && y <= centre.max; y += step) {
    const candidate = { x: square.x, y };
    if (!taken(candidate)) return candidate;
  }
  return null;
}

async function resolveHighTide(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const zone = await randomWideZone(deps, "High Tide");
  getDriveEffects(deps.state).floodedZone = zone;
  noteBothTeams(ctx, `the ${zone} Wide Zone floods for this drive`);
  const everyone = everyoneOnPitch(ctx);
  const taken = (square: Square) =>
    everyone.some((player) => player.gridPosition?.x === square.x && player.gridPosition.y === square.y);
  const waders = [...playersInWideZone(ctx, zone)].sort((a, b) => nearestCentreFirst(a, b, zone));
  for (const player of waders) {
    const from = player.gridPosition;
    const to = from ? wadeTarget(from, zone, taken) : null;
    if (to) movePlayers(deps.eventBus, [{ player, to }]);
    else movePlayerToBox(player, { box: "reserves" }, deps.eventBus);
  }
}

function nearestCentreFirst(a: Player, b: Player, zone: WideZone): number {
  const ay = a.gridPosition?.y ?? 0;
  const by = b.gridPosition?.y ?? 0;
  return zone === "top" ? by - ay : ay - by;
}

async function resolveRousted(
  { diceController, diceShown, getTurnNumber, moveTurnMarkers }: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const receivingTurn = getTurnNumber(ctx.receivingTeam.id);
  let delta: number;
  if (receivingTurn >= 5) delta = -1;
  else if (receivingTurn === 0) delta = 1;
  else {
    const roll = diceController.rollD6("Rousted: D6, 1-3 forward, 4-6 back");
    await diceShown();
    delta = roll <= 3 ? 1 : -1;
  }
  moveTurnMarkers(delta);
  noteBothTeams(ctx, delta < 0 ? "turn marker moves back one" : "turn marker moves forward one");
}

async function resolveLostBall(
  { state, diceController, diceShown }: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const roll = diceController.rollD6("Lost Ball: D6, 1-3 a conch shell, 4-6 a beach ball");
  await diceShown();
  state.lostBall = roll <= 3 ? "conch" : "beach-ball";
  noteBothTeams(
    ctx,
    roll <= 3
      ? "the game goes on with a conch shell: -1 pick-up, catch and intercept"
      : "the game goes on with a beach ball: -1 pass, +1 pick-up, catch and intercept"
  );
}

async function resolveSamba(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const winners = await rollOff(
    deps,
    {
      label: "Samba!",
      modifierName: "Cheerleaders",
      modifierOf: (team) => cheerleadersOf(deps.state, team),
      pick: "highest",
      stakes: "higher total gets a free re-roll",
    },
    [ctx.kickingTeam, ctx.receivingTeam]
  );
  const [winner] = winners;
  if (winners.length === 1 && winner) grantDriveReroll(deps, winner, ctx.outcome);
}

async function resolveJellyfish(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const stung = await rollOff(
    deps,
    { label: "Jellyfish!?", modifierOf: () => 0, pick: "lowest", stakes: "lower roll is stung" },
    [ctx.kickingTeam, ctx.receivingTeam]
  );
  for (const team of stung) {
    const player = await randomPitchPlayer(deps, team, "Jellyfish!?");
    if (!player) continue;
    grantEffect(ctx.outcome, team.id, `${player.playerName} is stung and makes an Injury roll`);
    knockDownPlayer(deps.eventBus, player);
    await deps.flowManager.runToRest(new InjuryOperation(player.id, { cause: "special" }));
  }
}

async function resolveMonsterWave(
  deps: ResolverDeps,
  ctx: KickoffEventResolverContext
): Promise<void> {
  const direction = deps.diceController.rollD8("Monster Wave: direction");
  const distance = deps.diceController.rollD3("Monster Wave: squares");
  await deps.diceShown();
  const step = d8Step(direction);
  const layout = activeLayout();
  const moves: PitchMove[] = [];
  for (const player of everyoneOnPitch(ctx)) {
    const from = player.gridPosition;
    if (!from) continue;
    const to = washedTo(from, step, distance);
    if (isInsideLayout(layout, to)) moves.push({ player, to });
    else {
      movePlayerToBox(player, { box: "reserves" }, deps.eventBus);
      grantEffect(ctx.outcome, player.teamId, `${player.playerName} is washed off the pitch`);
    }
  }
  movePlayers(deps.eventBus, moves);
  noteBothTeams(ctx, `every player is washed ${String(distance)} squares`);
}
