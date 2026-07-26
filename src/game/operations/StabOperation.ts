import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";
import { effectiveAV } from "../kickoff/driveEffects";
import { InjuryOperation } from "./InjuryOperation";
import { BounceOperation } from "./BounceOperation";

/**
 * Ends the stabber's activation once the stab (and any injury/casualty it
 * queued) has fully settled — queued at the BACK of the flow.
 */
class FinishStabOperation extends GameOperation {
  public readonly name = "FinishStab";

  constructor(private attackerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.attackerId);
  }
}

/**
 * StabOperation (2025 rulebook p.136, Stab trait)
 *
 * "Select a Standing opposition player adjacent to this player and make an
 * Armour Roll for the selected player. This Armour Roll cannot be modified
 * in any way. If the player's armour is broken, make an Injury Roll for
 * them, otherwise nothing happens." The activation ends as soon as the
 * Stab has been performed — including when it replaced the Block of a
 * Blitz Action. Never a turnover.
 *
 * The unmodifiable Armour Roll is rolled directly (no skill fold): armour
 * modifiers like Mighty Blow or Claws never apply. The Injury Roll is a
 * normal one — injury-side rules (Stunty table, Thick Skull, Regeneration)
 * work as usual.
 */
export class StabOperation extends GameOperation {
  public readonly name = "StabOperation";

  constructor(
    private attackerId: string,
    private targetId: string
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const diceController = gameService.getDiceController();

    const attacker = gameService.getPlayerById(this.attackerId);
    const target = gameService.getPlayerById(this.targetId);
    if (!attacker?.gridPosition || !target?.gridPosition) return;

    if (target.status !== PlayerStatus.ACTIVE) {
      eventBus.emit(GameEventNames.UI_Notification, "Target must be Standing!");
      return;
    }
    const dx = Math.abs(attacker.gridPosition.x - target.gridPosition.x);
    const dy = Math.abs(attacker.gridPosition.y - target.gridPosition.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) {
      eventBus.emit(GameEventNames.UI_Notification, "Target must be adjacent!");
      return;
    }

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${attacker.playerName} stabs ${target.playerName}!`
    );
    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attacker.id,
      skill: SkillType.STAB,
      effect: `Stab: an unmodifiable Armour Roll against ${target.playerName}`,
    });

    await context.delay(800);

    // Unmodifiable Armour Roll: straight 2D6 vs AV, no skill fold
    const armour = diceController.rollArmorCheck(
      effectiveAV(target, gameService.getState()),
      target.playerName,
      attacker.teamId
    );

    if (armour.broken) {
      eventBus.emit(GameEventNames.UI_Notification, "ARMOUR BROKEN!");
      target.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: target.id });
      eventBus.emit(GameEventNames.PlayerStatusChanged, target);
      // A downed carrier drops the ball (bounce resolves after the injury)
      const ball = gameService.getState().ballPosition;
      if (
        ball &&
        ball.x === target.gridPosition.x &&
        ball.y === target.gridPosition.y
      ) {
        context.flowManager.add(
          new BounceOperation({ ...target.gridPosition }),
          true
        );
      }
      context.flowManager.add(
        new InjuryOperation(target.id, {
          causedById: attacker.id,
          cause: "special",
        }),
        true
      );
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    }

    // The activation ends as soon as the Stab is performed — after the
    // injury (if any) settles, never a turnover
    context.flowManager.add(new FinishStabOperation(this.attackerId));
  }
}
