import type { Candidate } from "../candidates";
import { blockFrom, targetValue } from "./blockActivations";
import {
  type FieldPlayer as Player,
  type Square,
  distance,
  key,
  neighbours,
  standing,
} from "./board";
import { type KickoffGround, teamSquares, underSquare } from "./kickoffGround";

const FIRST_BLOCK = 0.5;
const CLOSING = 0.5;
const CLOSE_ENOUGH = 2;
const WORTHWHILE = 0.1;

export interface KickoffStep {
  player: Player;
  at: Square;
  value: number;
  what: string;
}

interface Worth {
  value: number;
  what: string;
}

function firstBlock({ c }: KickoffGround, player: Player, at: Square): number {
  const hits = c.board.theirs
    .filter((o) => standing(o) && distance(o.gridPosition, at) === 1)
    .map((target) => {
      const odds = blockFrom({ c, attacker: player, target, from: at });
      return (
        odds.knockdown * targetValue(c, player, target) -
        odds.attackerDown * (c.turnover + c.w.ownDown)
      );
    });
  return Math.max(0, ...hits);
}

function contactCost({ c }: KickoffGround, at: Square): number {
  return c.board.marks.getUint8(key(at)) * c.w.endInContact;
}

function receiverWorth(
  ground: KickoffGround,
  player: Player,
  at: Square
): Worth {
  const { landing, c } = ground;
  const [under] = underSquare(ground, player);
  if (landing && under && key(at) === key(landing))
    return { value: under.value, what: "gets under the ball" };
  const block = FIRST_BLOCK * firstBlock(ground, player, at);
  if (block > contactCost(ground, at))
    return { value: block, what: "steps up to block" };
  const away = landing ? distance(at, landing) : 0;
  const corner =
    landing &&
    Math.abs(at.x - landing.x) === 1 &&
    Math.abs(at.y - landing.y) === 1
      ? c.w.cageCorner
      : 0;
  return {
    value:
      corner - CLOSING * Math.max(away, CLOSE_ENOUGH) - contactCost(ground, at),
    what: "drops towards the ball",
  };
}

function kickerWorth(ground: KickoffGround, player: Player, at: Square): Worth {
  const { landing } = ground;
  const here = [...teamSquares(ground), ...underSquare(ground, player)].filter(
    (s) => key(s.at) === key(at)
  );
  let best: (typeof here)[number] | null = null;
  for (const s of here) {
    if (!(best && best.value >= s.value)) best = s;
  }
  const marking = best?.role === "mark";
  const lane = landing ? (CLOSING / 2) * Math.abs(at.y - landing.y) : 0;
  return {
    value: (best?.value ?? 0) - lane - (marking ? 0 : contactCost(ground, at)),
    what: marking ? "marks a likely receiver" : "closes the lane to the ball",
  };
}

export function bestKickoffStep(
  ground: KickoffGround,
  player: Player,
  squares: readonly Square[]
): KickoffStep | null {
  const { landing, kicking } = ground;
  if (landing && key(player.gridPosition) === key(landing)) return null;
  const worth = (at: Square) =>
    (kicking ? kickerWorth : receiverWorth)(ground, player, at);
  const here = worth(player.gridPosition).value;
  let best: KickoffStep | null = null;
  for (const at of squares) {
    const { value, what } = worth(at);
    const gain = value - here;
    if (gain > (best?.value ?? WORTHWHILE))
      best = { player, at, value: gain, what };
  }
  return best;
}

export function freeNeighbours(
  { c }: KickoffGround,
  { gridPosition }: Player
): Square[] {
  return neighbours(gridPosition).filter((s) => c.board.occupant[key(s)] === undefined);
}

export function stepIndex(
  candidates: readonly Candidate[],
  { player, at }: KickoffStep
): number {
  return candidates.findIndex((candidate) => {
    const command = candidate.commands[0];
    return (
      command.type === "kickoff-move-player" &&
      command.playerId === player.id &&
      command.x === at.x &&
      command.y === at.y
    );
  });
}
