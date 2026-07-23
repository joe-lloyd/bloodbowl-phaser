import { SkillType } from "../../../types/Skills";
import { PlayerStatus } from "../../../types/Player";
import { BlockResultContext, SkillRule } from "../SkillRule";

export const SaboteurRule: SkillRule = {
  onBlockResult(ctx: BlockResultContext, self) {
    if (self.id !== ctx.defender.id || !ctx.defenderKnockedDown || !ctx.dice) {
      return;
    }
    const roll = ctx.dice.rollD6(`Saboteur (${self.playerName})`);
    if (roll < 4) return;
    self.status = PlayerStatus.KO;
    self.gridPosition = undefined;
    ctx.defenderKnockedDown = false;
    ctx.attackerKnockedDown = true;
    ctx.saboteurExploded = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.SABOTEUR,
      effect:
        "Saboteur: weapon explodes, Knocking Down the blocker and KO'ing the Saboteur",
    });
  },
};
