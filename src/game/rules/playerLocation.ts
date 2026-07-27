/**
 * Player location — THE single seam through which a player's location changes.
 *
 * A player is one record in one place. Every transition between the pitch and
 * the Reserves / Knocked Out / Casualty / sent-off boxes goes through
 * `movePlayerToBox`, which clears the player's previous representation before
 * creating the new one. Two paths each creating a representation without the
 * other removing one is exactly how a recovered player ended up on the pitch
 * AND in the KO box at the same time; with one seam that class of bug cannot
 * happen rather than being fixed one instance at a time.
 *
 * Dependency-free by design: the engine, the headless protocol and the Phaser
 * scene all read box membership from `playerBoxOf`, so no view can render a
 * player into a box the record does not put them in.
 */

import { Player, PlayerStatus } from "../../types/Player";
import { GameEventNames } from "../../types/events";
import { IEventBus } from "../../services/EventBus";

/** The five places a player's record can be. */
export type PlayerBox = "pitch" | "reserves" | "ko" | "casualty" | "sent-off";

export interface PlayerDestination {
  box: PlayerBox;
  /** Required for `pitch`, ignored everywhere else. */
  position?: { x: number; y: number };
  /** `casualty` only: Dead rather than Injured. */
  dead?: boolean;
}

/**
 * Where this player's record currently puts them. A player on the pitch is
 * on the pitch whatever their standing (Active / Prone / Stunned); everyone
 * else is placed by status. Total by construction — every player is in
 * exactly one box.
 *
 * Status beats a stale `gridPosition`: if some path set a player KO without
 * clearing their square, they belong to the KO box and their pitch sprite
 * goes. That direction fails safe (the player is shown once, in the box the
 * rules put them in); the other direction would draw them on the pitch AND
 * leave the box empty. `findPlayerLocationViolations` reports the stale
 * square either way, so the bug is still surfaced rather than hidden.
 */
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

/**
 * Move a player to a box. THE single place a player's location changes.
 *
 * Clears the old representation (the pitch square) before creating the new
 * one, then sets the status that box implies. Pass the event bus to announce
 * the move so views rebuild; omit it when the caller already emits its own
 * location event (setup placement emits PlayerPlaced/PlayerRemoved).
 */
export function movePlayerToBox(
  player: Player,
  destination: PlayerDestination,
  eventBus?: IEventBus
): void {
  // Leave wherever you were before you arrive anywhere.
  player.gridPosition = undefined;

  switch (destination.box) {
    case "pitch":
      if (!destination.position) {
        throw new Error(
          `movePlayerToBox(${player.id}, pitch) requires a position`
        );
      }
      player.gridPosition = { ...destination.position };
      player.status = PlayerStatus.ACTIVE;
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

/**
 * Invariant: every player appears exactly once across the pitch and the
 * dugout boxes. Box membership is total by construction, so what is left to
 * check is that no record straddles two boxes (an off-pitch status still
 * holding a pitch square) and that no two players claim the same square.
 *
 * Returns a list of human-readable violations; empty means the board is sound.
 */
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
          `(${player.gridPosition.x},${player.gridPosition.y})`
      );
    }
    if (!player.gridPosition) continue;
    const key = `${player.gridPosition.x},${player.gridPosition.y}`;
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

/** True in a production bundle (Vite) or a production Node run. */
function isProductionBuild(): boolean {
  const viteEnv = (import.meta as { env?: { PROD?: boolean } }).env;
  if (viteEnv?.PROD === true) return true;
  return (
    typeof process !== "undefined" && process.env?.NODE_ENV === "production"
  );
}

/**
 * Dev-only assertion. Logs loudly rather than throwing — a location bug must
 * be visible in the console during development without killing a live match.
 */
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
