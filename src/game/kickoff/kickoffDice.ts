import { activeRules } from "../variants/activeMatch";
import { surfaceArmourModifier } from "../rules/surfaceArmour";
import { type IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { type GameState } from "@/types/GameState";
import { type Team } from "@/types/Team";
import { type Player, PlayerStatus } from "@/types/Player";
import type { DiceController } from "../controllers/DiceController";
import type { WeatherManager } from "../managers/WeatherManager";
import type { GameFlowManager } from "../core/GameFlowManager";
import type { KickoffTableId } from "../variants/gameTypeRules";
import { ArmourOperation } from "../operations/ArmourOperation";
import { knockDownPlayer } from "../operations/knockDown";
import { type KickoffEventOutcome, grantEffect } from "./kickoffEvents";
import { type WideZone, getDriveEffects } from "./driveEffects";
import { wideZoneOf } from "./ballConditions";
import { type PitchMove, ownEndZoneStep, shoveChain } from "./kickoffShoves";
import { activeLayout } from "../variants/activeMatch";
import { inducementCount } from "../inducements/inventory";
import { Inducement } from "@/types/Inducements";

export interface KickoffEventResolverContext {
  isTeam1Kicking: boolean;
  kickingTeam: Team;
  receivingTeam: Team;
  outcome: KickoffEventOutcome;
  table: KickoffTableId;
}

export type KickoffEventResolver = (
  ctx: KickoffEventResolverContext
) => void | Promise<void>;

export interface ResolverDeps {
  eventBus: IEventBus;
  state: GameState;
  diceController: DiceController;
  weatherManager: WeatherManager;
  flowManager: GameFlowManager;
  getTurnNumber: (teamId: string) => number;
  moveTurnMarkers: (delta: number) => void;

  onWeatherScatter: (squares: number) => void;

  diceShown: () => Promise<void>;
}

export interface RollOffRule {
  label: string;

  modifierName?: string;
  modifierOf: (team: Team) => number;
  pick: "highest" | "lowest";

  stakes: string;
}

const bothTeams = (ctx: KickoffEventResolverContext): [Team, Team] => [
  ctx.kickingTeam,
  ctx.receivingTeam,
];

export const onPitch = (team: Team): Player[] =>
  team.players.filter((player) => !!player.gridPosition);

export const everyoneOnPitch = (ctx: KickoffEventResolverContext): Player[] =>
  bothTeams(ctx).flatMap((element) => onPitch(element));

async function rollTeam(
  { diceController, eventBus, diceShown }: ResolverDeps,
  { label, modifierName, modifierOf, stakes }: RollOffRule,
  team: Team
): Promise<{ team: Team; total: number }> {
  const modifier = modifierOf(team);
  const adds = modifierName && modifier > 0 ? ` + ${String(modifier)} ${modifierName}` : "";
  const roll = diceController.rollD6(`${label}: D6${adds} for ${team.name}, ${stakes}`, team.id);
  await diceShown();
  const total = roll + modifier;
  eventBus.emit(GameEventNames.UI_GameLog, `${label} — ${team.name}: D6 ${String(roll)} + ${String(modifier)} = ${String(total)}`);
  return { team, total };
}

export async function rollOff(deps: ResolverDeps, rule: RollOffRule, teams: [Team, Team]): Promise<Team[]> {
  const a = await rollTeam(deps, rule, teams[0]);
  const b = await rollTeam(deps, rule, teams[1]);
  if (a.total === b.total) return [a.team, b.team];
  const aWins = rule.pick === "highest" ? a.total > b.total : a.total < b.total;
  return [aWins ? a.team : b.team];
}

export async function randomPlayers(
  { diceController, diceShown }: ResolverDeps,
  team: Team,
  { event, count, from }: { event: string; count: number; from?: Player[] }
): Promise<Player[]> {
  const pool = [...(from ?? onPitch(team))];
  const picked: Player[] = [];
  while (picked.length < count && pool.length > 0) {
    const acceptedRange = Math.floor(16 / pool.length) * pool.length;
    let roll: number;
    do {
      roll = diceController.rollD16(
        `${event}: D16 picks which ${team.name} player`,
        team.id
      );
      await diceShown();
    } while (roll > acceptedRange);
    picked.push(...pool.splice((roll - 1) % pool.length, 1));
  }
  return picked;
}

export async function randomPitchPlayer(
  deps: ResolverDeps,
  team: Team,
  event: string
): Promise<Player | undefined> {
  const [player] = await randomPlayers(deps, team, { event, count: 1 });
  return player;
}

export function placeProneAndStunned(eventBus: IEventBus, player: Player): void {
  player.status = PlayerStatus.STUNNED;
  eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: player.id });
  eventBus.emit(GameEventNames.PlayerStatusChanged, player);
}

export function placeProne(eventBus: IEventBus, player: Player): void {
  if (player.status !== PlayerStatus.ACTIVE) return;
  player.status = PlayerStatus.PRONE;
  eventBus.emit(GameEventNames.PlayerStatusChanged, player);
}

export async function knockDownWithArmour(
  { eventBus, flowManager }: ResolverDeps,
  player: Player,
  totalModifier: number
): Promise<void> {
  if (player.status === PlayerStatus.ACTIVE) knockDownPlayer(eventBus, player);
  const surface = surfaceArmourModifier(activeRules().armour, "knocked-down");
  await flowManager.runToRest(
    new ArmourOperation(player.id, undefined, undefined, "special", totalModifier - surface)
  );
}

export function movePlayers(eventBus: IEventBus, moves: readonly PitchMove[]): void {
  for (const { player, to } of moves) {
    const from = player.gridPosition;
    if (!from) continue;
    player.gridPosition = { ...to };
    eventBus.emit(GameEventNames.PlayerMoved, {
      playerId: player.id,
      from: { ...from },
      to: { ...to },
      path: [{ ...to }],
    });
  }
}

export function grantDriveReroll(
  { state, eventBus }: ResolverDeps,
  team: Team,
  outcome: KickoffEventOutcome
): void {
  const effects = getDriveEffects(state);
  effects.freeRerolls[team.id] = (effects.freeRerolls[team.id] ?? 0) + 1;
  grantEffect(outcome, team.id, "gains a free team re-roll for this drive");
  eventBus.emit(GameEventNames.DriveEffectGranted, {
    teamId: team.id,
    effect: "free-reroll",
    detail: "one free team re-roll for this drive",
  });
}

export function noteBothTeams(
  ctx: KickoffEventResolverContext,
  effect: string
): void {
  for (const team of bothTeams(ctx)) grantEffect(ctx.outcome, team.id, effect);
}

export function cheerleadersOf(state: GameState, team: Team): number {
  return (
    team.cheerleaders +
    inducementCount(state, team.id, Inducement.TEMP_AGENCY_CHEERLEADER)
  );
}

export async function randomWideZone(
  { diceController, diceShown }: ResolverDeps,
  event: string
): Promise<WideZone> {
  const roll = diceController.rollD6(`${event}: D6 picks a Wide Zone, 1-3 top, 4-6 bottom`);
  await diceShown();
  return roll <= 3 ? "top" : "bottom";
}

export function playersInWideZone(
  ctx: KickoffEventResolverContext,
  zone: WideZone
): Player[] {
  return everyoneOnPitch(ctx).filter(
    (player) => !!player.gridPosition && wideZoneOf(player.gridPosition) === zone
  );
}

export function team1IdOf(ctx: KickoffEventResolverContext): string {
  return ctx.isTeam1Kicking ? ctx.kickingTeam.id : ctx.receivingTeam.id;
}

export function grantLoggedEffect(
  { eventBus }: ResolverDeps,
  ctx: KickoffEventResolverContext,
  { team, effect, detail }: { team: Team; effect: string; detail: string }
): void {
  grantEffect(ctx.outcome, team.id, detail);
  eventBus.emit(GameEventNames.DriveEffectGranted, { teamId: team.id, effect, detail });
}

export function shoveBack(
  { eventBus }: ResolverDeps,
  ctx: KickoffEventResolverContext,
  player: Player
): boolean {
  const from = player.gridPosition;
  if (!from) return false;
  const dx = ownEndZoneStep(player.teamId === team1IdOf(ctx));
  const start = { x: from.x + dx, y: from.y };
  const chain = shoveChain(activeLayout(), everyoneOnPitch(ctx), { start, dx });
  if (!chain) return false;
  movePlayers(eventBus, [...chain, { player, to: start }]);
  return true;
}
