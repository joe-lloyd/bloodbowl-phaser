/**
 * Trickster (2025 rulebook p.138, trait) — "Whenever an opposition player
 * attempts to perform a Block Action against this player ... before
 * determining how many dice are rolled, this player may be removed from the
 * pitch and placed in any other unoccupied square adjacent to the player
 * performing the Action. The Action then takes place as normal."
 *
 * The reacting coach accepts via the decision channel; the landing square
 * is picked deterministically (first unoccupied square adjacent to the
 * attacker in board order) — a coach-facing square choice can layer on
 * later. BlockManager applies the relocation and re-runs the assist
 * analysis from the new square, so the dice count reflects it (a
 * simultaneous strength-modifying rule on the same block would be
 * recomputed too — an accepted, vanishingly rare overlap). The Ball & Chain
 * exception and the pick-up-the-ball clause land with their subsystems.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";
import { ReactionDecisionAnswer } from "../../../types/decisions";
import { GameConfig } from "../../../config/GameConfig";

export const TricksterRule: SkillRule = {
  async onBlockDeclared(ctx, self) {
    if (self.id !== ctx.defender.id || ctx.cancelled) return;
    if (!ctx.decisions || !ctx.attacker.gridPosition) return;

    const occupied = new Set(
      ctx.allPlayers
        .filter((p) => p.gridPosition)
        .map((p) => `${p.gridPosition!.x},${p.gridPosition!.y}`)
    );
    const base = ctx.attacker.gridPosition;
    const candidates: { x: number; y: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const square = { x: base.x + dx, y: base.y + dy };
        if (
          square.x < 0 ||
          square.y < 0 ||
          square.x >= GameConfig.PITCH_WIDTH ||
          square.y >= GameConfig.PITCH_HEIGHT
        ) {
          continue;
        }
        if (occupied.has(`${square.x},${square.y}`)) continue;
        candidates.push(square);
      }
    }
    // Board order, matching every other deterministic gather
    candidates.sort((a, b) => a.y - b.y || a.x - b.x);
    if (candidates.length === 0) return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.TRICKSTER,
      prompt: `${self.playerName} is being blocked — use Trickster to slip to another square?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    ctx.relocateDefenderTo = candidates[0];
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.TRICKSTER,
      effect: `Trickster: slips to (${candidates[0].x}, ${candidates[0].y}) before the dice are counted`,
    });
  },
};
