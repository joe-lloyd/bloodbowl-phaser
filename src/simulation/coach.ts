import { HeadlessGame } from "../headless/HeadlessGame";
import { type GameSnapshot } from "../headless/serialization";
import { type DecisionPoint } from "./candidates";
import { type CoachRng } from "./rng";

export interface CoachContext {
  game: HeadlessGame;
  snapshot: GameSnapshot;
  point: DecisionPoint;
  rng: CoachRng;
}

export interface CoachChoice {
  index: number;

  note?: string;
}

export interface Coach {
  readonly name: string;
  choose(context: CoachContext): Promise<CoachChoice>;
}
