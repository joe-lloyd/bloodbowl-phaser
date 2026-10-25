import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import {
  Player,
  PlayerCondition,
  PositionKeyWord,
  TraitKeyWord,
  addCondition,
} from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { ReactionDecisionAnswer } from "../../types/decisions";
import { BounceOperation } from "./BounceOperation";
import { InjuryOperation } from "./InjuryOperation";

/** Runs a continuation once the operations queued ahead of it resolve. */
class ThenOperation extends GameOperation {
  public readonly name = "BloodlustThen";

  constructor(private run: () => void) {
    super();
  }

  async execute(): Promise<void> {
    this.run();
  }
}

/**
 * BloodlustBiteOperation (2025 rulebook p.125, Bloodlust (X+)) settles a
 * failed Bloodlust roll: "this player may bite an adjacent Thrall Lineman
 * team-mate regardless of the status of the Thrall Lineman. If they do,
 * immediately make an Injury Roll for the Thrall Lineman, treating any
 * Casualty result as Badly Hurt; this will not cause a Turnover unless the
 * Thrall Lineman was holding the ball. If this player does not bite a
 * Thrall Lineman for any reason, then a Turnover is caused, this player
 * becomes Distracted, and will immediately drop the ball if they were
 * holding it."
 *
 * The coach is asked about each adjacent Thrall Lineman in board order; the
 * first one accepted is bitten. `unsated` decides what refusing costs: the
 * full penalty at the end of the activation or on reaching the End Zone
 * ("consequences"), or only the refused Pass or Hand-off ("refuse").
 * `then` runs after the bite (or the penalty) has resolved.
 */
export class BloodlustBiteOperation extends GameOperation {
  public readonly name = "BloodlustBite";

  constructor(
    private playerId: string,
    private unsated: "consequences" | "refuse",
    private then: (sated: boolean) => void
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;
    const player = gameService.getPlayerById(this.playerId);
    if (!player?.gridPosition) {
      // Off the pitch (a Knocked Out carrier, say): nobody left to bite.
      this.then(false);
      return;
    }

    const thrall = await this.chooseThrall(context, player);
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
      followUps.push(new ThenOperation(() => this.then(true)));
    } else if (this.unsated === "refuse") {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} must bite a Thrall Lineman first`
      );
      followUps.push(new ThenOperation(() => this.then(false)));
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
      followUps.push(new ThenOperation(() => this.then(false)));
    }
    // Front of the queue, in order: injury, bounce, then the continuation.
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
    for (const thrall of thralls) {
      const answer = (await decisions.request({
        type: "reaction",
        playerId: player.id,
        chooserTeamId: player.teamId,
        skill: SkillType.BLOODLUST,
        prompt: `Bloodlust: ${player.playerName} bites ${thrall.playerName}?`,
      })) as ReactionDecisionAnswer;
      if (answer.accept) return thrall;
    }
    return undefined;
  }
}

function holdsBall(context: FlowContext, player: Player): boolean {
  const ball = context.gameService.getState().ballPosition;
  return (
    !!ball &&
    !!player.gridPosition &&
    ball.x === player.gridPosition.x &&
    ball.y === player.gridPosition.y
  );
}
