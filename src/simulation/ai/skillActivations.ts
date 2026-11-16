/** Small capability proposals share the ordinary activation planner. */
import { Player, PlayerStatus } from "../../types/Player";
import { hasSkill, SkillType } from "../../types/Skills";
import { canSecureBall } from "../../game/rules/secureBall";
import { Context, gamble, tierFor } from "./activationContext";
import type { Activation } from "./activations";
import { blockFrom, targetValue } from "./blockActivations";
import { distance, key, standing, toGoal } from "./board";
import { feedingCost } from "./feeding";
import { movesLeft, routesFor, withTeamReroll } from "./routes";
import { gazeActivations } from "./gazeActivations";
import type { ActionType } from "../../types/events";
import { standUpCost } from "../../game/skills/movement";
import { withDriveModifiers } from "../../game/kickoff/driveEffects";
import { chain } from "./chance";
import type { Route } from "./routes";

/** The same small modules serve declarations and in-progress actions. */
export const SKILL_PLANS: Partial<
  Record<ActionType, (c: Context, player: Player) => Activation[]>
> = {
  secureBall: secureBallActivations,
  gaze: gazeActivations,
  multipleBlock: multipleBlockActivations,
};

/** A normal pickup may keep moving. Price a real scoring route, sharing rerolls. */
function pickupScoreValue(c: Context, player: Player): number {
  const { board, w } = c;
  if (board.ball.kind !== "loose") return -Infinity;
  const pickup = c.routes(player).get(key(board.ball.at));
  if (!pickup) return -Infinity;
  const extraUsed =
    pickup.path.length +
    (player.status === PlayerStatus.PRONE
      ? standUpCost(withDriveModifiers(player, board.gs.getState()))
      : 0);
  const [normal, rushes] = movesLeft(board, player);
  if (toGoal(board, pickup.to) > normal + rushes - pickup.path.length)
    return -Infinity;
  const moved = {
    ...player,
    status: PlayerStatus.ACTIVE,
    gridPosition: pickup.to,
  };
  const occupant = [...board.occupant];
  occupant[key(player.gridPosition!)] = undefined;
  occupant[key(pickup.to)] = moved;
  const after = {
    ...board,
    occupant,
    ours: board.ours.map((p) => (p.id === player.id ? moved : p)),
    everyone: board.everyone.map((p) => (p.id === player.id ? moved : p)),
    ball: { kind: "carried" as const, at: pickup.to, carrier: moved },
  };
  const endings: Route[] = [
    ...routesFor(after, moved, false, extraUsed).values(),
  ];
  if (toGoal(board, pickup.to) === 0)
    endings.push({ to: pickup.to, path: [], rolls: [], chance: pickup.chance });
  let value = -Infinity;
  for (const end of endings) {
    if (toGoal(board, end.to) !== 0) continue;
    const chance = chain(player, [...pickup.rolls, ...end.rolls], c.teamReroll);
    value = Math.max(
      value,
      gamble(c, chance, w.touchdown) -
        feedingCost(c, player, "move", end.to, true)
    );
  }
  return value;
}

export function secureBallActivations(
  c: Context,
  player: Player
): Activation[] {
  const { board, w } = c;
  if (
    board.ball.kind !== "loose" ||
    !canSecureBall(
      player,
      board.ball.at,
      board.everyone.filter((p) => p.id !== player.id)
    )
  )
    return [];
  const routes = routesFor(board, player, true);
  const route = (c.teamReroll ? withTeamReroll(routes, player) : routes).get(
    key(board.ball.at)
  );
  if (!route) return [];
  const goal = toGoal(board, board.ball.at);
  const value =
    gamble(c, route.chance, goal === 0 ? w.touchdown : w.pickup) -
    feedingCost(c, player, "secureBall", route.to, true);
  if (pickupScoreValue(c, player) > value) return [];
  return [
    {
      player,
      action: "secureBall",
      intent: { kind: "secure-ball", route },
      tier: tierFor(route.chance, w.pickupMin, "pickup"),
      value,
      rolls: route.rolls,
    },
  ];
}

export function multipleBlockActivations(
  c: Context,
  player: Player
): Activation[] {
  if (!standing(player) || !hasSkill(player.skills, SkillType.MULTIPLE_BLOCK))
    return [];
  const targets = c.board.theirs.filter(
    (p) => standing(p) && distance(player.gridPosition!, p.gridPosition!) === 1
  );
  const reduced = {
    ...player,
    stats: { ...player.stats, ST: Math.max(1, player.stats.ST - 2) },
  };
  const noReroll = { ...c, teamReroll: false };
  const out: Activation[] = [];
  for (let i = 0; i < targets.length; i++)
    for (let j = i + 1; j < targets.length; j++) {
      const first = blockFrom(
        noReroll,
        reduced,
        targets[i],
        player.gridPosition!
      );
      const second = blockFrom(
        noReroll,
        reduced,
        targets[j],
        player.gridPosition!
      );
      const down = 1 - (1 - first.attackerDown) * (1 - second.attackerDown);
      const value =
        first.knockdown * targetValue(c, player, targets[i]) +
        second.knockdown * targetValue(c, player, targets[j]) -
        down * (c.turnover + c.w.ownDown) -
        feedingCost(c, player, "multipleBlock", player.gridPosition!);
      out.push({
        player,
        action: "multipleBlock",
        intent: { kind: "multiple-block", targets: [targets[i], targets[j]] },
        tier: 1 - down >= c.w.sureBlock ? "sure-block" : "risky",
        value,
        rolls: [],
      });
    }
  return out;
}
