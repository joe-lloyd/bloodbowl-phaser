import { catchTarget } from "../../game/rules/rollPreview";
import type { HeadlessGame } from "../../headless/HeadlessGame";
import { GameConfig } from "../../config/GameConfig";
import type { ActionType } from "../../types/events";
import { SkillType, hasSkill } from "../../types/Skills";
import { type Context, context } from "./activationContext";
import {
  type Board,
  type FieldPlayer as Player,
  type Square,
  canCarry,
  distance,
  key,
  neighbours,
  onPitch,
  pitchHeight,
  pitchWidth,
  readBoard,
  standing,
} from "./board";
import { d6, withReroll } from "./chance";
import type { RoleSquare } from "./repositionActivations";
import type { Weights } from "./weights";

const CLOSING = 0.5;
const LANE = 0.05;
const CLOSING_FROM = 12;
const LIKELY_RECEIVERS = 2;

export interface KickoffGround {
  c: Context;
  kicking: boolean;
  landing: Square | null;
}

export interface KickoffGroundArgs {
  game: HeadlessGame;
  teamId: string;
  w: Weights;
  available?: ReadonlyMap<string, ReadonlySet<ActionType>>;
}

function landingSquare(board: Board): Square | null {
  const { ballPosition, kick } = board.gs.getState();
  if (!ballPosition || kick?.touchback || !onPitch(ballPosition)) return null;
  return { ...ballPosition };
}

export function kickoffGround({
  game,
  teamId,
  w,
  available = new Map(),
}: KickoffGroundArgs): KickoffGround {
  const read = readBoard(game, teamId);
  const { kick } = read.gs.getState();
  const board: Board = {
    ...read,
    ball: { kind: "none" },
    turnsLeft: Math.max(
      0,
      GameConfig.TURNS_PER_HALF - read.gs.getTurnNumber(teamId)
    ),
  };
  return {
    c: { ...context({ board, w, available }), goal: "attack" },
    kicking: kick?.kickingTeamId === teamId,
    landing: landingSquare(read),
  };
}

export function catchChance({ c }: KickoffGround, player: Player, at: Square) {
  if (!canCarry(player)) return 0;
  const catcher = { ...player, gridPosition: at };
  const target = catchTarget(
    catcher,
    c.board.theirs,
    c.board.gs.getState(),
    "handoff"
  );
  return hasSkill(player.skills, SkillType.CATCH)
    ? withReroll(d6(target))
    : d6(target);
}

export function likelyReceivers({ c, landing }: KickoffGround): Player[] {
  const { theirs } = c.board;
  const able = theirs.filter((p) => standing(p) && canCarry(p));
  if (!landing)
    return able
      .sort((a, b) => b.stats.MA - a.stats.MA)
      .slice(0, LIKELY_RECEIVERS);
  const under = able.find((p) => key(p.gridPosition) === key(landing));
  if (under) return [under];
  const away = (p: Player) => distance(p.gridPosition, landing);
  return able
    .filter((p) => away(p) <= p.stats.MA)
    .sort((a, b) => away(a) - away(b) || a.stats.AG - b.stats.AG)
    .slice(0, LIKELY_RECEIVERS);
}

function closingSquares(landing: Square, chase: number): RoleSquare[] {
  const out: RoleSquare[] = [];
  for (let x = 0; x < pitchWidth(); x++)
    for (let y = 0; y < pitchHeight(); y++) {
      const at = { x, y };
      const away = distance(at, landing);
      if (!onPitch(at) || away === 0 || away >= CLOSING_FROM) continue;
      const closing = away === 1 ? chase : CLOSING * (CLOSING_FROM - away);
      const value = closing - LANE * Math.abs(y - landing.y);
      out.push({ role: "chase", at, value });
    }
  return out;
}

function markSquares(ground: KickoffGround): RoleSquare[] {
  const { board, w } = ground.c;
  return likelyReceivers(ground).flatMap((receiver) => {
    const at = receiver.gridPosition;
    const markers = board.ours.filter(
      (p) => standing(p) && distance(p.gridPosition, at) === 1
    ).length;
    const value = w.markCarrier / (1 + markers);
    return neighbours(at).map(
      (s): RoleSquare => ({ role: "mark", at: s, value })
    );
  });
}

export function underSquare(
  ground: KickoffGround,
  player: Player
): RoleSquare[] {
  const { landing, c } = ground;
  if (!landing) return [];
  const value = c.w.pickup * catchChance(ground, player, landing);
  return value > 0
    ? [{ role: "chase", at: landing, value, only: player.id }]
    : [];
}

export function teamSquares(ground: KickoffGround): RoleSquare[] {
  const { landing, kicking, c } = ground;
  return [
    ...(landing ? closingSquares(landing, c.w.chase) : []),
    ...(kicking ? markSquares(ground) : []),
  ];
}
