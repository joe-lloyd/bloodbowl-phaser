import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { GameConfig } from "../../config/GameConfig";
import { GameEventNames } from "../../types/events";
import { SkillType, hasSkill } from "../../types/Skills";
import { ReactionDecisionAnswer } from "../../types/decisions";
import { BounceOperation } from "./BounceOperation";
import { CatchOperation } from "./CatchOperation";
import {
  awaitPresentation,
  nextPresentationId,
} from "../presentation/presentationGate";

/** Upper bound on the graphical kick animation before the flow moves on. */
const PUNT_PRESENTATION_TIMEOUT_MS = 1500;

const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

const sign = (value: number) => (value > 0 ? 1 : value < 0 ? -1 : 0);

function facingIndex(dx: number, dy: number): number {
  const sx = sign(dx);
  const sy = sign(dy);
  if (sx !== 0 && Math.abs(dx) >= Math.abs(dy)) return sx > 0 ? 2 : 6;
  if (sy !== 0) return sy > 0 ? 4 : 0;
  return 2;
}

class FinishPuntOperation extends GameOperation {
  public readonly name = "FinishPunt";
  constructor(private playerId: string) {
    super();
  }
  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.playerId);
  }
}

class PuntPossessionCheckOperation extends GameOperation {
  public readonly name = "PuntPossessionCheck";
  constructor(
    private punterTeamId: string,
    private landingPlayerId: string
  ) {
    super();
  }
  async execute(context: FlowContext): Promise<void> {
    const player = context.gameService.getPlayerById(this.landingPlayerId);
    const ball = context.gameService.getState().ballPosition;
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

/** Punt (2025 p.132): throw-in template direction and D6 distance. */
export class PuntOperation extends GameOperation {
  public readonly name = "PuntOperation";

  constructor(
    private playerId: string,
    private facingX: number,
    private facingY: number
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;
    const punter = gameService.getPlayerById(this.playerId);
    if (
      !punter?.gridPosition ||
      !hasSkill(punter.skills, SkillType.PUNT) ||
      gameService.getState().ballPosition?.x !== punter.gridPosition.x ||
      gameService.getState().ballPosition?.y !== punter.gridPosition.y
    ) {
      return;
    }

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

    const facing = facingIndex(this.facingX, this.facingY);
    const offset = directionRoll <= 2 ? -1 : directionRoll <= 4 ? 0 : 1;
    const direction = DIRS[(facing + offset + 8) % 8];
    const from = { ...punter.gridPosition };
    let landing = { ...from };
    let intoCrowd = false;
    for (let step = 0; step < distance; step++) {
      landing = {
        x: landing.x + direction.x,
        y: landing.y + direction.y,
      };
      if (
        landing.x < 0 ||
        landing.x >= GameConfig.PITCH_WIDTH ||
        landing.y < 0 ||
        landing.y >= GameConfig.PITCH_HEIGHT
      ) {
        intoCrowd = true;
        break;
      }
    }

    // Presentation boundary. Every die this Punt needs has been rolled and the
    // destination is fixed, but NOTHING has moved yet: a graphical client
    // plays the kick here, a headless client auto-acknowledges. Because the
    // outcome is decided before the boundary and committed after it, the wait
    // can never re-roll the Punt — and because the wait happens inside a flow
    // operation, every save path (which drains the flow queue first) sees
    // either the pre-Punt or the post-Punt board, never a half-kicked one.
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
        effect: `Punt: ${distance} squares into the crowd`,
      });
      gameService.triggerTurnover("Punt entered the crowd");
      gameService.throwInBall({
        x: landing.x - direction.x,
        y: landing.y - direction.y,
      });
      flowManager.add(new FinishPuntOperation(punter.id));
      return;
    }

    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: punter.id,
      skill: SkillType.PUNT,
      effect: `Punt: ${distance} squares via the Throw-in Template`,
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
        new CatchOperation(landingPlayer.id, false, { origin: "throw-in" }),
        true
      );
      flowManager.add(
        new PuntPossessionCheckOperation(punter.teamId, landingPlayer.id)
      );
    } else {
      // A loose ball at rest is explicitly not a Turnover.
      flowManager.add(new BounceOperation(landing), true);
    }
    flowManager.add(new FinishPuntOperation(punter.id));
  }
}
