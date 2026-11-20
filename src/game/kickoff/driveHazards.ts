import { GameEventNames } from "../../types/events";
import { type GameState } from "@/types/GameState";
import { type Player, PlayerStatus } from "@/types/Player";
import { GameOperation } from "../core/GameOperation";
import type { FlowContext } from "../core/GameFlowManager";
import type { DiceController } from "../controllers/DiceController";
import { ArmourOperation } from "../operations/ArmourOperation";
import { bounceIfBallUnder, knockDownPlayer } from "../operations/knockDown";
import { activeLayout } from "../variants/activeMatch";
import { hasDriveCondition } from "./driveEffects";
import { nextToWall } from "./kickoffShoves";

function d16Index(
  dice: DiceController,
  size: number,
  { reason, teamId }: { reason: string; teamId?: string }
): number {
  const accepted = Math.floor(16 / size) * size;
  let roll: number;
  do {
    roll = dice.rollD16(reason, teamId);
  } while (roll > accepted);
  return (roll - 1) % size;
}

export function knockedOutBox(
  state: GameState,
  dice: DiceController,
  player: Player
): "ko" | "reserves" {
  if (!hasDriveCondition(state, "round-on-us")) return "ko";
  const roll = dice.rollD6(
    `This Round Is on Us!: D6 for ${player.playerName}, 4+ goes to the Reserves`,
    player.teamId
  );
  return roll >= 4 ? "reserves" : "ko";
}

export function ratsCanStrike(state: GameState, player: Player): boolean {
  return (
    hasDriveCondition(state, "swarm-of-rats") &&
    player.status === PlayerStatus.ACTIVE &&
    !!player.gridPosition &&
    nextToWall(activeLayout(), player.gridPosition)
  );
}

async function fallOver(
  context: FlowContext,
  player: Player,
  { reason, turnover }: { reason: string; turnover: boolean }
): Promise<void> {
  const { eventBus, flowManager, gameService } = context;
  eventBus.emit(GameEventNames.UI_Notification, `${player.playerName} falls over: ${reason}`);
  knockDownPlayer(eventBus, player);
  const carried = bounceIfBallUnder(context, player);
  await flowManager.runToRest(new ArmourOperation(player.id, undefined, undefined, "special"));
  if (turnover && carried) gameService.triggerTurnover(reason);
}

export class SwarmOfRatsOperation extends GameOperation {
  public readonly name = "SwarmOfRatsOperation";

  private playerId: string;
  constructor(playerId: string) {
    super();
    this.playerId = playerId;
  }

  async execute(context: FlowContext): Promise<void> {
    const player = context.gameService.getPlayerById(this.playerId);
    if (!player || !ratsCanStrike(context.gameService.getState(), player)) return;
    const roll = context.gameService
      .getDiceController()
      .rollD6(`Swarm of Rats: D6 for ${player.playerName}, a 1 Falls Over`, player.teamId);
    if (roll === 1) await fallOver(context, player, { reason: "Swarm of Rats", turnover: true });
  }
}

function standingOnPitch(context: FlowContext): Player[] {
  return context.gameService
    .getTeams()
    .flatMap((team) => team.players)
    .filter((player) => !!player.gridPosition && player.status === PlayerStatus.ACTIVE);
}

const STORMY_NIGHT = "A Stormy Night";
const STENCH = "Unbearable Stench";

function randomStanding(dice: DiceController, standing: Player[], weather: string): Player | undefined {
  return standing[d16Index(dice, standing.length, { reason: `${weather}: D16 picks the player` })];
}

export class WeatherTurnEndOperation extends GameOperation {
  public readonly name = "WeatherTurnEndOperation";

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus } = context;
    const weather = gameService.getState().weather;
    const dice = gameService.getDiceController();
    const standing = standingOnPitch(context);
    if (standing.length === 0) return;
    if (weather === STORMY_NIGHT) {
      if (dice.rollD6(`${STORMY_NIGHT}: D6, a 1 knocks a random player over`) !== 1) return;
      const victim = randomStanding(dice, standing, weather);
      if (victim) await fallOver(context, victim, { reason: STORMY_NIGHT, turnover: false });
      return;
    }
    if (weather !== STENCH) return;
    const victim = randomStanding(dice, standing, weather);
    if (!victim) return;
    victim.status = PlayerStatus.PRONE;
    eventBus.emit(GameEventNames.PlayerStatusChanged, victim);
    bounceIfBallUnder(context, victim);
  }
}

export function weatherActsAtTurnEnd(state: GameState): boolean {
  return state.weather === STORMY_NIGHT || state.weather === STENCH;
}

export function heatwaveCasualties(players: Player[], dice: DiceController): Player[] {
  return players.filter(
    (player) =>
      !!player.gridPosition &&
      dice.rollD6(`Underground Heatwave: D6 for ${player.playerName}, a 1 misses the next drive`, player.teamId) === 1
  );
}
