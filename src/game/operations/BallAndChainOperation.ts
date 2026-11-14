import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { GamePhase } from "../../types/GameState";
import { IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus, Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";
import { GameConfig } from "../../config/GameConfig";
import { withRerollOffer } from "../skills";
import { moveAllowance } from "../skills/movement";
import { rushModifier } from "../inducements/matchInducements";
import { withDriveModifiers } from "../kickoff/driveEffects";
import { ArmourOperation } from "./ArmourOperation";
import { InjuryOperation } from "./InjuryOperation";
import { BounceOperation } from "./BounceOperation";
import { CrowdInjuryOperation } from "./CrowdInjuryOperation";

/**
 * The eight compass directions, clockwise from North, so a ±1 index step is a
 * 45° rotation (the throw-in template's two side arrows).
 */
export const DIRS: { x: number; y: number }[] = [
  { x: 0, y: -1 }, // N
  { x: 1, y: -1 }, // NE
  { x: 1, y: 0 }, // E
  { x: 1, y: 1 }, // SE
  { x: 0, y: 1 }, // S
  { x: -1, y: 1 }, // SW
  { x: -1, y: 0 }, // W
  { x: -1, y: -1 }, // NW
];

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Snap any direction to the nearest cardinal facing (x-axis wins on a tie). */
function toCardinalIndex(dx: number, dy: number): number {
  const sx = sign(dx);
  const sy = sign(dy);
  if (sx !== 0 && Math.abs(dx) >= Math.abs(dy)) return sx > 0 ? 2 : 6; // E / W
  if (sy !== 0) return sy > 0 ? 4 : 0; // S / N
  return 2; // default East
}

/**
 * One square of a Ball & Chain lurch whose collision the block engine is
 * resolving. The engine ends a Block by finishing the activation; for the
 * Fanatic that finishes the square instead (FinishBallAndChainSquare).
 */
export interface BallAndChainSquare {
  fanaticId: string;
  /** The Rush into this square failed: Fall Over once it has resolved. */
  rushFailed: boolean;
  /** A Prone or Stunned player pushed out of the square: owed an Armour Roll. */
  pushedDownId?: string;
}

/**
 * Ball & Chain Special Action (2025 rulebook p.124), one square per call:
 * "position the Throw-in Template over this player so it faces one of the
 * two End Zones or either Sideline. Then roll a D6 and move this player into
 * the square as indicated by the Throw-in Template." The coach picks the
 * facing again for every square, up to MA and then Rushing as normal. The
 * Fanatic dodges automatically, and the square it enters decides the rest:
 *   - off the pitch: Pushed into the Crowd, a Turnover (May 2026 FAQ);
 *   - a Standing player of either team: a normal Block Action, ignoring Foul
 *     Appearance, with the coach choosing the die against a team-mate. The
 *     Fanatic moves into the square if the Block empties it, otherwise it
 *     stays put and the square still counts (FAQ, Stand Firm);
 *   - a Prone or Stunned player: Pushed Back, then an Armour Roll;
 *   - the ball: it Bounces, never a Turnover.
 * A failed Rush resolves the square first, then the Fanatic Falls Over in
 * it. Knocked Down, Falling Over or Placed Prone, it takes an Injury Roll
 * with no Armour Roll, Stunned counting as Knocked-out (see ArmourOperation).
 * Shadowing and Tentacles never react: the lurch is not a Move Action.
 */
export class BallAndChainOperation extends GameOperation {
  public readonly name = "BallAndChainOperation";

  constructor(
    private fanaticId: string,
    private facingX: number,
    private facingY: number
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const dice = gameService.getDiceController();

    const fanatic = gameService.getPlayerById(this.fanaticId);
    if (!fanatic?.gridPosition) return;
    if (fanatic.status !== PlayerStatus.ACTIVE) {
      eventBus.emit(GameEventNames.UI_Notification, "The Fanatic must be Standing!");
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

    // Past MA the square is a Rush: a failure still moves in first
    let rushFailed = false;
    if (moved + 1 > effective.stats.MA) {
      const check = await withRerollOffer(
        { gameService, eventBus },
        fanatic,
        "rush",
        () =>
          dice.rollSkillCheck(
            "Rush",
            2,
            rushModifier(gameService.getState(), fanatic),
            fanatic.playerName
          )
      );
      rushFailed = !check.success;
    }

    await context.delay(400);
    // Throw-in template: 1-2 → left arrow, 3-4 → straight, 5-6 → right arrow.
    const facing = toCardinalIndex(this.facingX, this.facingY);
    const roll = dice.rollD6("Ball & Chain Deviation", fanatic.teamId);
    const offset = roll <= 2 ? -1 : roll <= 4 ? 0 : 1;
    const dir = DIRS[(facing + offset + 8) % 8];
    const from = { ...fanatic.gridPosition };
    const next = { x: from.x + dir.x, y: from.y + dir.y };
    const square: BallAndChainSquare = { fanaticId: fanatic.id, rushFailed };

    // Off the pitch: Pushed into the Crowd, which is a Turnover
    if (!inBounds(next)) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${fanatic.playerName} lurches off the pitch!`
      );
      fanatic.gridPosition = undefined;
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
      // Prone or Stunned: Pushed Back, then the Armour Roll
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

/**
 * Ends one square of the lurch once everything it set off has come to rest:
 * a pushed Prone player's Armour Roll, then a failed Rush's fall. The
 * activation goes on while the Fanatic is Standing with squares left, the
 * coach picking the next facing; otherwise it ends here.
 */
export class FinishBallAndChainSquare extends GameOperation {
  public readonly name = "FinishBallAndChainSquare";

  constructor(private square: BallAndChainSquare) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
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
    // A ball caught in an End Zone mid-lurch scores and ends the drive
    if (gameService.getPhase() !== GamePhase.PLAY) return;

    const standing = () =>
      !!fanatic.gridPosition && fanatic.status === PlayerStatus.ACTIVE;
    if (this.square.rushFailed && standing()) {
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

/** Enter a square, including one vacated by a Block: Bounce, never pick up. */
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
  const ball = context.gameService.getState().ballPosition;
  if (ball?.x === to.x && ball.y === to.y) {
    await context.flowManager.runToRest(new BounceOperation({ ...to }));
  }
}

function inBounds({ x, y }: { x: number; y: number }): boolean {
  return (
    x >= 0 && y >= 0 && x < GameConfig.PITCH_WIDTH && y < GameConfig.PITCH_HEIGHT
  );
}
