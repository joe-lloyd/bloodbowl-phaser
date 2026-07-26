/**
 * Drive-scoped effects created by kickoff events. The record lives on game
 * state (absent-means-empty for old saves) and is cleared wholesale by the
 * end-of-drive teardown, so expiry can never be forgotten per-effect.
 *
 *   - freeRerolls:      Brilliant Coaching — free team re-rolls this drive
 *   - owedAssists:      Cheering Fans — +1 Offensive Assist on the first
 *                       Block of the team's next turn (turn-scoped, not
 *                       drive-scoped: dropped when that turn ends)
 *   - playerModifiers:  Dodgy Snack — per-player MA/AV reduction, or
 *                       confinement to the Reserves for the drive
 *
 * Bribes (Get the Ref) are match-scoped instead: they live on
 * `state.bribes` alongside this record.
 */

import { GameState } from "@/types/GameState";
import { Player } from "@/types/Player";

export interface PlayerDriveModifiers {
  /** Additive MA adjustment for this drive (Dodgy Snack: -1). */
  maModifier?: number;
  /** Additive AV adjustment for this drive (Dodgy Snack: -1). */
  avModifier?: number;
  /** The player cannot be fielded again this drive (Dodgy Snack roll of 1). */
  confinedToReserves?: boolean;
}

export interface OwedOffensiveAssist {
  /** The owning team's turn number this assist applies to. */
  turn: number;
  /** The first Block of that turn consumes it. */
  used: boolean;
}

export interface DriveEffects {
  freeRerolls: Record<string, number>;
  owedAssists: Record<string, OwedOffensiveAssist>;
  playerModifiers: Record<string, PlayerDriveModifiers>;
}

export function emptyDriveEffects(): DriveEffects {
  return { freeRerolls: {}, owedAssists: {}, playerModifiers: {} };
}

export function getDriveEffects(state: GameState): DriveEffects {
  state.driveEffects ??= emptyDriveEffects();
  return state.driveEffects;
}

/** True when nothing is being tracked (used to skip expiry noise). */
export function driveEffectsEmpty(effects: DriveEffects): boolean {
  return (
    Object.keys(effects.freeRerolls).length === 0 &&
    Object.keys(effects.owedAssists).length === 0 &&
    Object.keys(effects.playerModifiers).length === 0
  );
}

export function freeRerollsFor(state: GameState, teamId: string): number {
  return getDriveEffects(state).freeRerolls[teamId] ?? 0;
}

/** Consume one free re-roll; false when none remain. */
export function consumeFreeReroll(state: GameState, teamId: string): boolean {
  const effects = getDriveEffects(state);
  if ((effects.freeRerolls[teamId] ?? 0) <= 0) return false;
  effects.freeRerolls[teamId] -= 1;
  if (effects.freeRerolls[teamId] <= 0) delete effects.freeRerolls[teamId];
  return true;
}

/**
 * The offensive-assist bonus a team's Block gets right now: +1 when an owed
 * assist matches the team's current turn number and has not been used.
 */
export function offensiveAssistBonus(
  state: GameState,
  teamId: string,
  currentTurn: number
): 0 | 1 {
  const owed = getDriveEffects(state).owedAssists[teamId];
  return owed && !owed.used && owed.turn === currentTurn ? 1 : 0;
}

/** Mark the owed assist consumed by the team's first Block of the turn. */
export function consumeOffensiveAssist(
  state: GameState,
  teamId: string,
  currentTurn: number
): void {
  const owed = getDriveEffects(state).owedAssists[teamId];
  if (owed && owed.turn === currentTurn) owed.used = true;
}

/** Effective MA after drive modifiers (floored at 0). */
export function effectiveMA(player: Player, state: GameState): number {
  const modifier =
    getDriveEffects(state).playerModifiers[player.id]?.maModifier ?? 0;
  return Math.max(0, player.stats.MA + modifier);
}

/** Effective AV after drive modifiers (floored at 2 — armor can't drop below). */
export function effectiveAV(player: Player, state: GameState): number {
  const modifier =
    getDriveEffects(state).playerModifiers[player.id]?.avModifier ?? 0;
  return Math.max(2, player.stats.AV + modifier);
}

/** Dodgy Snack: the player must stay in the Reserves for this drive. */
export function isConfinedToReserves(player: Player, state: GameState): boolean {
  return (
    getDriveEffects(state).playerModifiers[player.id]?.confinedToReserves ===
    true
  );
}

/**
 * A shallow player view with drive modifiers applied to MA (Dodgy Snack).
 * Movement code validates against this view so the -1 MA applies without
 * mutating the player's real statline. Identity when no modifier applies.
 */
export function withDriveModifiers(player: Player, state: GameState): Player {
  const modifier =
    getDriveEffects(state).playerModifiers[player.id]?.maModifier ?? 0;
  if (modifier === 0) return player;
  return {
    ...player,
    stats: {
      ...player.stats,
      MA: Math.max(0, player.stats.MA + modifier),
    },
  };
}
