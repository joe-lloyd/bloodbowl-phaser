import { type GameState } from "@/types/GameState";
import { type Player } from "@/types/Player";
import { getMatchInducements, type MatchGrant } from "./matchInducements";

export const SOUVENIRS = [
  "Sports Sandals",
  "Suntan Lotion",
  "Thong",
  "Sunglasses",
  "Bottle",
  "Puka Shell Necklace",
  "Sticky Bun",
  "Gatorcade",
] as const;
export type Souvenir = (typeof SOUVENIRS)[number];

export type PotionEffect =
  | "act-first"
  | "orca-cola"
  | "fungus-beer"
  | "endurance";

export interface PotionEffectRecord {
  playerId: string;
  effect: PotionEffect;
}

export interface HeldSouvenir {
  teamId: string;
  souvenir: Souvenir;
  playerId?: string;
}

export interface VariantInducementsState {
  effects: PotionEffectRecord[];
  dosedPlayerIds: string[];
  souvenirs: HeldSouvenir[];
  souvenirsRolled: boolean;
  halfGrants: MatchGrant[];
}

export function getVariantInducements(
  state: GameState
): VariantInducementsState {
  const mi = getMatchInducements(state);
  mi.variant ??= {
    effects: [],
    dosedPlayerIds: [],
    souvenirs: [],
    souvenirsRolled: false,
    halfGrants: [],
  };
  return mi.variant;
}

export function hasPotionEffect(
  state: GameState,
  playerId: string,
  effect: PotionEffect
): boolean {
  return (
    state.matchInducements?.variant?.effects.some(
      (record) => record.playerId === playerId && record.effect === effect
    ) ?? false
  );
}

export function addPotionEffect(
  state: GameState,
  playerId: string,
  effect: PotionEffect
): void {
  if (hasPotionEffect(state, playerId, effect)) return;
  getVariantInducements(state).effects.push({ playerId, effect });
}

export function removePotionEffect(
  state: GameState,
  playerId: string,
  effect: PotionEffect
): boolean {
  const variant = state.matchInducements?.variant;
  if (!variant || !hasPotionEffect(state, playerId, effect)) return false;
  variant.effects = variant.effects.filter(
    (record) => record.playerId !== playerId || record.effect !== effect
  );
  return true;
}

export function playersWithEffect(
  state: GameState,
  players: Player[],
  effect: PotionEffect
): Player[] {
  return players.filter((player) => hasPotionEffect(state, player.id, effect));
}

export function souvenirsCarried(
  state: GameState,
  playerId: string
): Souvenir[] {
  return (state.matchInducements?.variant?.souvenirs ?? [])
    .filter((held) => held.playerId === playerId)
    .map((held) => held.souvenir);
}
