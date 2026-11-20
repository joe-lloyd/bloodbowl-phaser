import { type GameState } from "@/types/GameState";
import { type Player } from "@/types/Player";

export interface PlayerDriveModifiers {
  maModifier?: number;

  avModifier?: number;

  confinedToReserves?: boolean;

  missesTurn?: number;
}

export interface OwedOffensiveAssist {
  turn: number;

  used: boolean;
}

export type DriveCondition =
  | "seagulls"
  | "loose-dogs"
  | "sticky-sludge"
  | "swarm-of-rats"
  | "round-on-us";

export type WideZone = "top" | "bottom";

export interface DriveEffects {
  freeRerolls: Record<string, number>;
  owedAssists: Record<string, OwedOffensiveAssist>;
  playerModifiers: Record<string, PlayerDriveModifiers>;
  conditions?: DriveCondition[];
  floodedZone?: WideZone;
}

export function emptyDriveEffects(): DriveEffects {
  return { freeRerolls: {}, owedAssists: {}, playerModifiers: {} };
}

export function getDriveEffects(state: GameState): DriveEffects {
  state.driveEffects ??= emptyDriveEffects();
  return state.driveEffects;
}

export function driveEffectsEmpty(effects: DriveEffects): boolean {
  return (
    Object.keys(effects.freeRerolls).length === 0 &&
    Object.keys(effects.owedAssists).length === 0 &&
    Object.keys(effects.playerModifiers).length === 0 &&
    (effects.conditions ?? []).length === 0 &&
    effects.floodedZone === undefined
  );
}

export function addDriveCondition(
  state: GameState,
  condition: DriveCondition
): void {
  const effects = getDriveEffects(state);
  effects.conditions = [
    ...(effects.conditions ?? []).filter((held) => held !== condition),
    condition,
  ];
}

export function hasDriveCondition(
  state: GameState,
  condition: DriveCondition
): boolean {
  return state.driveEffects?.conditions?.includes(condition) === true;
}

export function missesThisTurn(
  player: Player,
  state: GameState,
  turnNumber: number
): boolean {
  return (
    state.driveEffects?.playerModifiers[player.id]?.missesTurn === turnNumber
  );
}

export function freeRerollsFor(state: GameState, teamId: string): number {
  return getDriveEffects(state).freeRerolls[teamId] ?? 0;
}

export function consumeFreeReroll(state: GameState, teamId: string): boolean {
  const effects = getDriveEffects(state);
  const remaining = effects.freeRerolls[teamId] ?? 0;
  if (remaining <= 0) return false;
  const next = remaining - 1;
  if (next <= 0) Reflect.deleteProperty(effects.freeRerolls, teamId);
  else effects.freeRerolls[teamId] = next;
  return true;
}

export function offensiveAssistBonus(
  state: GameState,
  teamId: string,
  currentTurn: number
): 0 | 1 {
  const owed = getDriveEffects(state).owedAssists[teamId];
  return owed && !owed.used && owed.turn === currentTurn ? 1 : 0;
}

export function consumeOffensiveAssist(
  state: GameState,
  teamId: string,
  currentTurn: number
): void {
  const owed = getDriveEffects(state).owedAssists[teamId];
  if (owed?.turn === currentTurn) owed.used = true;
}

export function effectiveMA(player: Player, state: GameState): number {
  const modifier =
    getDriveEffects(state).playerModifiers[player.id]?.maModifier ?? 0;
  return Math.max(0, player.stats.MA + modifier);
}

export function effectiveAV(player: Player, state: GameState): number {
  const modifier =
    getDriveEffects(state).playerModifiers[player.id]?.avModifier ?? 0;
  return Math.max(2, player.stats.AV + modifier);
}

export function isConfinedToReserves(
  player: Player,
  state: GameState
): boolean {
  return (
    getDriveEffects(state).playerModifiers[player.id]?.confinedToReserves ===
    true
  );
}

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
