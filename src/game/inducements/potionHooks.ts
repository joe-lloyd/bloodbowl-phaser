import { type IEventBus } from "@/services/EventBus";
import { GameConfig, getWideZone } from "@/config/GameConfig";
import { type GameState } from "@/types/GameState";
import { type Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "@/types/events";
import { type DiceController } from "../controllers/DiceController";
import { getDriveEffects } from "../kickoff/driveEffects";
import { movePlayerToBox } from "../rules/playerLocation";
import { killPlayer } from "./potionShared";
import { hasPotionEffect } from "./variantState";

interface Square {
  x: number;
  y: number;
}

const ableToAct = (player: Player) =>
  !!player.gridPosition &&
  (player.status === PlayerStatus.ACTIVE ||
    player.status === PlayerStatus.PRONE);

export function actFirstBlocks(
  state: GameState,
  player: Player,
  teammates: readonly Player[]
): boolean {
  if (state.turn.activatedPlayerIds.size > 0 || state.activePlayer)
    return false;
  if (hasPotionEffect(state, player.id, "act-first")) return false;
  return teammates.some(
    (mate) =>
      mate.id !== player.id &&
      ableToAct(mate) &&
      hasPotionEffect(state, mate.id, "act-first")
  );
}

function inWideOrEndZone(square: Square): boolean {
  return (
    getWideZone(square.y) !== null ||
    square.x === 0 ||
    square.x === GameConfig.PITCH_WIDTH - 1
  );
}

export interface PotionHookServices {
  state: GameState;
  eventBus: IEventBus;
  carries: (player: Player) => boolean;
  dropBall: (square: Square) => void;
}

function leavePitch(
  services: PotionHookServices,
  player: Player,
  square: Square
): void {
  const carrying = services.carries(player);
  movePlayerToBox(player, { box: "reserves" }, services.eventBus);
  if (carrying) services.dropBall(square);
}

export function orcaColaBreak(
  services: PotionHookServices,
  player: Player
): boolean {
  const square = player.gridPosition;
  if (!square || player.status !== PlayerStatus.ACTIVE) return false;
  if (!hasPotionEffect(services.state, player.id, "orca-cola")) return false;
  if (!inWideOrEndZone(square)) return false;
  leavePitch(services, player, square);
  getDriveEffects(services.state).playerModifiers[player.id] = {
    ...getDriveEffects(services.state).playerModifiers[player.id],
    confinedToReserves: true,
  };
  services.eventBus.emit(
    GameEventNames.UI_GameLog,
    `Orca-Cola: ${player.playerName} heads to the concession stand for the rest of the drive`
  );
  return true;
}

export function fungusBeerCollapse(
  services: PotionHookServices,
  dice: DiceController,
  players: readonly Player[]
): Player[] {
  const drinkers = players.filter(
    (player) =>
      player.status !== PlayerStatus.DEAD &&
      hasPotionEffect(services.state, player.id, "fungus-beer")
  );
  return drinkers.filter((player) => {
    if (dice.rollD6(`Fungus Beer (${player.playerName})`, player.teamId) > 1)
      return false;
    const square = player.gridPosition;
    const carrying = services.carries(player);
    killPlayer(player, services.eventBus);
    if (square && carrying) services.dropBall(square);
    services.eventBus.emit(
      GameEventNames.UI_GameLog,
      `Fungus Beer: ${player.playerName} drops dead`
    );
    return true;
  });
}
