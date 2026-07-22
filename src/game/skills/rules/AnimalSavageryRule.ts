/**
 * ANIMAL SAVAGERY*(PASSIVE)
 * Whenever this player is activated, after declaring their action 
 * they must roll a D6. They may apply a +2 modifier to the roll if 
 * they have declared a Block Action or a Blitz Action. On a 4+, the 
 * player may perform the declared action as normal.
 * 
 * On a 1-3, this player lashes out at one of their team-mates. Choose 
 * one Standing team-mate adjacent to this player; the chosen player is
 * immediately Knocked Down. This will not cause a Turnover unless the 
 * player was holding the ball. If this player has either the Claws or 
 * Mighty Blow Skill, then they must use them when making the Armour 
 * Roll for the Knocked Down player.
 * 
 * If this player rolls a 1-3 and there are no Standing team-mates 
 * adjacent to them, then they are Distracted.
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
