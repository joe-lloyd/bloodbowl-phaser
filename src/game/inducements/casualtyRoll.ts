import { type DiceController } from "../controllers/DiceController";
import {
  type CasualtyType,
  InjuryResult,
} from "../controllers/InjuryController";

function casualtyForRoll(roll: number): CasualtyType {
  if (roll <= 8) return InjuryResult.BADLY_HURT;
  if (roll <= 14) return InjuryResult.SERIOUSLY_HURT;
  return InjuryResult.DEAD;
}

export function rollCasualty(
  dice: DiceController,
  label: string,
  teamId: string
): CasualtyType {
  return casualtyForRoll(dice.rollD16(label, teamId));
}
