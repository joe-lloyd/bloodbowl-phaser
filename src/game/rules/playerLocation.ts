import { type Player, PlayerStatus } from "../../types/Player";
import { GameEventNames } from "../../types/events";
import { type IEventBus } from "../../services/EventBus";

export type PlayerBox = "pitch" | "reserves" | "ko" | "casualty" | "sent-off";

export interface PlayerDestination {
  box: PlayerBox;

  position?: { x: number; y: number };

  dead?: boolean;

  status?: typeof PlayerStatus.ACTIVE | typeof PlayerStatus.STUNNED;
}

export function playerBoxOf(player: Player): PlayerBox {
  switch (player.status) {
    case PlayerStatus.KO:
      return "ko";
    case PlayerStatus.INJURED:
    case PlayerStatus.DEAD:
      return "casualty";
    case PlayerStatus.REMOVED:
      return "sent-off";
    case PlayerStatus.RESERVE:
      return "reserves";
    default:
      return player.gridPosition ? "pitch" : "reserves";
  }
}

export function movePlayerToBox(
  player: Player,
  destination: PlayerDestination,
  eventBus?: IEventBus
): void {
  delete player.gridPosition;
  delete player.sewerPit;

  switch (destination.box) {
    case "pitch":
      if (!destination.position) {
        throw new Error(
          `movePlayerToBox(${player.id}, pitch) requires a position`
        );
      }
      player.gridPosition = { ...destination.position };
      player.status = destination.status ?? PlayerStatus.ACTIVE;
      break;
    case "reserves":
      player.status = PlayerStatus.RESERVE;
      break;
    case "ko":
      player.status = PlayerStatus.KO;
      break;
    case "casualty":
      player.status = destination.dead
        ? PlayerStatus.DEAD
        : PlayerStatus.INJURED;
      break;
    case "sent-off":
      player.status = PlayerStatus.REMOVED;
      break;
  }

  eventBus?.emit(GameEventNames.PlayerStatusChanged, player);
}

export function findPlayerLocationViolations(players: Player[]): string[] {
  const violations: string[] = [];
  const squares = new Map<string, string>();

  for (const player of players) {
    const offPitch =
      player.status === PlayerStatus.KO ||
      player.status === PlayerStatus.INJURED ||
      player.status === PlayerStatus.DEAD ||
      player.status === PlayerStatus.REMOVED ||
      player.status === PlayerStatus.RESERVE;
    if (player.gridPosition && offPitch) {
      violations.push(
        `${player.playerName ?? player.id} is ${player.status} but still holds pitch square ` +
          `(${String(player.gridPosition.x)},${String(player.gridPosition.y)})`
      );
    }
    if (!player.gridPosition) continue;
    const key = `${String(player.gridPosition.x)},${String(player.gridPosition.y)}`;
    const other = squares.get(key);
    if (other) {
      violations.push(
        `${player.playerName ?? player.id} and ${other} both occupy square (${key})`
      );
    } else {
      squares.set(key, player.playerName ?? player.id);
    }
  }

  return violations;
}

function isProductionBuild(): boolean {
  const viteEnv = (import.meta).env;
  if (viteEnv?.PROD === true) return true;
  return (
    typeof process !== "undefined" && process.env?.["NODE_ENV"] === "production"
  );
}

export function assertSinglePlayerLocation(
  players: Player[],
  where: string
): void {
  if (isProductionBuild()) return;
  const violations = findPlayerLocationViolations(players);
  if (violations.length === 0) return;
  console.error(
    `[playerLocation] invariant broken after ${where}:\n  ${violations.join("\n  ")}`
  );
}
