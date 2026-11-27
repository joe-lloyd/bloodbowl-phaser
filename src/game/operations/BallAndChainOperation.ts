import { activeRules } from "@/game/variants/activeMatch";
import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { GamePhase } from "../../types/GameState";
import { PlayerStatus, type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { isOnPitch } from "../rules/pitchSquares";
import { withRerollOffer } from "../skills";
import { moveAllowance } from "../skills/movement";
import { rushModifier } from "../inducements/matchInducements";
import { withDriveModifiers } from "../kickoff/driveEffects";
import { ArmourOperation } from "./ArmourOperation";
import { InjuryOperation } from "./InjuryOperation";
import { BounceOperation } from "./BounceOperation";
import { CrowdInjuryOperation } from "./CrowdInjuryOperation";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { DIRS, templateOffset, toCardinalIndex } from "./throwInTemplate";

export interface BallAndChainSquare {
  fanaticId: string;

  rushFailed: boolean;

  pushedDownId?: string;
}

export class BallAndChainOperation extends GameOperation {
  public readonly name = "BallAndChainOperation";

  private fanaticId: string;
  private facingX: number;
  private facingY: number;
  constructor(fanaticId: string, facingX: number, facingY: number) {
    super();
    this.fanaticId = fanaticId;
    this.facingX = facingX;
    this.facingY = facingY;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;
    const dice = gameService.getDiceController();

    const fanatic = gameService.getPlayerById(this.fanaticId);
    if (!fanatic?.gridPosition) return;
    if (gameService.isTurnoverInProgress()) return;
    const active = gameService.getState().activePlayer;
    if (active?.id !== fanatic.id || active.action !== "ballAndChain") return;
    if (fanatic.status !== PlayerStatus.ACTIVE) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        "The Fanatic must be Standing!"
      );
      return;
    }
    if (!hasSkill(fanatic.skills, SkillType.BALL_AND_CHAIN)) return;

    const moved = gameService.getMovementUsed(fanatic.id);
    const effective = withDriveModifiers(fanatic, gameService.getState());
    if (moved >= moveAllowance(effective)) return;
    if (moved === 0) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${fanatic.playerName} swings the ball and chain!`
      );
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: fanatic.id,
        skill: SkillType.BALL_AND_CHAIN,
        effect: "Ball & Chain Special Action",
      });
    }
    gameService.commitAction(fanatic.id);
    gameService.getState().turn.movementUsed.set(fanatic.id, moved + 1);

    let rushFailed = false;
    if (moved + 1 > effective.stats.MA) {
      const check = await withRerollOffer(
        { gameService, eventBus },
        fanatic,
        "rush",
        () =>
          dice.rollSkillCheck(
            { reason: "Rush",target: activeRules().rushTarget,modifier: rushModifier(gameService.getState(),fanatic),playerName: fanatic.playerName }          )
      );
      rushFailed = !check.success;
    }

    await context.delay(400);

    const facing = toCardinalIndex(this.facingX, this.facingY);
    const roll = dice.rollD6("Ball & Chain Deviation", fanatic.teamId);
    const offset = templateOffset(roll);
    const dir = DIRS[(facing + offset + 8) % 8];
    if (!dir)
      throw new Error(`No Ball & Chain direction for facing ${String(facing)}`);
    const from = { ...fanatic.gridPosition };
    const next = { x: from.x + dir.x, y: from.y + dir.y };
    const square: BallAndChainSquare = { fanaticId: fanatic.id, rushFailed };

    if (!isOnPitch(next)) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${fanatic.playerName} lurches off the pitch!`
      );
      delete fanatic.gridPosition;
      eventBus.emit(GameEventNames.PlayerPushedIntoCrowd, {
        playerId: fanatic.id,
        exitSquare: from,
      });
      context.flowManager.add(
        new CrowdInjuryOperation(fanatic.id, from, true),
        true
      );
      context.flowManager.add(new FinishBallAndChainSquare(square));
      return;
    }

    const occupant = gameService.getPlayerAt(next.x, next.y);
    if (occupant?.status === PlayerStatus.ACTIVE) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${fanatic.playerName} smashes into ${occupant.playerName}!`
      );
      await gameService.ballAndChainCollision(square, occupant.id);
      return;
    }
    if (occupant) {
      await gameService.ballAndChainCollision(
        { ...square, pushedDownId: occupant.id },
        occupant.id
      );
      return;
    }

    await moveBallAndChain(context, fanatic, next);
    context.flowManager.add(new FinishBallAndChainSquare(square));
  }
}

export class FinishBallAndChainSquare extends GameOperation {
  public readonly name = "FinishBallAndChainSquare";

  private square: BallAndChainSquare;
  constructor(square: BallAndChainSquare) {
    super();
    this.square = square;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const { eventBus, flowManager } = context;
    const fanatic = gameService.getPlayerById(this.square.fanaticId);
    if (!fanatic) return;

    const pushed = this.square.pushedDownId
      ? gameService.getPlayerById(this.square.pushedDownId)
      : undefined;
    if (pushed?.gridPosition) {
      await flowManager.runToRest(
        new ArmourOperation(pushed.id, fanatic.id, undefined, "block")
      );
    }

    if (gameService.getPhase() !== GamePhase.PLAY) return;

    const standing = () =>
      !!fanatic.gridPosition && fanatic.status === PlayerStatus.ACTIVE;

    if (
      this.square.rushFailed &&
      standing() &&
      !(await steadyFootingSaves(
        fanatic,
        gameService.getDiceController(),
        eventBus,
        gameService
      ))
    ) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${fanatic.playerName} falls over!`
      );
      fanatic.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: fanatic.id });
      eventBus.emit(GameEventNames.PlayerStatusChanged, fanatic);
      await flowManager.runToRest(
        new InjuryOperation(fanatic.id, { stunnedIsKnockedOut: true })
      );
      gameService.triggerTurnover("Ball & Chain fell over");
    }

    const left =
      moveAllowance(withDriveModifiers(fanatic, gameService.getState())) -
      gameService.getMovementUsed(fanatic.id);
    if (standing() && left > 0 && !gameService.isTurnoverInProgress()) {
      eventBus.emit(GameEventNames.PlayerMovedInAction, {
        playerId: fanatic.id,
      });
      eventBus.emit(GameEventNames.UI_ResumeBallAndChain, {
        playerId: fanatic.id,
      });
      return;
    }
    gameService.finishActivation(fanatic.id);
  }
}

export async function moveBallAndChain(
  context: FlowContext,
  fanatic: Player,
  to: { x: number; y: number }
): Promise<void> {
  const from = fanatic.gridPosition;
  if (!from) return;
  fanatic.gridPosition = { ...to };
  context.eventBus.emit(GameEventNames.PlayerMoved, {
    playerId: fanatic.id,
    from: { ...from },
    to: { ...to },
    path: [{ ...to }],
  });
  const ball = groundBall(context.gameService.getState());
  if (ball?.x === to.x && ball.y === to.y) {
    await context.flowManager.runToRest(new BounceOperation({ ...to }));
  }
}

