import { SkillType } from "../../../types/Skills";
import { type Player } from "../../../types/Player";
import { type SkillRule } from "../SkillRule";
import { type ReactionDecisionAnswer } from "../../../types/decisions";
import { isStandableSquare } from "../../rules/pitchSquares";

function tricksterSquares(
  base: { x: number; y: number },
  allPlayers: Player[]
): { x: number; y: number }[] {
  const occupied = new Set(
    allPlayers
      .filter((p) => p.gridPosition)
      .map((p) => `${String(p.gridPosition!.x)},${String(p.gridPosition!.y)}`)
  );
  const candidates: { x: number; y: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const square = { x: base.x + dx, y: base.y + dy };
      if ((dx !== 0 || dy !== 0) && isFreeOnPitch(square, occupied)) {
        candidates.push(square);
      }
    }
  }
  candidates.sort((a, b) => a.y - b.y || a.x - b.x);
  return candidates;
}

const isFreeOnPitch = (
  square: { x: number; y: number },
  occupied: Set<string>
): boolean =>
  isStandableSquare(square) &&
  !occupied.has(`${String(square.x)},${String(square.y)}`);

export const TricksterRule: SkillRule = {
  async onBlockDeclared(ctx, self) {
    if (self.id !== ctx.defender.id || ctx.cancelled) return;
    if (!ctx.decisions || !ctx.attacker.gridPosition) return;

    const candidates = tricksterSquares(
      ctx.attacker.gridPosition,
      ctx.allPlayers
    );
    const [square] = candidates;
    if (!square) return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.TRICKSTER,
      prompt: `${self.playerName} is being blocked — use Trickster to slip to another square?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    ctx.relocateDefenderTo = square;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.TRICKSTER,
      effect: `Trickster: slips to (${String(square.x)}, ${String(square.y)}) before the dice are counted`,
    });
  },
};
