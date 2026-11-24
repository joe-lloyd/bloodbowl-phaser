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
import { activationGates, playersWithin, withRerollOffer } from "../skills";
import { SkillType, hasSkill } from "../../types/Skills";
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
      if (gate.onFail.kind !== "squigRage")
        gameService.commitAction(this.playerId);
      const dice = gameService.getDiceController();
      const doRoll = () => {
        const r = dice.rollSkillCheck({
          reason: gate.skill,
          target: gate.target,
          modifier: gate.modifier,
          playerName: player.playerName,
          teamId: player.teamId,
        });
        return r;
      };
      const result = await withRerollOffer(
        { gameService, eventBus },
        player,
        "activation",
        doRoll,
        { rollName: String(gate.skill) }
      );
      if (result.success) {
        gameService.commitAction(this.playerId);
        continue;
      }
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
        this.distract(context, player, gate.skill);
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
        const victim = adjacentStandingPlayers(
          player,
          gameService.getTeammates(player.id)
        )[0];
        if (victim) {
          this.lashOut(context, { player, victim, skill: gate.skill });
        } else {
          eventBus.emit(GameEventNames.SkillTriggered, {
            playerId: player.id,
            skill: gate.skill,
            effect: `${gate.skill}: no team-mate adjacent. The activation ends.`,
          });
          this.endActivationNow(gameService);
        }
        return;
      }
      case "squigRage":
        await this.resolveSquigRage(context, player);
        return;
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

  private async resolveSquigRage(
    context: FlowContext,
    player: Player
  ): Promise<void> {
    const { gameService, eventBus } = context;
    const skill = SkillType.SQUIG_RAGE;
    const [opponent] = adjacentStandingPlayers(
      player,
      gameService.getOpponents(player.teamId)
    );
    if (opponent && canRageBlock(player)) {
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: player.id,
        skill,
        effect: `${player.playerName} must Block ${opponent.playerName}.`,
      });
      await gameService.forceBlock(player.id, opponent.id);
      return;
    }

    const targets = adjacentStandingPlayers(
      player,
      gameService.getTeammates(player.id)
    );
    const victim = await chooseRageVictim(gameService, { player, targets });
    if (victim) {
      gameService.commitAction(player.id);
      this.lashOut(context, { player, victim, skill });
    } else {
      this.distract(context, player, skill);
    }
  }

  private distract(context: FlowContext, player: Player, skill: string): void {
    const { gameService, eventBus } = context;
    addCondition(player, PlayerCondition.DISTRACTED);
    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: player.id,
      skill,
      effect: `${skill}: ${player.playerName} becomes Distracted. The activation ends.`,
    });
    eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName} is Distracted!`
    );
    this.endActivationNow(gameService);
  }

  private lashOut(
    context: FlowContext,
    { player, victim, skill }: { player: Player; victim: Player; skill: string }
  ): void {
    const { gameService, eventBus, flowManager } = context;
    const square = victim.gridPosition;
    if (!square) return;

    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: player.id,
      skill,
      effect: `${skill}: ${player.playerName} lashes out at ${victim.playerName}!`,
    });
    victim.status = PlayerStatus.PRONE;
    eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: victim.id });
    eventBus.emit(GameEventNames.PlayerStatusChanged, victim);

    const ball = groundBall(gameService.getState());
    const hadBall = ball?.x === square.x && ball.y === square.y;
    if (hadBall) flowManager.add(new BounceOperation({ ...square }), true);
    flowManager.add(
      new ArmourOperation(victim.id, player.id, undefined, "lash-out"),
      true
    );
    if (hadBall) gameService.triggerTurnover("Lashed out at the ball carrier");
  }

  private endActivationNow(gameService: IGameService): void {
    const state = gameService.getState();
    if (state.activePlayer?.id === this.playerId) {
      state.activePlayer = null;
    }
    gameService.finishActivation(this.playerId);
  }
}

function adjacentStandingPlayers(player: Player, others: Player[]): Player[] {
  const square = player.gridPosition;
  if (!square) return [];
  return playersWithin(square, others, 1)
    .flatMap((other) =>
      other.status === PlayerStatus.ACTIVE && other.gridPosition
        ? [{ other, at: other.gridPosition }]
        : []
    )
    .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
    .map(({ other }) => other);
}

function canRageBlock(player: Player): boolean {
  return (
    player.status === PlayerStatus.ACTIVE ||
    (player.status === PlayerStatus.PRONE &&
      hasSkill(player.skills, SkillType.JUMP_UP))
  );
}

async function chooseRageVictim(
  gameService: IGameService,
  { player, targets }: { player: Player; targets: Player[] }
): Promise<Player | undefined> {
  if (targets.length === 0) return;
  const answer = await gameService.getDecisionService().request({
    type: "bite-target",
    playerId: player.id,
    chooserTeamId: player.teamId,
    targetIds: targets.map((target) => target.id),
    skill: SkillType.SQUIG_RAGE,
  });
  if ("targetId" in answer)
    return targets.find((target) => target.id === answer.targetId);
  return undefined;
}
