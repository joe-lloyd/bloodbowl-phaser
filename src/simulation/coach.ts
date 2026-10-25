import { HeadlessGame } from "../headless/HeadlessGame";
import { GameSnapshot } from "../headless/serialization";
import { DecisionPoint } from "./candidates";
import { CoachRng } from "./rng";

export interface CoachContext {
  game: HeadlessGame;
  snapshot: GameSnapshot;
  point: DecisionPoint;
  rng: CoachRng;
}

export interface CoachChoice {
  /** Index into `point.candidates`. */
  index: number;
  /** Why, when the coach can say; written to the recording. */
  note?: string;
}

/** Picks one of the engine-derived candidates. Never builds a command. */
export interface Coach {
  readonly name: string;
  choose(context: CoachContext): Promise<CoachChoice>;
}
