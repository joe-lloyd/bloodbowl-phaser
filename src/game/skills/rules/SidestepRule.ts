/**
 * Sidestep (2025 rulebook p.135) — "Whenever this player is Pushed Back for
 * any reason, then instead of the opposing Coach choosing where this player
 * is Pushed Back to, this player's Coach may choose any adjacent unoccupied
 * square for this player to be Pushed Back into instead. If there are no
 * adjacent unoccupied squares, then this Skill cannot be used."
 *
 * Grab (p.129) cancels it: "when this player performs a Block Action,
 * opposition players cannot use the Sidestep Skill." Accepting transfers
 * the push-square choice to the pushed player's coach; the push machinery
 * falls back to the normal push when no adjacent square is unoccupied.
 */

import { SkillType, hasSkill } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";
import { ReactionDecisionAnswer } from "../../../types/decisions";

export const SidestepRule: SkillRule = {
  async onPush(ctx, self) {
    if (self.id !== ctx.pushed.id) return;
    if (ctx.refused || ctx.sideStepPush) return;
    if (hasSkill(ctx.attacker.skills, SkillType.GRAB)) return;
    if (!ctx.decisions) return;

    const answer = (await ctx.decisions.request({
      type: "reaction",
      playerId: self.id,
      chooserTeamId: self.teamId,
      skill: SkillType.SIDESTEP,
      prompt: `${self.playerName} is being pushed back — use Sidestep to pick the square?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    ctx.sideStepPush = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.SIDESTEP,
      effect: "Sidestep: the pushed player's coach picks the square",
    });
  },
};
