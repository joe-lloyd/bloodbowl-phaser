import type { GameplayInteractionController } from "../GameplayInteractionController";
import type { Player } from "../../../types/Player";
import type { GameState } from "../../../types/GameState";

export function isOwnActor(c: GameplayInteractionController, player: Player | undefined, activeTeamId: string | null | undefined): player is Player {
  return player !== undefined && player.teamId === activeTeamId && c.gameService.canActivate(player.id);
}

export function activeActionFor(state: GameState, playerId: string) {
  return state.activePlayer?.id === playerId ? state.activePlayer.action : undefined;
}

export function isStandingOpponent(attacker: Player | undefined, target: Player | null): target is Player {
  return Boolean(attacker && target && target.teamId !== attacker.teamId && target.status === "Active");
}
