import { scopeEventBus } from "../../../services/scopedEventBus";
import { rollLabel, requiredRoll } from "../../rules/rollTargets";
import { rushModifier } from "../../inducements/matchInducements";
import { type IGameService } from "../../../services/interfaces/IGameService";
import { type GameEventMap, type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { moveAllowance } from "../../skills/movement";
import { withDriveModifiers } from "../../kickoff/driveEffects";
import { activeRules } from "../../variants/activeMatch";

export type ActionCommandService = Pick<IGameService,
  "getState" | "getPlayerById" | "getMovementUsed" | "rollBlockDice" | "resolveBlock" |
  "keepBlockDice" | "teamRerollBlock" | "proRerollBlockDie" | "brawlerRerollBlockDie" |
  "veteranRerollBlock" | "answerReroll" | "answerReaction" | "answerInterception" |
  "answerApothecary" | "followUpPush" | "finishBlockActivation">;

type BlockRoll = GameEventMap[typeof GameEventNames.UI_RollBlockDice];
interface ActionContext {
  gameService: ActionCommandService;
  eventBus: IEventBus;
  pendingBlitzBlock: BlockRoll | null;
}
function rollBlock(context: ActionContext, data: GameEventMap[typeof GameEventNames.UI_RollBlockDice]): void {
  const { gameService, eventBus } = context;

    const state = gameService.getState();
    const attacker = gameService.getPlayerById(data.attackerId);
    const isBlitzBlock =
      state.activePlayer?.action === "blitz" &&
      state.activePlayer.id === data.attackerId;

    if (isBlitzBlock && attacker) {
      const effectiveAttacker = withDriveModifiers(attacker, state);
      const used = gameService.getMovementUsed(data.attackerId);
      if (used + 1 > moveAllowance(effectiveAttacker)) {
        eventBus.emit(
          GameEventNames.UI_Notification,
          "No movement left to make the Blitz block!"
        );
        eventBus.emit(GameEventNames.UI_BlockRollCancelled, undefined);
        return;
      }
      if (used + 1 > effectiveAttacker.stats.MA && !data.rushAccepted) {
        context.pendingBlitzBlock = data;
        const target = requiredRoll(
          activeRules().rushTarget,
          rushModifier(state, attacker)
        );
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

    void gameService.rollBlockDice({ attackerId: data.attackerId, defenderId: data.defenderId, numDice: data.numDice, isAttackerChoice: data.isAttackerChoice }
    );
  
}

function confirmBlitz(context: ActionContext, data: GameEventMap[typeof GameEventNames.UI_ConfirmationResult]): void {
  const { gameService, eventBus } = context;

    if (data.actionId !== "blitz-rush-confirm") return;
    const pending = context.pendingBlitzBlock;
    context.pendingBlitzBlock = null;
    if (data.confirmed && pending) {
      void gameService.rollBlockDice({ attackerId: pending.attackerId, defenderId: pending.defenderId, numDice: pending.numDice, isAttackerChoice: pending.isAttackerChoice }
      );
    } else {
      eventBus.emit(GameEventNames.UI_BlockRollCancelled, undefined);
    }
  
}

async function followUp(context: ActionContext, data: GameEventMap[typeof GameEventNames.UI_FollowUpResponse]): Promise<void> {
  const { gameService } = context;

    if (data.followUp && data.targetSquare) {
      await gameService.followUpPush(data.attackerId, data.targetSquare);
    }

    gameService.finishBlockActivation(data.attackerId);
  
}

function bindBlockCommands(context: ActionContext): void {
  const { gameService, eventBus } = context;
  eventBus.on(GameEventNames.UI_RollBlockDice, (data) => { rollBlock(context, data); });
  eventBus.on(GameEventNames.UI_BlockResultSelected, (data) => {
    void gameService.resolveBlock(data.attackerId, data.defenderId, data.result);
  });
  eventBus.on(GameEventNames.UI_KeepBlockDice, ({ attackerId }) => {
    gameService.keepBlockDice(attackerId);
  });
  eventBus.on(GameEventNames.UI_TeamRerollBlock, (data) => {
    gameService.teamRerollBlock(data.attackerId);
  });
  eventBus.on(GameEventNames.UI_ProRerollBlockDie, (data) => {
    gameService.proRerollBlockDie(data.attackerId, data.dieIndex);
  });
  eventBus.on(GameEventNames.UI_BrawlerRerollBlockDie, (data) => {
    gameService.brawlerRerollBlockDie(data.attackerId);
  });
  eventBus.on(GameEventNames.UI_VeteranRerollBlock, (data) => {
    gameService.veteranRerollBlock(data.attackerId);
  });
}

function bindResponseCommands(context: ActionContext): void {
  const { gameService, eventBus } = context;
  eventBus.on(GameEventNames.UI_ConfirmationResult, (data) => { confirmBlitz(context, data); });
  eventBus.on(GameEventNames.UI_RerollResponse, (data) => {
    gameService.answerReroll(data.accept, data.source);
  });
  eventBus.on(GameEventNames.UI_ReactionResponse, (data) => {
    gameService.answerReaction(data.accept);
  });
  eventBus.on(GameEventNames.UI_InterceptionResponse, (data) => {
    gameService.answerInterception(data.playerId);
  });
  eventBus.on(GameEventNames.UI_ApothecaryResponse, (data) => {
    gameService.answerApothecary(data.accept);
  });
  eventBus.on(GameEventNames.UI_FollowUpResponse, (data) => { void followUp(context, data); });
}

export function registerActionCommands(gameService: ActionCommandService, eventBus: IEventBus): () => void {
  const subscriptions = scopeEventBus(eventBus);
  const context: ActionContext = { gameService, eventBus: subscriptions, pendingBlitzBlock: null };
  bindBlockCommands(context);
  bindResponseCommands(context);
  return () => { subscriptions.dispose(); };
}
