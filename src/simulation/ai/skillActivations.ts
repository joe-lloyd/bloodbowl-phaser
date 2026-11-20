import { type FieldPlayer as Player } from "./board";
import { PlayerStatus } from "../../types/Player";
import { hasSkill, SkillType } from "../../types/Skills";
import { canSecureBall } from "../../game/rules/secureBall";
import { type Context, gamble, tierFor } from "./activationContext";
import type { Activation } from "./activations";
import { blockFrom, targetValue } from "./blockActivations";
import { type Board, canCarry, distance, key, standing, toGoal } from "./board";
import { feedingCost, unfedChance } from "./feeding";
import { movesLeft, routesFor, withTeamReroll } from "./routes";
import { gazeActivations } from "./gazeActivations";
import { throwTeammateActivations } from "./teammateActivations";
import { pickupPace } from "./pickupActivations";
import type { ActionType } from "../../types/events";
import { standUpCost } from "../../game/skills/movement";
import { withDriveModifiers } from "../../game/kickoff/driveEffects";
import { chain } from "./chance";
import type { Route } from "./routes";

export const SKILL_PLANS: Partial<
  Record<ActionType, (c: Context, player: Player) => Activation[]>
> = {
  secureBall: secureBallActivations,
  gaze: gazeActivations,
  multipleBlock: multipleBlockActivations,
  throwTeamMate: throwTeammateActivations,
};

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
  const { after, moved } = afterPickup(board, player, pickup);
  const endings: Route[] = [
    ...routesFor({
      board: after,
      player: moved,
      securing: false,
      extraUsed: extraUsed,
    }).values(),
  ];
  if (toGoal(board, pickup.to) === 0)
    endings.push({ to: pickup.to, path: [], rolls: [], chance: pickup.chance });
  let value = -Infinity;
  for (const end of endings) {
    if (toGoal(board, end.to) !== 0) continue;
    const chance = chain({
      player: player,
      rolls: [...pickup.rolls, ...end.rolls],
      teamReroll: c.teamReroll,
      available: (skill) =>
        board.gs.getRerollArbiter().skillRerollAvailable(player, skill),
    });
    value = Math.max(
      value,
      gamble(
        c,
        chance,
        (1 -
          unfedChance({ c: c, player: player, action: "move", at: end.to })) *
          w.touchdown
      ) -
        feedingCost({
          c: c,
          player: player,
          action: "move",
          at: end.to,
          carrying: true,
        })
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
    !canCarry(player) ||
    !canSecureBall(
      player,
      board.ball.at,
      board.everyone.filter((p) => p.id !== player.id)
    )
  )
    return [];
  const routes = routesFor({ board: board, player: player, securing: true });
  const route = (
    c.teamReroll
      ? withTeamReroll(routes, player, (skill) =>
          board.gs.getRerollArbiter().skillRerollAvailable(player, skill)
        )
      : routes
  ).get(key(board.ball.at));
  if (!route) return [];
  const goal = toGoal(board, board.ball.at);
  const value =
    gamble(
      c,
      route.chance,
      goal === 0
        ? (1 -
            unfedChance({
              c: c,
              player: player,
              action: "secureBall",
              at: route.to,
            })) *
            w.touchdown
        : w.pickup + pickupPace(c, player)
    ) -
    feedingCost({
      c: c,
      player: player,
      action: "secureBall",
      at: route.to,
      carrying: true,
    });
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

function multipleBlockActivations(c: Context, player: Player): Activation[] {
  if (!standing(player) || !hasSkill(player.skills, SkillType.MULTIPLE_BLOCK))
    return [];
  const targets = c.board.theirs.filter(
    (p) => standing(p) && distance(player.gridPosition, p.gridPosition) === 1
  );
  const reduced = {
    ...player,
    stats: { ...player.stats, ST: Math.max(1, player.stats.ST - 2) },
  };
  const noReroll = { ...c, teamReroll: false };
  const out: Activation[] = [];
  for (const [i, firstTarget] of targets.entries())
    for (const secondTarget of targets.slice(i + 1)) {
      const first = blockFrom({
        c: noReroll,
        attacker: reduced,
        target: firstTarget,
        from: player.gridPosition,
      });
      const second = blockFrom({
        c: noReroll,
        attacker: reduced,
        target: secondTarget,
        from: player.gridPosition,
      });
      const down = 1 - (1 - first.attackerDown) * (1 - second.attackerDown);
      const value =
        first.knockdown * targetValue(c, player, firstTarget) +
        second.knockdown * targetValue(c, player, secondTarget) -
        down * (c.turnover + c.w.ownDown) -
        feedingCost({
          c: c,
          player: player,
          action: "multipleBlock",
          at: player.gridPosition,
        });
      out.push({
        player,
        action: "multipleBlock",
        intent: {
          kind: "multiple-block",
          targets: [firstTarget, secondTarget],
        },
        tier: 1 - down >= c.w.sureBlock ? "sure-block" : "risky",
        value,
        rolls: [],
      });
    }
  return out;
}

function afterPickup(board: Board, player: Player, pickup: Route) {
  const moved = {
    ...player,
    status: PlayerStatus.ACTIVE,
    gridPosition: pickup.to,
  };
  const occupant = [...board.occupant];
  occupant[key(player.gridPosition)] = undefined;
  occupant[key(pickup.to)] = moved;
  const after = {
    ...board,
    occupant,
    ours: board.ours.map((p) => (p.id === player.id ? moved : p)),
    everyone: board.everyone.map((p) => (p.id === player.id ? moved : p)),
    ball: { kind: "carried" as const, at: pickup.to, carrier: moved },
  };
  return { after, moved };
}
