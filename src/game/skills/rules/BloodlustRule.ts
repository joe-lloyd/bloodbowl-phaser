/**
 * Bloodlust (X+) (2025 rulebook p.125, trait) — "Whenever this player is
 * activated, after declaring their action, they must roll a D6, adding 1 to
 * the roll if they declared a Block Action or a Blitz Action. If they roll
 * equal to or higher than the number shown in brackets, they may activate
 * as normal. If the player rolls lower ... they may continue their
 * activation as normal though they may change their declared action to a
 * Move Action if they wish. If the player declared an Action that can only
 * be performed once per Turn (such as a Blitz Action), this will still
 * count as the one Blitz action for the Turn."
 *
 * The downgrade choice is applied by ActivationGateOperation (the Blitz
 * flag was already consumed at declaration, matching the book). The
 * end-of-activation Thrall Lineman bite — turnover, Distracted, and
 * dropped ball when no Thrall is bitten — is NOT enforced: no roster
 * fields Thrall Linemen yet (see the change's design open question).
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const BloodlustRule: SkillRule = {
  onActivationDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    const instance = self.skills.find((s) => s.type === SkillType.BLOODLUST);
    const threshold = parseInt(String(instance?.parameter ?? "3"), 10) || 3;
    const angry = ctx.action === "block" || ctx.action === "blitz";
    ctx.gates.push({
      skill: SkillType.BLOODLUST,
      target: threshold,
      modifier: angry ? 1 : 0,
      onFail: { kind: "bloodlust" },
    });
  },
};
