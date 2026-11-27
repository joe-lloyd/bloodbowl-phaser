import type { GameState } from "@/types/GameState";
import type { PassType } from "../controllers/PassController";
import {
  catchWeather,
  pickUpWeather,
  weatherEffects,
} from "../rules/weather";
import { activeLayout } from "../variants/activeMatch";
import type { Square } from "../variants/pitchLayouts";
import { wideZoneOf } from "../rules/frames";
import { type WideZone, WIDE_ZONES, hasDriveCondition } from "./driveEffects";

export type LostBall = "conch" | "beach-ball";

const LOST_BALL_HANDLING: Record<LostBall, number> = {
  conch: -1,
  "beach-ball": 1,
};

const SEAGULL_PENALTY: Record<PassType, number> = {
  "Quick Pass": -1,
  "Short Pass": -1,
  "Long Pass": -2,
  "Long Bomb": -2,
};

export function lostBallHandling(state: GameState): number {
  return state.lostBall ? LOST_BALL_HANDLING[state.lostBall] : 0;
}

export function pickUpModifier(state: GameState): number {
  const sludge = hasDriveCondition(state, "sticky-sludge") ? 1 : 0;
  return pickUpWeather(state.weather) + lostBallHandling(state) + sludge;
}

export function catchModifier(state: GameState): number {
  return catchWeather(state.weather) + lostBallHandling(state);
}

export function passModifier(state: GameState, passType: PassType): number {
  const seagulls = hasDriveCondition(state, "seagulls")
    ? SEAGULL_PENALTY[passType]
    : 0;
  const beachBall = state.lostBall === "beach-ball" ? -1 : 0;
  return weatherEffects(state.weather).passingAbility + seagulls + beachBall;
}

export function carrierMayPass(state: GameState): boolean {
  return !hasDriveCondition(state, "sticky-sludge");
}

export function teamRerollBarred(
  state: GameState,
  roll: "pickup" | "block" | "other"
): boolean {
  return roll !== "other" && hasDriveCondition(state, "loose-dogs");
}

export function namedWideZone(square: Square): WideZone | null {
  const zone = wideZoneOf(activeLayout().frames[0], square);
  return zone === null ? null : WIDE_ZONES[zone];
}

export function kickLandsAsTouchback(
  state: GameState,
  landing: Square
): boolean {
  const flooded = state.driveEffects?.floodedZone;
  return (
    weatherEffects(state.weather).kickoffTouchback ||
    (flooded !== undefined && namedWideZone(landing) === flooded)
  );
}
