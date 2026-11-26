import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { type Player, PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { GameEventNames } from "../../types/events";
import { type ReactionDecisionAnswer } from "../../types/decisions";
import { FoulOperation } from "./FoulOperation";
import { BounceOperation } from "./BounceOperation";
import { InjuryOperation } from "./InjuryOperation";

interface Square {
  x: number;
  y: number;
}

function canPileDrive(
  attacker: Player,
  from: Square,
  defender: Player,
  to: Square
): boolean {
  const downed =
    defender.status === PlayerStatus.PRONE ||
    defender.status === PlayerStatus.STUNNED;
  const adjacent =
    Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1;
  return attacker.status === PlayerStatus.ACTIVE && downed && adjacent;
}

function dropHeldBall(context: FlowContext, attacker: Player): void {
  const ball = groundBall(context.gameService.getState());
  const at = attacker.gridPosition;
  if (!(at && ball?.x === at.x && ball.y === at.y)) {
    return;
  }

  context.flowManager.add(new BounceOperation({ ...at }), true);
  context.gameService.triggerTurnover(
    "Pile Driver: the ball carrier was Placed Prone"
  );
}

export class PileDriverOperation extends GameOperation {
  public readonly name = "PileDriverOperation";

  private attackerId: string;
  private defenderId: string;
  private resume: () => void;
  constructor(attackerId: string, defenderId: string, resume: () => void) {
    super();
    this.attackerId = attackerId;
    this.defenderId = defenderId;
    this.resume = resume;
  }

  async execute(context: FlowContext): Promise<void> {
    const attacker = context.gameService.getPlayerById(this.attackerId);
    const defender = context.gameService.getPlayerById(this.defenderId);
    if (
      !attacker?.gridPosition ||
      !defender?.gridPosition ||
      !canPileDrive(
        attacker,
        attacker.gridPosition,
        defender,
        defender.gridPosition
      )
    ) {
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
      if (hasSkill(attacker.skills, SkillType.BALL_AND_CHAIN)) {
        await context.flowManager.runToRest(
          new InjuryOperation(attacker.id, { stunnedIsKnockedOut: true })
        );
      }
      dropHeldBall(context, attacker);
    }
    context.gameService.finishActivation(attacker.id);
    if (context.gameService.getState().activePlayer?.id === attacker.id) {
      context.gameService.getState().activePlayer = null;
    }
  }
}
