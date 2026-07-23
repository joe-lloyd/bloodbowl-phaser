import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus, Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";
import { GameConfig } from "../../config/GameConfig";
import {
  BlockResolutionService,
  BlockResult,
  BlockResultType,
} from "../../services/BlockResolutionService";
import { pushBackSquares } from "../rules/jump";
import { ArmourOperation } from "./ArmourOperation";
import { InjuryOperation } from "./InjuryOperation";
import { BounceOperation } from "./BounceOperation";
import { CrowdInjuryOperation } from "./CrowdInjuryOperation";

/** Ends the Fanatic's activation once the Ball & Chain lurch has settled. */
class FinishBallAndChainOperation extends GameOperation {
  public readonly name = "FinishBallAndChain";

  constructor(private playerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.playerId);
  }
}

/**
 * The eight compass directions, clockwise from North, so a ±1 index step is a
 * 45° rotation (the throw-in template's two side arrows).
 */
const DIRS: { x: number; y: number }[] = [
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
 * Block dice for a Ball & Chain collision. The Fanatic (ST 7) is the attacker;
 * a stronger opponent flips the choice to the defender per the standard bands.
 */
function blockDice(attackerST: number, defenderST: number): {
  count: number;
  attackerChoice: boolean;
} {
  if (attackerST > 2 * defenderST) return { count: 3, attackerChoice: true };
  if (attackerST > defenderST) return { count: 2, attackerChoice: true };
  if (defenderST > 2 * attackerST) return { count: 3, attackerChoice: false };
  if (defenderST > attackerST) return { count: 2, attackerChoice: false };
  return { count: 1, attackerChoice: true };
}

/** Priority best→worst for the attacker; the chooser picks their extreme. */
const BLOCK_PRIORITY: BlockResultType[] = [
  "pow",
  "pow-dodge",
  "push",
  "both-down",
  "skull",
];

function pickResult(
  results: BlockResult[],
  attackerChoice: boolean
): BlockResult {
  const order = attackerChoice
    ? BLOCK_PRIORITY
    : [...BLOCK_PRIORITY].reverse();
  for (const type of order) {
    const r = results.find((res) => res.type === type);
    if (r) return r;
  }
  return results[0];
}

/**
 * Ball & Chain Special Action (2025 rulebook, Fanatic trait)
 *
 * "Position the Throw-in Template over this player so it faces one of the two
 * End Zones or either Sideline. Then roll a D6 and move this player into the
 * square as indicated by the Throw-in Template." The Fanatic lurches up to its
 * MA squares in a chosen facing, deviating each square by the throw-in template
 * (a D6: 1-2 / 3-4 / 5-6 → left / straight / right). It dodges automatically,
 * and each square it enters:
 *   - off the pitch → Injury by the Crowd (a Turnover), the lurch ends;
 *   - a Standing player (either team) → an automatic Block (ignores Foul
 *     Appearance); on a Push the Fanatic follows up, on a knockdown it stops;
 *   - a Prone / Stunned player → that player is Pushed Back + an Armour Roll;
 *   - the ball → it Bounces (never a Turnover).
 * If the Fanatic is Knocked Down / Falls Over for any reason it takes an
 * immediate Injury Roll (no Armour Roll) and the lurch ends in a Turnover.
 *
 * NOT modelled yet (documented in ai_notes): Rushing past MA (double-1 fall);
 * the interactive coach choice of block result and team re-rolls / block-skill
 * folds (the Fanatic auto-takes the attacker's-choice best die); re-steering
 * the facing every square (one facing is chosen for the whole action); and the
 * Injury-Roll "treat Stunned as Knocked-out" upgrade (a plain Injury Roll is
 * made). Shadowing / Tentacles suppression is inherent — a Ball & Chain move
 * never triggers an opponent's reaction.
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

    const facing = toCardinalIndex(this.facingX, this.facingY);
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${fanatic.playerName} swings the ball and chain!`
    );
    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: fanatic.id,
      skill: SkillType.BALL_AND_CHAIN,
      effect: "Ball & Chain Special Action",
    });

    const steps = fanatic.stats.MA;
    for (let i = 0; i < steps; i++) {
      // Still Standing and on the pitch?
      if (
        !fanatic.gridPosition ||
        fanatic.status !== PlayerStatus.ACTIVE
      ) {
        break;
      }

      await context.delay(400);

      // Throw-in template: 1-2 → left arrow, 3-4 → straight, 5-6 → right arrow.
      const roll = dice.rollD6("Ball & Chain Deviation", fanatic.teamId);
      const offset = roll <= 2 ? -1 : roll <= 4 ? 0 : 1;
      const dir = DIRS[(facing + offset + 8) % 8];
      const from = { ...fanatic.gridPosition };
      const next = { x: from.x + dir.x, y: from.y + dir.y };

      const ended = await this.stepInto(context, fanatic, from, next);
      if (ended) {
        return; // crowd / self-knockdown queued the finish + turnover already
      }
    }

    context.flowManager.add(new FinishBallAndChainOperation(this.fanaticId));
  }

  /**
   * Resolve the Fanatic lurching from `from` into `next`. Returns true when the
   * lurch has ended the activation (off-pitch crowd surf, or the Fanatic went
   * down) so the caller stops iterating.
   */
  private async stepInto(
    context: FlowContext,
    fanatic: Player,
    from: { x: number; y: number },
    next: { x: number; y: number }
  ): Promise<boolean> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;

    // Off the pitch → Injury by the Crowd (a Turnover).
    if (!this.inBounds(next.x, next.y)) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${fanatic.playerName} lurches off the pitch!`
      );
      fanatic.gridPosition = undefined;
      context.flowManager.add(
        new CrowdInjuryOperation(fanatic.id, from, true),
        true
      );
      context.flowManager.add(new FinishBallAndChainOperation(this.fanaticId));
      return true;
    }

    const occupant = gameService.getPlayerAt(next.x, next.y);

    if (occupant && occupant.status === PlayerStatus.ACTIVE) {
      // A Standing player → an automatic Block Action.
      return this.autoBlock(context, fanatic, from, next, occupant);
    }

    if (
      occupant &&
      (occupant.status === PlayerStatus.PRONE ||
        occupant.status === PlayerStatus.STUNNED)
    ) {
      // A Prone / Stunned player is Pushed Back and takes an Armour Roll.
      this.pushBack(context, from, next, occupant);
      this.moveTo(context, fanatic, from, next);
      return false;
    }

    // Ball in the square → it Bounces (never a Turnover); then move in.
    const ball = gameService.getState().ballPosition;
    if (ball && ball.x === next.x && ball.y === next.y) {
      context.flowManager.add(new BounceOperation({ ...next }), true);
    }
    this.moveTo(context, fanatic, from, next);
    return false;
  }

  /**
   * The Fanatic auto-blocks the Standing player in `next`. Attacker's-choice
   * best die (Foul Appearance ignored, no interactive choice). On a Push the
   * target is shoved back and the Fanatic follows up; on a knockdown the target
   * goes down where it stands; Both Down / Attacker Down fell the Fanatic.
   */
  private async autoBlock(
    context: FlowContext,
    fanatic: Player,
    from: { x: number; y: number },
    next: { x: number; y: number },
    target: Player
  ): Promise<boolean> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const dice = gameService.getDiceController();

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${fanatic.playerName} smashes into ${target.playerName}!`
    );

    const { count, attackerChoice } = blockDice(
      fanatic.stats.ST,
      target.stats.ST
    );
    const results: BlockResult[] = [];
    for (let i = 0; i < count; i++) {
      const r = dice.rollD6("Ball & Chain Block", fanatic.teamId);
      results.push(BlockResolutionService.mapRollToResult(r));
    }
    const chosen = pickResult(results, attackerChoice);

    const fanaticDown = chosen.type === "both-down" || chosen.type === "skull";
    const targetDown =
      chosen.type === "pow" ||
      chosen.type === "pow-dodge" ||
      chosen.type === "both-down";
    const push = chosen.type === "push";

    if (targetDown) {
      this.knockDown(context, target);
      context.flowManager.add(
        new ArmourOperation(target.id, fanatic.id, undefined, "block"),
        true
      );
    } else if (push) {
      this.pushBack(context, from, next, target);
      // The pushed square is now empty — the Fanatic follows up into it.
      this.moveTo(context, fanatic, from, next);
    }

    if (fanaticDown) {
      // The Fanatic falls: an immediate Injury Roll (no Armour) and a Turnover.
      this.fellOver(context, fanatic);
      return true;
    }

    return false;
  }

  /**
   * Push a player out of `square` (relative to `from`) into their first free
   * push-back square; off the pitch is the crowd. Prone/Stunned targets also
   * take an Armour Roll from the shove.
   */
  private pushBack(
    context: FlowContext,
    from: { x: number; y: number },
    square: { x: number; y: number },
    target: Player
  ): void {
    const gameService = context.gameService as IGameService;
    const candidates = pushBackSquares(from, square);

    const free = candidates.find(
      (c) =>
        this.inBounds(c.x, c.y) && !gameService.getPlayerAt(c.x, c.y)
    );
    const offPitch = candidates.find((c) => !this.inBounds(c.x, c.y));

    const isDown =
      target.status === PlayerStatus.PRONE ||
      target.status === PlayerStatus.STUNNED;

    if (!free && offPitch) {
      // Shoved into the crowd.
      target.gridPosition = undefined;
      context.flowManager.add(
        new CrowdInjuryOperation(target.id, { ...square }, false),
        true
      );
      return;
    }

    const dest = free ?? { ...square }; // fully boxed in → stays put (rare)
    if (free) {
      target.gridPosition = { ...dest };
      context.eventBus.emit(GameEventNames.PlayerMoved, {
        playerId: target.id,
        from: { ...square },
        to: { ...dest },
        path: [{ ...dest }],
      });
      context.eventBus.emit(GameEventNames.PlayerStatusChanged, target);
    }
    if (isDown) {
      context.flowManager.add(
        new ArmourOperation(target.id, this.fanaticId, undefined, "block"),
        true
      );
    }
  }

  /** Knock a player down in place (Prone + events + drop a carried ball). */
  private knockDown(context: FlowContext, player: Player): void {
    const gameService = context.gameService as IGameService;
    player.status = PlayerStatus.PRONE;
    context.eventBus.emit(GameEventNames.PlayerKnockedDown, {
      playerId: player.id,
    });
    context.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    const ball = gameService.getState().ballPosition;
    if (
      ball &&
      player.gridPosition &&
      ball.x === player.gridPosition.x &&
      ball.y === player.gridPosition.y
    ) {
      context.flowManager.add(
        new BounceOperation({ ...player.gridPosition }),
        true
      );
    }
  }

  /**
   * The Fanatic falls over: Prone, an immediate Injury Roll (no Armour Roll,
   * per the trait), a Turnover, and the activation ends.
   */
  private fellOver(context: FlowContext, fanatic: Player): void {
    fanatic.status = PlayerStatus.PRONE;
    context.eventBus.emit(GameEventNames.PlayerKnockedDown, {
      playerId: fanatic.id,
    });
    context.eventBus.emit(GameEventNames.PlayerStatusChanged, fanatic);
    context.flowManager.add(new InjuryOperation(fanatic.id), true);
    context.gameService.triggerTurnover("Ball & Chain fell over");
    context.flowManager.add(new FinishBallAndChainOperation(this.fanaticId));
  }

  /** Move the Fanatic from `from` to `to`, emitting the movement tween. */
  private moveTo(
    context: FlowContext,
    fanatic: Player,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): void {
    fanatic.gridPosition = { ...to };
    context.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId: fanatic.id,
      from: { ...from },
      to: { ...to },
      path: [{ ...to }],
    });
  }

  private inBounds(x: number, y: number): boolean {
    return (
      x >= 0 &&
      y >= 0 &&
      x < GameConfig.PITCH_WIDTH &&
      y < GameConfig.PITCH_HEIGHT
    );
  }
}
