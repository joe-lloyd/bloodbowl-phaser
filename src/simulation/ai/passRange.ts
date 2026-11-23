import {
  PassController,
  type PassRange,
  type PassType,
} from "../../game/controllers/PassController";
import { rulerCrossesStall } from "../../game/rules/pitchSquares";
import type { Square } from "./board";

const PASS_TYPES = [
  "Quick Pass",
  "Short Pass",
  "Long Pass",
  "Long Bomb",
] as const satisfies readonly PassType[];

export function passRange(from: Square, to: Square): PassRange | null {
  const value = PassController.rangeValue(from, to);
  if (value === null) return null;
  return {
    type: PASS_TYPES[value],
    modifier: -value - (rulerCrossesStall(from, to) ? 1 : 0),
    minDistance: 0,
    maxDistance: 0,
  };
}
