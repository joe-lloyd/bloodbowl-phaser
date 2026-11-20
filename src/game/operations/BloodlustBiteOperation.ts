import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import {
  type Player,
  PlayerCondition,
  PlayerStatus,
  PositionKeyWord,
  TraitKeyWord,
  addCondition,
} from "../../types/Player";
import { SkillType } from "../../types/Skills";
import {
  type BiteTargetDecisionAnswer,
  type ReactionDecisionAnswer,
} from "../../types/decisions";
import { BounceOperation } from "./BounceOperation";
import { InjuryOperation } from "./InjuryOperation";

class ThenOperation extends GameOperation {
  public readonly name = "BloodlustThen";

  private run: () => void;
  constructor(run: () => void) {
    super();
    this.run = run;
  }

  async execute(): Promise<void> {
    this.run();
  }
}

export class BloodlustBiteOperation extends GameOperation {
  public readonly name = "BloodlustBite";

  private playerId: string;
  private unsated: "consequences" | "refuse";
  private then: (sated: boolean) => void;
  constructor(
    playerId: string,
    unsated: "consequences" | "refuse",
    then: (sated: boolean) => void
  ) {
    super();
    this.playerId = playerId;
    this.unsated = unsated;
    this.then = then;
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;
    const player = gameService.getPlayerById(this.playerId);
    if (!player?.gridPosition) {
      this.then(false);
      return;
    }

    const thrall =
      player.status === PlayerStatus.ACTIVE
        ? await this.chooseThrall(context, player)
        : undefined;
    const followUps: GameOperation[] = [];
    if (thrall?.gridPosition) {
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: player.id,
        skill: SkillType.BLOODLUST,
        effect: `Bloodlust: ${player.playerName} bites ${thrall.playerName}`,
      });
      followUps.push(
        new InjuryOperation(thrall.id, {
          causedById: player.id,
          cause: "special",
          casualtyIsBadlyHurt: true,
        })
      );
      if (holdsBall(context, thrall)) {
        followUps.push(new BounceOperation({ ...thrall.gridPosition }));
        gameService.triggerTurnover("A bitten Thrall dropped the ball");
      }
      followUps.push(
        new ThenOperation(() => {
          this.then(true);
        })
      );
    } else if (this.unsated === "refuse") {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} must bite a Thrall Lineman first`
      );
      followUps.push(
        new ThenOperation(() => {
          this.then(false);
        })
      );
    } else {
      addCondition(player, PlayerCondition.DISTRACTED);
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: player.id,
        skill: SkillType.BLOODLUST,
        effect: `Bloodlust: ${player.playerName} bit nobody — Distracted, and a Turnover`,
      });
      eventBus.emit(GameEventNames.PlayerStatusChanged, player);
      if (holdsBall(context, player)) {
        followUps.push(new BounceOperation({ ...player.gridPosition }));
      }
      gameService.triggerTurnover("Bloodlust: no Thrall Lineman bitten");
      followUps.push(
        new ThenOperation(() => {
          this.then(false);
        })
      );
    }

    for (const op of followUps.reverse()) flowManager.add(op, true);
  }

  private async chooseThrall(
    context: FlowContext,
    player: Player
  ): Promise<Player | undefined> {
    const from = player.gridPosition!;
    const thralls = context.gameService
      .getTeammates(player.id)
      .filter(
        (p) =>
          !!p.gridPosition &&
          p.keywords.includes(TraitKeyWord.THRALL) &&
          p.keywords.includes(PositionKeyWord.LINEMAN) &&
          Math.max(
            Math.abs(p.gridPosition.x - from.x),
            Math.abs(p.gridPosition.y - from.y)
          ) === 1
      )
      .sort(
        (a, b) =>
          a.gridPosition!.y - b.gridPosition!.y ||
          a.gridPosition!.x - b.gridPosition!.x
      );
    const decisions = context.gameService.getDecisionService();
    if (thralls.length === 0) return undefined;
    const [thrall] = thralls;
    if (thralls.length === 1 && thrall) {
      const answer = (await decisions.request({
        type: "reaction",
        playerId: player.id,
        chooserTeamId: player.teamId,
        skill: SkillType.BLOODLUST,
        prompt: `Bloodlust: ${player.playerName} bites ${thrall.playerName}?`,
      })) as ReactionDecisionAnswer;
      return answer.accept ? thrall : undefined;
    }

    const answer = (await decisions.request({
      type: "bite-target",
      playerId: player.id,
      chooserTeamId: player.teamId,
      targetIds: thralls.map((t) => t.id),
    })) as BiteTargetDecisionAnswer;
    return thralls.find((t) => t.id === answer.targetId);
  }
}

function holdsBall(context: FlowContext, player: Player): boolean {
  const ball = groundBall(context.gameService.getState());
  return (
    !!ball &&
    !!player.gridPosition &&
    ball.x === player.gridPosition.x &&
    ball.y === player.gridPosition.y
  );
}
