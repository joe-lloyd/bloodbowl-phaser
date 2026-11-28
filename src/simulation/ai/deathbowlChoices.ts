import type { AssistSide } from "../../types/decisions";
import type { Candidate } from "../candidates";
import { type Board, pitchCentre } from "./board";
import { type PendingOf, best, first } from "./decisionPicks";

const pointsOf = (board: Board, team: string): number =>
  board.gs.getState().points?.[team] ?? 0;

function leaders(board: Board): ReadonlySet<string> {
  const tally = [board.us, ...board.rivals.map(({ team }) => team.id)].map(
    (team) => ({ team, points: pointsOf(board, team) })
  );
  const top = Math.max(...tally.map(({ points }) => points));
  const bottom = Math.min(...tally.map(({ points }) => points));
  if (top === bottom) return new Set();
  return new Set(tally.filter(({ points }) => points === top).map(({ team }) => team));
}

function sideToLend(
  board: Board,
  pending: PendingOf<"cross-assist">
): AssistSide | null {
  const attacker = board.gs.getPlayerById(pending.attackerId)?.teamId;
  const defender = board.gs.getPlayerById(pending.defenderId)?.teamId;
  if (attacker === undefined || defender === undefined) return null;
  const side: AssistSide =
    pointsOf(board, defender) > pointsOf(board, attacker) ? "attacker" : "defender";
  const helped = side === "attacker" ? attacker : defender;
  return leaders(board).has(helped) ? null : side;
}

function lendsTo(candidate: Candidate): AssistSide | null {
  const command = candidate.commands[0];
  if (command.type !== "lend-assists") return null;
  if (command.toAttacker.length > 0) return "attacker";
  return command.toDefender.length > 0 ? "defender" : null;
}

export function crossAssistChoice(
  board: Board,
  pending: PendingOf<"cross-assist">,
  candidates: readonly Candidate[]
): number | null {
  const side = sideToLend(board, pending);
  const lend = side === null ? null : first(candidates, (c) => lendsTo(c) === side);
  return lend ?? first(candidates, (c) => c.commands[0].type === "lend-assists" && lendsTo(c) === null);
}

export function reserveChoice(
  board: Board,
  pending: PendingOf<"reserve-move">,
  candidates: readonly Candidate[]
): number | null {
  const centre = pitchCentre();
  const strength = new Map(
    pending.playerIds.map((id) => [id, board.gs.getPlayerById(id)?.stats.ST ?? 0])
  );
  return best(candidates, (c) => {
    const command = c.commands[0];
    if (command.type !== "move-reserve") return;
    const away = Math.hypot(command.x - centre.x, command.y - centre.y);
    return (strength.get(command.playerId) ?? 0) * 100 - away;
  });
}
