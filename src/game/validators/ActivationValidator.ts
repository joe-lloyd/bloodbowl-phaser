import { type Player, PlayerStatus } from "../../types/Player";
import { type TurnState } from "../../types/GameState";
import { type Team } from "../../types/Team";

export class ActivationValidator {
  public canActivate(player: Player, turnState: TurnState): boolean {
    if (
      player.status !== PlayerStatus.ACTIVE &&
      player.status !== PlayerStatus.PRONE
    ) {
      return false;
    }

    if (player.teamId !== turnState.teamId) {
      return false;
    }

    if (turnState.activatedPlayerIds.has(player.id)) {
      return false;
    }

    return true;
  }

  public hasAvailablePlayers(team: Team, turnState: TurnState): boolean {
    if (team.id !== turnState.teamId) return false;

    return team.players.some((player) => {
      const onPitch = !!player.gridPosition;
      const canAct =
        player.status === PlayerStatus.ACTIVE ||
        player.status === PlayerStatus.PRONE;
      const notUsed = !turnState.activatedPlayerIds.has(player.id);

      return onPitch && canAct && notUsed;
    });
  }
}
