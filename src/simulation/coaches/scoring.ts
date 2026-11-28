import type { HeadlessGame } from "../../headless/HeadlessGame";
import type { HeadlessCommand } from "../../headless/protocol";
import { ballOf, groundBalls } from "../../game/rules/balls";
import { type Frame, squareAt } from "../../game/rules/frames";
import { seatOf } from "../../game/seating";
import type { Square } from "../../game/variants/pitchLayouts";
import type { Player } from "../../types/Player";
import type { Candidate } from "../candidates";
import type { Coach } from "../coach";
import { randomCoach } from "./random";

const LEAN = 0.75;
const SCORES = 10;
const NEAR_A_BALL = 3;

const chebyshev = (a: Square, b: Square) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function toEndZone(frame: Frame, at: Square): number {
  const { length, width } = frame.arm;
  const zone = Array.from({ length: width }, (_, across) =>
    squareAt(frame, length - 1, across)
  );
  return Math.min(...zone.map((square) => chebyshev(at, square)));
}

function toLooseBall(game: HeadlessGame, at: Square): number {
  const gs = game.ctx.gameService;
  const loose = groundBalls(gs.getState())
    .map(({ at: ball }) => ball)
    .filter((ball) => ball !== null && !gs.getPlayerAt(ball.x, ball.y));
  const distances = loose.map((ball) => (ball ? chebyshev(at, ball) : Infinity));
  return Math.min(Infinity, ...distances);
}

function stepGain(game: HeadlessGame, player: Player, to: Square): number {
  const from = player.gridPosition;
  if (!from) return 0;
  const gs = game.ctx.gameService;
  if (ballOf(gs.getState(), player) === undefined) {
    const before = toLooseBall(game, from);
    return Number.isFinite(before) ? before - toLooseBall(game, to) : 0;
  }
  const { frame } = seatOf(gs.getSeating(), player.teamId);
  const left = toEndZone(frame, to);
  return left === 0 ? SCORES : toEndZone(frame, from) - left;
}

function declarationGain(game: HeadlessGame, player: Player): number {
  const at = player.gridPosition;
  if (!at) return 0;
  if (ballOf(game.ctx.gameService.getState(), player) !== undefined) return 2;
  return toLooseBall(game, at) <= NEAR_A_BALL ? 1 : 0;
}

function commandGain(game: HeadlessGame, command: HeadlessCommand): number {
  const gs = game.ctx.gameService;
  if (command.type === "declare-action" && command.action === "move") {
    const player = gs.getPlayerById(command.playerId);
    return player ? declarationGain(game, player) : 0;
  }
  if (command.type !== "move") return 0;
  const player = gs.getPlayerById(command.playerId);
  const to = command.path.at(-1);
  return player && to ? stepGain(game, player, to) : 0;
}

const gainOf = (game: HeadlessGame, candidate: Candidate) =>
  Math.max(...candidate.commands.map((command) => commandGain(game, command)));

export const scoringCoach: Coach = {
  name: "scoring-random",
  choose(context) {
    const { game, point, rng } = context;
    if (rng.next() >= LEAN) return randomCoach.choose(context);
    const gains = point.candidates.map((candidate) => gainOf(game, candidate));
    const best = Math.max(0, ...gains);
    if (best === 0) return randomCoach.choose(context);
    const picks = [...gains.keys()].filter((index) => gains[index] === best);
    return Promise.resolve({ index: rng.pick(picks) });
  },
};
