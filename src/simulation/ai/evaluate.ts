/**
 * How good a position is for one team, in the planner's points: the score
 * so far, who has the ball and how close it is, and who is still on their
 * feet. The lookahead scores its playouts with this.
 */

import { PlayerStatus } from "../../types/Player";
import { Board, carrierOf, distance, key, standing, toGoal } from "./board";
import { Weights } from "./weights";

export function evaluate(board: Board, w: Weights): number {
  const us = board.ours;
  const them = board.theirs;
  const down = (players: typeof us) =>
    players.filter((p) => p.status !== PlayerStatus.ACTIVE).length;
  const stand = (players: typeof us) => players.filter(standing);
  const missing = (team: string) =>
    (board.gs.getTeam(team)?.players ?? []).filter(
      (p) =>
        p.status === PlayerStatus.KO ||
        p.status === PlayerStatus.INJURED ||
        p.status === PlayerStatus.DEAD
    ).length;

  let value =
    board.lead * w.touchdown +
    (down(them) - down(us)) * w.knockdown +
    (missing(board.them) - missing(board.us)) * w.casualty +
    board.rerolls * w.rerollValue;

  const carrier = carrierOf(board);
  if (carrier && carrier.teamId === board.us) {
    const at = carrier.gridPosition!;
    const corners = us.filter(
      (p) =>
        standing(p) &&
        Math.abs(p.gridPosition!.x - at.x) === 1 &&
        Math.abs(p.gridPosition!.y - at.y) === 1
    ).length;
    value +=
      w.ballHeld -
      toGoal(board, at) * w.ballProgress -
      board.marks[key(at)] * w.carrierMarked +
      corners * w.cageCorner;
  } else if (carrier) {
    const at = carrier.gridPosition!;
    const markers = stand(us).filter(
      (p) => distance(p.gridPosition!, at) === 1
    );
    value +=
      -w.ballHeld +
      toGoal(board, at, board.them) * w.ballProgress +
      markers.length * w.markCarrier;
  } else if (board.ball.kind === "loose") {
    const at = board.ball.at;
    const nearest = (players: typeof us) =>
      Math.min(99, ...stand(players).map((p) => distance(p.gridPosition!, at)));
    value += (nearest(them) - nearest(us)) * w.chase * 0.25;
  }
  return value;
}
