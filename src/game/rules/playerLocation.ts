import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { Player, PlayerStatus } from "../../types/Player";
import { DugoutBox } from "../presentation/boardState";

const BOX_STATUS: Record<DugoutBox, PlayerStatus> = {
  reserves: PlayerStatus.RESERVE,
  ko: PlayerStatus.KO,
  casualty: PlayerStatus.INJURED,
  "sent-off": PlayerStatus.REMOVED,
};

/**
 * MERGE SEAM — the single mutation that moves a player off the pitch into a
 * dugout box.
 *
 * It is deliberately the only place that performs the three-part transition
 * (status, pitch occupancy, announcement) so it cannot half-happen: a player
 * whose status says "Knocked Out" must not still occupy a square, and the
 * board must be told in the same breath.
 *
 * Pairs with `resolvePlayerLocation` (presentation/boardState), which owns the
 * read side of "where is this player represented".
 *
 * Idempotent: calling it again for a player already in the box is a no-op
 * apart from re-announcing the (unchanged) state.
 */
export function movePlayerToDugoutBox(
  eventBus: IEventBus,
  player: Player,
  box: DugoutBox
): void {
  player.status = BOX_STATUS[box];
  player.gridPosition = undefined;
  eventBus.emit(GameEventNames.PlayerStatusChanged, player);
}
