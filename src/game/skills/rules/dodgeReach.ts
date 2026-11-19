import { type Player } from "../../../types/Player";
import { withinOneSquare } from "../../controllers/interaction/squares";

interface Square {
  x: number;
  y: number;
}

export function opponentWithinReach(
  ctx: { player: Player; from: Square },
  self: Player
): boolean {
  return (
    self.teamId !== ctx.player.teamId &&
    withinOneSquare(self.gridPosition, ctx.from)
  );
}
