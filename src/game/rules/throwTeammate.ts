import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { PassController } from "../controllers/PassController";
import { GameConfig } from "../../config/GameConfig";
import { obstacleKindAt } from "./pitchSquares";

export function isRightStuffEligible(player: Player): boolean {
  return hasSkill(player.skills, SkillType.RIGHT_STUFF) && player.stats.ST <= 3;
}

export function isThrowTeammateInRange(
  from: { x: number; y: number },
  to: { x: number; y: number }
): boolean {
  if (obstacleKindAt(to) === "market-stall") return false;
  const value = PassController.rangeValue(from, to);
  return value === 0 || value === 1;
}

export function throwTeammateAims(from: {
  x: number;
  y: number;
}): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let x = 0; x < GameConfig.PITCH_WIDTH; x++)
    for (let y = 0; y < GameConfig.PITCH_HEIGHT; y++)
      if (
        (x !== from.x || y !== from.y) &&
        isThrowTeammateInRange(from, { x, y })
      )
        out.push({ x, y });
  return out;
}

export const SWOOP_FACINGS = ["north", "east", "south", "west"] as const;
export type SwoopFacing = (typeof SWOOP_FACINGS)[number];

export function isSwoopFacing(value: unknown): value is SwoopFacing {
  return SWOOP_FACINGS.some((facing) => facing === value);
}
