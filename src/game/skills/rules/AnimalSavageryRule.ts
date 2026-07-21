/**
 * Animal Savagery (2025 rulebook p.123, trait) — "Whenever this player is
 * activated, after declaring their action they must roll a D6. They may
 * apply a +2 modifier to the roll if they have declared a Block Action or a
 * Blitz Action. On a 4+, the player may perform the declared action as
 * normal. On a 1-3, this player lashes out at one of their team-mates.
 * Choose one Standing team-mate adjacent to this player; the chosen player
 * is immediately Knocked Down. This will not cause a Turnover unless [the
 * team-mate was holding the ball]."
 *
 * The lash-out (armour/injury for the victim, ball drop + turnover for a
 * carrier, activation continuing when someone was struck and ending when
 * nobody is adjacent) is applied by ActivationGateOperation. The victim is
 * picked deterministically by board order — a coach-facing choice can layer
 * on later without an engine change.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const AnimalSavageryRule: SkillRule = {
  onActivationDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    const angry = ctx.action === "block" || ctx.action === "blitz";
    ctx.gates.push({
      skill: SkillType.ANIMAL_SAVAGERY,
      target: 4,
      modifier: angry ? 2 : 0,
      onFail: { kind: "lashOut" },
    });
  },
};
