import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import {
  DEFAULT_SEVENS_RULESET,
  NAF_SEVENS_RULESET,
  type SevensRuleset,
} from "./sevensRuleset";

export function isInsignificant(player: Player): boolean {
  return hasSkill(player.skills, SkillType.INSIGNIFICANT);
}

export function countInsignificant(players: Player[]): number {
  return players.filter((player) => isInsignificant(player)).length;
}

export function insignificantLimitOk(players: Player[]): boolean {
  const insignificant = countInsignificant(players);
  const significant = players.length - insignificant;
  return insignificant <= significant;
}

export function validateInsignificant(
  players: Player[],
  ruleset: SevensRuleset = DEFAULT_SEVENS_RULESET
): string | null {
  if (ruleset === NAF_SEVENS_RULESET) return null;
  if (insignificantLimitOk(players)) return null;
  const insignificant = countInsignificant(players);
  const significant = players.length - insignificant;
  return (
    `Too many Insignificant players: ${String(insignificant)} with the trait vs ` +
    `${String(significant)} without. A Team Draft List may not include more ` +
    `Insignificant players than players without the trait.`
  );
}
