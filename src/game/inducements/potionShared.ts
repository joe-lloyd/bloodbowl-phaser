import { type IEventBus } from "@/services/EventBus";
import { type GameState } from "@/types/GameState";
import {
  InjuryType,
  type Player,
  type PlayerStats,
  PlayerStatus,
} from "@/types/Player";
import { type SkillType } from "@/types/Skills";
import { GameEventNames } from "@/types/events";
import { movePlayerToBox } from "../rules/playerLocation";
import { grantSkill, grantStat } from "./matchInducements";

export type StatChange = readonly [keyof PlayerStats, number];

function healLastCasualty(player: Player): void {
  const index = Math.max(
    player.injuries.lastIndexOf(InjuryType.BADLY_HURT),
    player.injuries.lastIndexOf(InjuryType.MISS_NEXT_GAME)
  );
  if (index >= 0) player.injuries.splice(index, 1);
}

export function returnToPlay(player: Player, eventBus: IEventBus): void {
  if (
    player.status !== PlayerStatus.KO &&
    player.status !== PlayerStatus.INJURED
  )
    return;
  if (player.status === PlayerStatus.INJURED) healLastCasualty(player);
  movePlayerToBox(player, { box: "reserves" }, eventBus);
}

export function killPlayer(player: Player, eventBus: IEventBus): void {
  if (player.status === PlayerStatus.INJURED) healLastCasualty(player);
  player.injuries.push(InjuryType.DEAD);
  movePlayerToBox(player, { box: "casualty", dead: true }, eventBus);
}

export function grantSkills(
  state: GameState,
  player: Player,
  skills: readonly SkillType[]
): void {
  for (const skill of skills) grantSkill(state, player, skill);
}

export function grantStats(
  state: GameState,
  player: Player,
  changes: readonly StatChange[]
): void {
  for (const [stat, delta] of changes) grantStat(state, player, stat, delta);
}

export function logPotion(eventBus: IEventBus, text: string): void {
  eventBus.emit(GameEventNames.UI_GameLog, text);
}
