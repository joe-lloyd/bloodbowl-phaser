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
import { openActivation } from "../managers/PlayerActionManager";
import { activationGates, playersWithin, withRerollOffer } from "../skills";
import { SkillType, hasSkill } from "../../types/Skills";
import { type ActivationGate } from "../skills/SkillRule";
import {
  type BiteTargetDecisionRequest,
  type ReactionDecisionAnswer,
} from "../../types/decisions";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { ragesOnActivation, SQUIG_RAGE_GATE } from "../skills/rules/SquigRageRule";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";

export class ActivationGateOperation extends GameOperation {
  public readonly name = "ActivationGate";

  private playerId: string;
  private action: ActionType | null;
  constructor(playerId: string, action: ActionType | null) {
    super();
    this.playerId = playerId;
    this.action = action;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const player = gameService.getPlayerById(this.playerId);
    if (!player?.gridPosition) return;

    const { activePlayer } = gameService.getState();
    const rolling = activePlayer?.id === player.id ? activePlayer : null;
    const gates = gatesToRoll({
      player,
      action: this.action,
      teammates: gameService.getTeammates(this.playerId),
      squigRageSettled: rolling?.squigRageSettled === true,
    });
    if (gates.length === 0) return;
    if (rolling) rolling.activationRollStarted = true;
    try {
      await this.rollGates(context, player, gates);
    } finally {
      if (rolling) delete rolling.activationRollStarted;
    }
  }

  private async rollGates(
    context: FlowContext,
    player: Player,
    gates: ActivationGate[]
  ): Promise<void> {
    const { gameService, eventBus } = context;
    for (const gate of gates) {
      if (gate.onFail.kind !== "squigRage") {
        gameService.commitAction(this.playerId);
      }
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
        { rollName: gate.skill }
      );
      if (result.success) {
        if (this.action === null) this.reopenActivation(context);
        else gameService.commitAction(this.playerId);
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
      case "distracted":
        this.distract(context, player, gate.skill);
        return;
      case "endActivation":
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: gate.skill,
          effect: `${gate.skill}: the activation ends with nothing to show for it`,
        });
        this.endActivationNow(gameService);
        return;
      case "rooted":
        addCondition(player, PlayerCondition.ROOTED);
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: gate.skill,
          effect: `${gate.skill}: ${player.playerName} becomes Rooted — they may act but not leave their square`,
        });
        eventBus.emit(GameEventNames.PlayerStatusChanged, player);
        return;
      case "lashOut": {
        const victim = adjacentStandingPlayers(
          player,
          gameService.getTeammates(player.id)
        )[0];
        if (victim) {
          await this.lashOut(context, { player, victim, skill: gate.skill });
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
    const opponents = adjacentStandingPlayers(
      player,
      gameService.getOpponents(player.teamId)
    );
    const opponent = canRageBlock(player)
      ? await chooseRageOpponent(gameService, player, opponents)
      : undefined;
    if (opponent) {
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
    const victim = await chooseRageTarget(gameService, {
      player,
      targets,
      purpose: "squig-knock-down",
    });
    if (victim) {
      await this.lashOut(context, { player, victim, skill });
      this.reopenActivation(context);
    } else {
      this.distract(context, player, skill);
    }
  }

  private reopenActivation({ gameService, eventBus }: FlowContext): void {
    const state = gameService.getState();
    if (gameService.isTurnoverInProgress()) return;
    if (state.activePlayer?.id !== this.playerId) return;
    state.activePlayer = openActivation(state.activePlayer);
    eventBus.emit(GameEventNames.ActionMustBeRedeclared, {
      playerId: this.playerId,
    });
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

  private async lashOut(
    context: FlowContext,
    { player, victim, skill }: { player: Player; victim: Player; skill: string }
  ): Promise<void> {
    const { gameService, eventBus, flowManager } = context;
    const square = victim.gridPosition;
    if (!square) return;

    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: player.id,
      skill,
      effect: `${skill}: ${player.playerName} lashes out at ${victim.playerName}!`,
    });
    const dice = gameService.getDiceController();
    if (await steadyFootingSaves(victim, dice, eventBus, gameService)) return;
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

function gatesToRoll({
  player,
  action,
  teammates,
  squigRageSettled,
}: {
  player: Player;
  action: ActionType | null;
  teammates: Player[];
  squigRageSettled: boolean;
}): ActivationGate[] {
  if (action === null) {
    return ragesOnActivation(player, teammates) ? [{ ...SQUIG_RAGE_GATE }] : [];
  }
  const gates = activationGates(player, action, teammates);
  if (!squigRageSettled) return gates;
  const rage = gates.findIndex((gate) => gate.onFail.kind === "squigRage");
  return gates.slice(rage + 1);
}

function adjacentStandingPlayers(player: Player, others: Player[]): Player[] {
  const square = player.gridPosition;
  if (!square) return [];
  return playersWithin(square, others, 1)
    .flatMap((other) =>
      other.status === PlayerStatus.ACTIVE && other.gridPosition
        ? { other, at: other.gridPosition }
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

async function chooseRageOpponent(
  gameService: IGameService,
  player: Player,
  opponents: Player[]
): Promise<Player | undefined> {
  if (opponents.length < 2) return opponents[0];
  return chooseRageTarget(gameService, {
    player,
    targets: opponents,
    purpose: "squig-block",
  });
}

async function chooseRageTarget(
  gameService: IGameService,
  {
    player,
    targets,
    purpose,
  }: {
    player: Player;
    targets: Player[];
    purpose: NonNullable<BiteTargetDecisionRequest["purpose"]>;
  }
): Promise<Player | undefined> {
  if (targets.length === 0) return;
  const answer = await gameService.getDecisionService().request({
    type: "bite-target",
    playerId: player.id,
    chooserTeamId: player.teamId,
    targetIds: targets.map((target) => target.id),
    purpose,
  });
  if ("targetId" in answer)
    return targets.find((target) => target.id === answer.targetId);
  return undefined;
}
