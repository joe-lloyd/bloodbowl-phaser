import { ballOnSquare, groundBall } from "@/game/rules/ballInTheAir";
import { activationLost } from "../rules/activationLost";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { isOnPitch } from "../rules/pitchSquares";
import { settleOffObstacle } from "../rules/ballFlight";
import { GameEventNames } from "../../types/events";
import { SkillType, hasSkill } from "../../types/Skills";
import { type Player } from "../../types/Player";
import { type ReactionDecisionAnswer } from "../../types/decisions";
import { BounceOperation } from "./BounceOperation";
import { CatchOperation } from "./CatchOperation";
import { FinishActivationOperation } from "./FinishActivationOperation";
import { DIRS, templateOffset, toCardinalIndex } from "./throwInTemplate";
import {
  awaitPresentation,
  nextPresentationId,
} from "../presentation/presentationGate";

const PUNT_PRESENTATION_TIMEOUT_MS = 1500;

class PuntPossessionCheckOperation extends GameOperation {
  public readonly name = "PuntPossessionCheck";
  private punterTeamId: string;
  private landingPlayerId: string;
  constructor(punterTeamId: string, landingPlayerId: string) {
    super();
    this.punterTeamId = punterTeamId;
    this.landingPlayerId = landingPlayerId;
  }
  async execute(context: FlowContext): Promise<void> {
    const player = context.gameService.getPlayerById(this.landingPlayerId);
    const ball = groundBall(context.gameService.getState());
    if (
      player?.teamId !== this.punterTeamId &&
      player?.gridPosition &&
      ball?.x === player.gridPosition.x &&
      ball?.y === player.gridPosition.y
    ) {
      context.gameService.triggerTurnover("Opposition caught the Punt");
    }
  }
}

interface Square {
  x: number;
  y: number;
}

function canPunt(
  punter: Player,
  at: Square,
  gameService: FlowContext["gameService"]
): boolean {
  return (
    !activationLost(gameService, punter.id) &&
    hasSkill(punter.skills, SkillType.PUNT) &&
    ballOnSquare(gameService.getState(), at)
  );
}

function puntFlight(
  from: Square,
  { direction, distance }: { direction: Square; distance: number },
  dice: Parameters<typeof settleOffObstacle>[0]
): { landing: Square; intoCrowd: boolean } {
  let landing = { ...from };
  for (let step = 0; step < distance; step++) {
    landing = {
      x: landing.x + direction.x,
      y: landing.y + direction.y,
    };
    if (!isOnPitch(landing)) return { landing, intoCrowd: true };
  }
  return { landing: settleOffObstacle(dice, landing), intoCrowd: false };
}

export class PuntOperation extends GameOperation {
  public readonly name = "PuntOperation";

  private playerId: string;
  private facingX: number;
  private facingY: number;
  constructor(playerId: string, facingX: number, facingY: number) {
    super();
    this.playerId = playerId;
    this.facingX = facingX;
    this.facingY = facingY;
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;
    const punter = gameService.getPlayerById(this.playerId);
    if (!punter?.gridPosition) return;
    if (!canPunt(punter, punter.gridPosition, gameService)) return;

    const dice = gameService.getDiceController();
    let directionRoll = dice.rollD6("Punt Direction", punter.teamId);
    let distance = dice.rollD6("Punt Distance", punter.teamId);

    if (hasSkill(punter.skills, SkillType.KICK)) {
      const directionAnswer = (await gameService.getDecisionService().request({
        type: "reaction",
        playerId: punter.id,
        chooserTeamId: punter.teamId,
        skill: SkillType.KICK,
        prompt: "Use Kick to re-roll the Punt direction?",
      })) as ReactionDecisionAnswer;
      if (directionAnswer.accept) {
        directionRoll = dice.rollD6("Punt Direction Re-roll", punter.teamId);
      }
      const distanceAnswer = (await gameService.getDecisionService().request({
        type: "reaction",
        playerId: punter.id,
        chooserTeamId: punter.teamId,
        skill: SkillType.KICK,
        prompt: "Use Kick to re-roll the Punt distance?",
      })) as ReactionDecisionAnswer;
      if (distanceAnswer.accept) {
        distance = dice.rollD6("Punt Distance Re-roll", punter.teamId);
      }
    }

    const facing = toCardinalIndex(this.facingX, this.facingY);
    const direction = DIRS[(facing + templateOffset(directionRoll) + 8) % 8];
    if (!direction)
      throw new Error(`No Punt direction for facing ${String(facing)}`);
    const from = { ...punter.gridPosition };
    const { landing, intoCrowd } = puntFlight(
      from,
      { direction, distance },
      dice
    );

    const presentationId = nextPresentationId("punt");
    eventBus.emit(GameEventNames.PuntDeclared, {
      playerId: punter.id,
      presentationId,
      from,
      direction: { ...direction },
      distance,
      landing: { ...landing },
      intoCrowd,
    });
    await awaitPresentation(
      eventBus,
      context.delay,
      presentationId,
      PUNT_PRESENTATION_TIMEOUT_MS
    );

    if (intoCrowd) {
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: punter.id,
        skill: SkillType.PUNT,
        effect: `Punt: ${String(distance)} squares into the crowd`,
      });
      gameService.triggerTurnover("Punt entered the crowd");
      gameService.throwInBall(
        { x: landing.x - direction.x, y: landing.y - direction.y },
        landing
      );
      flowManager.add(new FinishActivationOperation("FinishPunt", punter.id));
      return;
    }

    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: punter.id,
      skill: SkillType.PUNT,
      effect: `Punt: ${String(distance)} squares via the Throw-in Template`,
    });
    eventBus.emit(GameEventNames.PassAttempted, {
      playerId: punter.id,
      from,
      to: landing,
      passType: "Punt",
      accurate: false,
      finalPosition: landing,
    });
    gameService.setBallPosition(landing.x, landing.y);

    const landingPlayer = gameService.getPlayerAt(landing.x, landing.y);
    if (landingPlayer) {
      flowManager.add(
        new CatchOperation(landingPlayer.id, { origin: "throw-in" }),
        true
      );
      flowManager.add(
        new PuntPossessionCheckOperation(punter.teamId, landingPlayer.id)
      );
    } else {
      flowManager.add(new BounceOperation(landing), true);
    }
    flowManager.add(new FinishActivationOperation("FinishPunt", punter.id));
  }
}
