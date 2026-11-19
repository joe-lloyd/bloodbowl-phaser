import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { GameEventNames, type ActionType } from "../../types/events";
import { type IGameService } from "../../services/interfaces/IGameService";
import {
  type Player,
  PlayerStatus,
  PlayerCondition,
  addCondition,
} from "../../types/Player";
import { activationGates, withRerollOffer } from "../skills";
import { type ActivationGate } from "../skills/SkillRule";
import { type ReactionDecisionAnswer } from "../../types/decisions";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";

export class ActivationGateOperation extends GameOperation {
  public readonly name = "ActivationGate";

  private playerId: string;
  private action: ActionType;
  constructor(playerId: string, action: ActionType) {
    super();
    this.playerId = playerId;
    this.action = action;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;
    const player = gameService.getPlayerById(this.playerId);
    if (!player?.gridPosition) return;

    const gates = activationGates(
      player,
      this.action,
      gameService.getTeammates(this.playerId)
    );
    for (const gate of gates) {
      gameService.commitAction(this.playerId);
      const dice = gameService.getDiceController();
      const doRoll = () => {
        const r = dice.rollSkillCheck(
          { reason: gate.skill,target: gate.target,modifier: gate.modifier,playerName: player.playerName,teamId: player.teamId }        );
        return r;
      };
      const result = await withRerollOffer(
        { gameService, eventBus },
        player,
        "activation",
        doRoll,
        { rollName: String(gate.skill) }
      );
      if (result.success) continue;
      await this.applyFailure(context, player, gate);
      break;
    }
  }

  private async applyFailure(
    context: FlowContext,
    player: Player,
    gate: ActivationGate
  ): Promise<void> {
    const gameService = context.gameService;
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
        return;
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
        if (!victim?.gridPosition) {
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

        const ball = groundBall(gameService.getState());
        const hadBall =
          !!ball &&
          ball.x === victim.gridPosition.x &&
          ball.y === victim.gridPosition.y;
        if (hadBall) {
          context.flowManager.add(
            new BounceOperation({ ...victim.gridPosition }),
            true
          );
        }
        context.flowManager.add(
          new ArmourOperation(victim.id, this.playerId, undefined, "lash-out"),
          true
        );
        if (hadBall) {
          gameService.triggerTurnover("Lashed out at the ball carrier");
        }
        return;
      }
      case "bloodlust": {
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: gate.skill,
          effect: `${gate.skill}: the thirst takes hold — the coach may change the action to a Move`,
        });
        const decisions = gameService.getDecisionService();
        const answer = (await decisions.request({
          type: "reaction",
          playerId: player.id,
          chooserTeamId: player.teamId,
          skill: gate.skill,
          prompt: `${player.playerName} fails the Bloodlust roll — change the declared action to a Move Action?`,
        })) as ReactionDecisionAnswer;
        const state = gameService.getState();
        if (answer.accept) {
          state.activePlayer = { id: this.playerId, action: "move" };
          eventBus.emit(
            GameEventNames.UI_Notification,
            `${player.playerName} will Move instead`
          );
        }
        if (state.activePlayer?.id === this.playerId) {
          state.activePlayer.bloodlustUnsated = true;
        }
        return;
      }
    }
  }

  private endActivationNow(gameService: IGameService): void {
    const state = gameService.getState();
    if (state.activePlayer?.id === this.playerId) {
      state.activePlayer = null;
    }
    gameService.finishActivation(this.playerId);
  }
}
