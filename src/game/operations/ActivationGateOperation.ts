import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { GameEventNames, ActionType } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import {
  Player,
  PlayerStatus,
  PlayerCondition,
  addCondition,
} from "../../types/Player";
import { foldTrigger, withRerollOffer } from "../skills";
import {
  ActivationDeclaredContext,
  ActivationGate,
} from "../skills/SkillRule";
import { ReactionDecisionAnswer } from "../../types/decisions";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";

/**
 * ActivationGateOperation — negatrait rolls between declaring an action and
 * performing it (2025: Bone Head, Really Stupid, Animal Savagery,
 * Unchannelled Fury, Take Root, Bloodlust). Queued by declareAction when
 * the player carries a rule with the onActivationDeclared hook. Rules
 * declare their gate (target, modifier, failure effect); this operation
 * rolls each in fold order and applies the first failure. Gate rolls are
 * compulsory but may be team-rerolled (rollKind "activation"); a natural 1
 * always fails (rollSkillCheck's contract).
 *
 * Failure effects:
 * - distracted: the player becomes Distracted and their activation ends —
 *   the declared action is not performed (Distracted definition: no Tackle
 *   Zone until they are next activated).
 * - endActivation: the activation simply ends (Unchannelled Fury).
 * - rooted: the player becomes Rooted but MAY still perform the declared
 *   action in place (Take Root).
 * - lashOut: an adjacent Standing team-mate is Knocked Down with armour/
 *   injury (turnover only if they held the ball); with a victim available
 *   the activation then continues, with nobody adjacent it ends (Animal
 *   Savagery — the victim is picked deterministically by board order; a
 *   coach-facing choice can layer on later without changing the engine).
 * - bloodlust: the coach may downgrade the declared action to a Move
 *   Action; a declared Blitz still counts as the turn's Blitz (the flag was
 *   consumed at declaration). The end-of-activation Thrall bite is NOT
 *   enforced — no roster fields Thrall Linemen yet (see design).
 */
export class ActivationGateOperation extends GameOperation {
  public readonly name = "ActivationGate";

  constructor(
    private playerId: string,
    private action: ActionType
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const player = gameService.getPlayerById(this.playerId);
    if (!player || !player.gridPosition) return;

    const ctx: ActivationDeclaredContext = {
      player,
      action: this.action,
      teammates: gameService.getTeammates(this.playerId),
      gates: [],
      dice: gameService.getDiceController(),
      decisions: gameService.getDecisionService(),
      flow: context.flowManager,
      arbiter: gameService.getRerollArbiter(),
      triggers: [],
    };
    await foldTrigger("onActivationDeclared", [player], ctx);
    for (const t of ctx.triggers) {
      eventBus.emit(GameEventNames.SkillTriggered, t);
    }

    for (const gate of ctx.gates) {
      // The gate rolls whether it passes or fails — the declaration becomes
      // binding here, before the die is even thrown, so a failed Bone Head
      // (etc.) still spends the team's once-per-turn allowance.
      gameService.commitAction(this.playerId);
      const dice = gameService.getDiceController();
      const doRoll = () => {
        const r = dice.rollSkillCheck(
          gate.skill,
          gate.target,
          gate.modifier,
          player.playerName,
          player.teamId
        );
        return { success: r.success, roll: r.roll };
      };
      const result = await withRerollOffer(
        { gameService, eventBus },
        player,
        "activation",
        doRoll
      );
      if (result.success) continue;
      await this.applyFailure(context, player, gate);
      break; // one failed gate settles the activation's fate
    }
  }

  private async applyFailure(
    context: FlowContext,
    player: Player,
    gate: ActivationGate
  ): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;

    switch (gate.onFail.kind) {
      case "distracted": {
        addCondition(player, PlayerCondition.DISTRACTED);
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: gate.skill,
          effect: `${gate.skill}: ${player.playerName} becomes Distracted — the activation ends`,
        });
        eventBus.emit(GameEventNames.PlayerStatusChanged, player);
        eventBus.emit(
          GameEventNames.UI_Notification,
          `${player.playerName} is Distracted!`
        );
        this.endActivationNow(gameService);
        return;
      }
      case "endActivation": {
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: gate.skill,
          effect: `${gate.skill}: the activation ends with nothing to show for it`,
        });
        this.endActivationNow(gameService);
        return;
      }
      case "rooted": {
        addCondition(player, PlayerCondition.ROOTED);
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: gate.skill,
          effect: `${gate.skill}: ${player.playerName} becomes Rooted — they may act but not leave their square`,
        });
        eventBus.emit(GameEventNames.PlayerStatusChanged, player);
        return; // the declared action may still be performed in place
      }
      case "lashOut": {
        const victims = gameService
          .getTeammates(this.playerId)
          .filter(
            (p) =>
              p.status === PlayerStatus.ACTIVE &&
              p.gridPosition &&
              player.gridPosition &&
              Math.abs(p.gridPosition.x - player.gridPosition.x) <= 1 &&
              Math.abs(p.gridPosition.y - player.gridPosition.y) <= 1
          )
          .sort(
            (a, b) =>
              a.gridPosition!.y - b.gridPosition!.y ||
              a.gridPosition!.x - b.gridPosition!.x
          );
        const victim = victims[0];
        if (!victim || !victim.gridPosition) {
          // Nobody adjacent to lash out at — the activation ends
          eventBus.emit(GameEventNames.SkillTriggered, {
            playerId: player.id,
            skill: gate.skill,
            effect: `${gate.skill}: no team-mate adjacent — the activation ends`,
          });
          this.endActivationNow(gameService);
          return;
        }

        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: gate.skill,
          effect: `${gate.skill}: ${player.playerName} lashes out at ${victim.playerName}!`,
        });
        victim.status = PlayerStatus.PRONE;
        eventBus.emit(GameEventNames.PlayerKnockedDown, {
          playerId: victim.id,
        });
        eventBus.emit(GameEventNames.PlayerStatusChanged, victim);

        const ball = gameService.getState().ballPosition;
        const hadBall =
          !!ball &&
          ball.x === victim.gridPosition.x &&
          ball.y === victim.gridPosition.y;
        if (hadBall) {
          // The downed carrier drops the ball — a turnover, per the book
          context.flowManager.add(
            new BounceOperation({ ...victim.gridPosition }),
            true
          );
        }
        context.flowManager.add(
          // A lash-out is not a Block Action — never arms Plague Ridden.
          new ArmourOperation(victim.id, this.playerId, undefined, "special"),
          true
        );
        if (hadBall) {
          gameService.triggerTurnover("Lashed out at the ball carrier");
        }
        return; // with a victim struck, the activation continues
      }
      case "bloodlust": {
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: gate.skill,
          effect: `${gate.skill}: the thirst takes hold — the coach may change the action to a Move (the Thrall bite clause is not enforced: no Thrall Linemen roster)`,
        });
        const decisions = gameService.getDecisionService();
        const answer = (await decisions.request({
          type: "reaction",
          playerId: player.id,
          chooserTeamId: player.teamId,
          skill: gate.skill,
          prompt: `${player.playerName} fails the Bloodlust roll — change the declared action to a Move Action?`,
        })) as ReactionDecisionAnswer;
        if (answer.accept) {
          gameService.getState().activePlayer = {
            id: this.playerId,
            action: "move",
          };
          eventBus.emit(
            GameEventNames.UI_Notification,
            `${player.playerName} will Move instead`
          );
        }
        return; // the activation continues either way
      }
    }
  }

  /** End the activation: clear the declared action, mark the player spent. */
  private endActivationNow(gameService: IGameService): void {
    const state = gameService.getState();
    if (state.activePlayer?.id === this.playerId) {
      state.activePlayer = null;
    }
    gameService.finishActivation(this.playerId);
  }
}
