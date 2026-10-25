import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { GameEventNames } from "../../types/events";
import { ReactionDecisionAnswer } from "../../types/decisions";
import { FoulOperation } from "./FoulOperation";

/**
 * Pile Driver (2025 rulebook p.133): "When an opposition player is Knocked
 * Down by this player during a Block Action, this player may perform a free
 * Foul Action against the opposition player so long as they are still
 * Standing and are still Marking the opposition player. This player is then
 * Placed Prone and their activation immediately ends."
 *
 * Runs once the Block has fully resolved. The coach chooses; on a decline,
 * or when the Foul is no longer possible, `resume` carries on with the
 * activation (a Blitz may keep moving).
 */
export class PileDriverOperation extends GameOperation {
  public readonly name = "PileDriverOperation";

  constructor(
    private attackerId: string,
    private defenderId: string,
    private resume: () => void
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const attacker = context.gameService.getPlayerById(this.attackerId);
    const defender = context.gameService.getPlayerById(this.defenderId);
    if (
      !attacker?.gridPosition ||
      attacker.status !== PlayerStatus.ACTIVE ||
      !defender?.gridPosition ||
      (defender.status !== PlayerStatus.PRONE &&
        defender.status !== PlayerStatus.STUNNED)
    ) {
      this.resume();
      return;
    }
    const adjacent =
      Math.max(
        Math.abs(attacker.gridPosition.x - defender.gridPosition.x),
        Math.abs(attacker.gridPosition.y - defender.gridPosition.y)
      ) === 1;
    if (!adjacent) {
      this.resume();
      return;
    }

    const answer = (await context.gameService.getDecisionService().request({
      type: "reaction",
      playerId: attacker.id,
      chooserTeamId: attacker.teamId,
      skill: SkillType.PILE_DRIVER,
      prompt: `${attacker.playerName} may make a free Foul on ${defender.playerName}, then is Placed Prone — use Pile Driver?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) {
      this.resume();
      return;
    }

    context.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attacker.id,
      skill: SkillType.PILE_DRIVER,
      effect: "Pile Driver: performs a free Foul, then is Placed Prone",
    });
    await new FoulOperation(
      attacker.id,
      defender.gridPosition.x,
      defender.gridPosition.y
    ).execute(context);

    if (attacker.status === PlayerStatus.ACTIVE) {
      attacker.status = PlayerStatus.PRONE;
      context.eventBus.emit(GameEventNames.PlayerStatusChanged, attacker);
    }
    context.gameService.finishActivation(attacker.id);
    if (context.gameService.getState().activePlayer?.id === attacker.id) {
      context.gameService.getState().activePlayer = null;
    }
  }
}
