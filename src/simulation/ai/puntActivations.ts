import {
  type FieldPlayer as Player,
  type Square,
  canCarry,
  distance,
  key,
  standing,
  toGoal,
} from "./board";
import type { Activation } from "./activations";
import { type Context, tierFor } from "./activationContext";
import { isOnPitch } from "../../game/rules/pitchSquares";
import { catchTarget } from "../../game/rules/rollPreview";
import { d6 } from "./chance";
import { finalBallLoss } from "./latePlans";
import {
  DIRS,
  templateOffset,
  toCardinalIndex,
} from "../../game/operations/throwInTemplate";

const PUNT_AIMS: readonly Square[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const DIE = [1, 2, 3, 4, 5, 6] as const;
const OPPONENT_CATCH = 0.5;
const PICK_UP = 0.5;

interface Punt {
  c: Context;
  from: Square;
}

interface Landing {
  at: Square;
  inBounds: boolean;
}

function landings(from: Square, aim: Square): Landing[] {
  const facing = toCardinalIndex(aim.x, aim.y);
  return DIE.flatMap((turn) => {
    const way = DIRS[(facing + templateOffset(turn) + 8) % 8];
    if (!way) return [];
    return DIE.map((far) => {
      const at = { x: from.x + way.x * far, y: from.y + way.y * far };
      return { at, inBounds: isOnPitch(at) };
    });
  });
}

function lost(c: Context, at: Square): number {
  const { board, w } = c;
  return board.turnsLeft === 0 ? finalBallLoss(c, at, w.ballLoss) : w.ballLoss;
}

function progressWorth({ c, from }: Punt, at: Square): number {
  const { board, w } = c;
  if (board.turnsLeft === 0) return 0;
  return (toGoal(board, from) - toGoal(board, at)) * w.advance * c.urgency;
}

function heldWorth({ c, from }: Punt, at: Square, mate: Player): number {
  const { board, w } = c;
  const goal = toGoal(board, at);
  if (goal === 0) return w.touchdown;
  if (c.available.has(mate.id) && goal <= mate.stats.MA)
    return w.touchdown * w.safeScore;
  return progressWorth({ c, from }, at);
}

function looseWorth(punt: Punt, at: Square): number {
  const { c, from } = punt;
  const { board } = c;
  const collectors = board.ours.filter(
    (p) =>
      standing(p) &&
      canCarry(p) &&
      c.available.has(p.id) &&
      key(p.gridPosition) !== key(from) &&
      distance(p.gridPosition, at) <= p.stats.MA
  );
  const best = Math.max(
    0,
    ...collectors.map((p) => {
      const left = p.stats.MA - distance(p.gridPosition, at);
      const scores = toGoal(board, at) <= left;
      return (scores ? c.w.touchdown : progressWorth(punt, at)) * PICK_UP;
    })
  );
  const share = collectors.length > 0 ? 1 - PICK_UP : 1;
  return best - share * lost(c, at);
}

function landingWorth(punt: Punt, landing: Landing): number {
  const { c, from } = punt;
  const { board, w } = c;
  const { at, inBounds } = landing;
  if (!inBounds) return -c.turnover - lost(c, from);
  const under = board.occupant[key(at)];
  if (!under || key(at) === key(from)) return looseWorth(punt, at);
  if (!standing(under)) return looseWorth(punt, at);
  if (under.teamId !== board.us)
    return (
      -OPPONENT_CATCH * (c.turnover + w.ballLoss) +
      (1 - OPPONENT_CATCH) * looseWorth(punt, at)
    );
  const caught = d6(
    catchTarget(under, board.theirs, board.gs.getState(), "handoff") + 1
  );
  return (
    caught * heldWorth(punt, at, under) + (1 - caught) * looseWorth(punt, at)
  );
}

export function puntActivations(c: Context, carrier: Player): Activation[] {
  const from = carrier.gridPosition;
  return PUNT_AIMS.map((aim): Activation => {
    const all = landings(from, aim);
    const value =
      all.reduce(
        (sum, landing) => sum + landingWorth({ c, from }, landing),
        0
      ) / Math.max(1, all.length);
    return {
      player: carrier,
      action: "punt",
      intent: { kind: "punt", aim },
      tier: tierFor(0, 1, "handoff"),
      value,
      rolls: [],
    };
  });
}
