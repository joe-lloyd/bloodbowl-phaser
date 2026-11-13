import { rollLabel, requiredRoll } from "../../rules/rollTargets";
import { rushModifier } from "../../inducements/matchInducements";
import { IGameService } from "../../../services/interfaces/IGameService";
import { GameEventMap, IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { moveAllowance } from "../../skills/movement";
import { withDriveModifiers } from "../../kickoff/driveEffects";

/**
 * The coach's answers to a block or a paused roll, passed to the engine:
 * roll the block dice, pick a result, re-roll, follow up, and the re-roll,
 * reaction, interception and apothecary dialogs. Play and kick-off both
 * register them, because a Charge! Blitz blocks and rolls during KICKOFF.
 * Returns the unsubscribe.
 */
export function registerActionCommands(
  gameService: IGameService,
  eventBus: IEventBus
): () => void {
  const unsubscribes: (() => void)[] = [];
  const register = <K extends keyof GameEventMap>(
    event: K,
    handler: (data: GameEventMap[K]) => void
  ): void => {
    eventBus.on(event, handler);
    unsubscribes.push(() => eventBus.off(event, handler));
  };
  /** Blitz block awaiting the rush confirmation dialog */
  let pendingBlitzBlock: GameEventMap[GameEventNames.UI_RollBlockDice] | null =
    null;

  // Block Dice. The block at the end of a Blitz costs 1 movement; if that
  // point is beyond MA it's a Rush — ask the usual rush confirmation
  // BEFORE any dice are rolled (declining keeps the activation open).
  register(GameEventNames.UI_RollBlockDice, (data) => {
    const state = gameService.getState();
    const attacker = gameService.getPlayerById(data.attackerId);
    const isBlitzBlock =
      state.activePlayer?.action === "blitz" &&
      state.activePlayer.id === data.attackerId;

    if (isBlitzBlock && attacker) {
      const effectiveAttacker = withDriveModifiers(attacker, state);
      const used = gameService.getMovementUsed(data.attackerId);
      if (used + 1 > moveAllowance(effectiveAttacker)) {
        // Even a Rush can't pay for the block any more
        eventBus.emit(
          GameEventNames.UI_Notification,
          "No movement left to make the Blitz block!"
        );
        eventBus.emit(GameEventNames.UI_BlockRollCancelled);
        return;
      }
      if (used + 1 > effectiveAttacker.stats.MA) {
        pendingBlitzBlock = data;
        const target = requiredRoll(2, rushModifier(state, attacker));
        eventBus.emit(GameEventNames.UI_RequestConfirmation, {
          actionId: "blitz-rush-confirm",
          title: "Rush Required!",
          message:
            `${rollLabel("This block needs a Rush", target)}.\n` +
            "A fail knocks the blitzer down. It is a turnover and no block is rolled.",
          confirmLabel: "Rush!",
          cancelLabel: "Cancel",
          risky: true,
          chooserTeamId: attacker.teamId,
          step: {
            playerId: attacker.id,
            rolls: [{ type: "rush", target }],
          },
        });
        return;
      }
    }

    gameService.rollBlockDice(
      data.attackerId,
      data.defenderId,
      data.numDice,
      data.isAttackerChoice
    );
  });

  register(GameEventNames.UI_ConfirmationResult, (data) => {
    if (data.actionId !== "blitz-rush-confirm") return;
    const pending = pendingBlitzBlock;
    pendingBlitzBlock = null;
    if (data.confirmed && pending) {
      gameService.rollBlockDice(
        pending.attackerId,
        pending.defenderId,
        pending.numDice,
        pending.isAttackerChoice
      );
    } else {
      // Rush declined: no dice will come — stop the dialog's rolling state
      eventBus.emit(GameEventNames.UI_BlockRollCancelled);
    }
  });

  // Block Result Selected
  register(GameEventNames.UI_BlockResultSelected, (data) => {
    gameService.resolveBlock(
      data.attackerId,
      data.defenderId,
      data.result
    );
  });

  // Block-dice re-rolls (Team Re-roll = all dice, Pro = one die, Brawler =
  // the one Both Down die). All three re-emit BlockDiceRolled, so the
  // dialog refreshes in place.
  register(GameEventNames.UI_KeepBlockDice, ({ attackerId }) => {
    gameService.keepBlockDice(attackerId);
  });
  register(GameEventNames.UI_TeamRerollBlock, (data) => {
    gameService.teamRerollBlock(data.attackerId);
  });
  register(GameEventNames.UI_ProRerollBlockDie, (data) => {
    gameService.proRerollBlockDie(data.attackerId, data.dieIndex);
  });
  register(GameEventNames.UI_BrawlerRerollBlockDie, (data) => {
    gameService.brawlerRerollBlockDie(data.attackerId);
  });
  register(GameEventNames.UI_VeteranRerollBlock, (data) => {
    gameService.veteranRerollBlock(data.attackerId);
  });

  // Reroll/reaction dialog answers — resolve the paused roll path (or,
  // on the guest / online host, route the reply over the protocol)
  register(GameEventNames.UI_RerollResponse, (data) => {
    gameService.answerReroll(data.accept, data.source);
  });
  register(GameEventNames.UI_ReactionResponse, (data) => {
    gameService.answerReaction(data.accept);
  });
  register(GameEventNames.UI_InterceptionResponse, (data) => {
    gameService.answerInterception(data.playerId);
  });
  register(GameEventNames.UI_ApothecaryResponse, (data) => {
    gameService.answerApothecary(data.accept);
  });

  // Push Follow Up Response — the follow-up move is free (no movement
  // cost, no dice), so it must NOT go through movePlayer
  register(GameEventNames.UI_FollowUpResponse, async (data) => {
    if (data.followUp && data.targetSquare) {
      await gameService.followUpPush(data.attackerId, data.targetSquare);
    }
    // A Blitz block keeps the player active with the rest of their move
    // (the engine then asks the board to resume it); a plain block ends
    // the activation.
    gameService.finishBlockActivation(data.attackerId);
  });


  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}
