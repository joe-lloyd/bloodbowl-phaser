import { type IEventBus } from "../../services/EventBus";
import { type IGameService } from "../../services/interfaces/IGameService";
import { GameEventNames } from "../../types/events";
import { type GameState } from "../../types/GameState";
import { Inducement } from "../../types/Inducements";
import { type Player } from "../../types/Player";
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

export async function offerBribe(
  gameService: IGameService,
  eventBus: IEventBus,
  player: Player
): Promise<{ roll: number; works: boolean } | null> {
  const state = gameService.getState();
  const held = bribesLeft(state, player.teamId);
  if (held <= 0) return null;

  const answer = await gameService.getDecisionService().request({
    type: "reaction",
    playerId: player.id,
    chooserTeamId: player.teamId,
    skill: BRIBE_DECISION,
    prompt: `${player.playerName} is being Sent-off. Use a Bribe (${String(held)} left)? A 2+ keeps them on the pitch.`,
  });
  if (!("accept" in answer) || !answer.accept) return null;

  spendBribe(state, player.teamId);
  const roll = gameService
    .getDiceController()
    .rollD6(`Bribe (${player.playerName})`, player.teamId);
  const works = roll >= 2;
  eventBus.emit(
    GameEventNames.UI_Notification,
    works
      ? `Bribe accepted (${String(roll)}): ${player.playerName} stays on the pitch.`
      : `The referee pockets the Bribe (${String(roll)}): ${player.playerName} is Sent-off anyway.`
  );
  return { roll, works };
}
