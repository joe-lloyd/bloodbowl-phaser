/**
 * Bribes (2025 rulebook p.148): when a player is Sent-off, after any
 * attempt to Argue the Call, the coach may use a Bribe. Roll a D6: on a 2+
 * the player is not Sent-off and no Turnover is caused; on a natural 1 the
 * Bribe is lost and the player is Sent-off anyway.
 *
 * A team's Bribes are the free ones from Get the Ref (`state.bribes`,
 * spent first because they are lost at full time anyway) plus the ones it
 * bought. The coach is asked through a yes/no reaction decision with the
 * skill name "Bribe", so every surface that answers reactions answers it.
 */

import { IEventBus } from "../../services/EventBus";
import { IGameService } from "../../services/interfaces/IGameService";
import { GameEventNames } from "../../types/events";
import { GameState } from "../../types/GameState";
import { Inducement } from "../../types/Inducements";
import { Player } from "../../types/Player";
import { inducementUsesLeft, spendInducement } from "./inventory";

export const BRIBE_DECISION = "Bribe";

export function bribesLeft(state: GameState, teamId: string): number {
  return (
    (state.bribes?.[teamId] ?? 0) +
    inducementUsesLeft(state, teamId, Inducement.BRIBE)
  );
}

function spendBribe(state: GameState, teamId: string): void {
  const free = state.bribes?.[teamId] ?? 0;
  if (state.bribes && free > 0) {
    state.bribes[teamId] = free - 1;
    return;
  }
  spendInducement(state, teamId, Inducement.BRIBE);
}

/**
 * Offer a Bribe for a player about to be Sent-off. Returns true when the
 * Bribe works and the player stays; false when no Bribe is held, the coach
 * declines, or the referee pockets it.
 */
export async function offerBribe(
  gameService: IGameService,
  eventBus: IEventBus,
  player: Player
): Promise<boolean> {
  const state = gameService.getState();
  const held = bribesLeft(state, player.teamId);
  if (held <= 0) return false;

  const answer = await gameService.getDecisionService().request({
    type: "reaction",
    playerId: player.id,
    chooserTeamId: player.teamId,
    skill: BRIBE_DECISION,
    prompt: `${player.playerName} is being Sent-off. Use a Bribe (${held} left)? A 2+ keeps them on the pitch.`,
  });
  if (!("accept" in answer) || !answer.accept) return false;

  spendBribe(state, player.teamId);
  const roll = gameService
    .getDiceController()
    .rollD6(`Bribe (${player.playerName})`, player.teamId);
  const works = roll >= 2;
  eventBus.emit(
    GameEventNames.UI_Notification,
    works
      ? `Bribe accepted (${roll}): ${player.playerName} stays on the pitch.`
      : `The referee pockets the Bribe (${roll}): ${player.playerName} is Sent-off anyway.`
  );
  return works;
}
