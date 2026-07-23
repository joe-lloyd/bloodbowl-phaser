import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus, Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";
import { GameConfig } from "../../config/GameConfig";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";
import { InterceptionDecisionAnswer } from "../../types/decisions";

/** Ends the Bomber's activation once the bomb (and its blast) has settled. */
class FinishBombOperation extends GameOperation {
  public readonly name = "FinishBomb";

  constructor(private throwerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.throwerId);
  }
}

/**
 * Bombardier — Throw Bomb Special Action (2025 rulebook, Bombardier trait)
 *
 * "They throw a bomb in the same manner as when a player performs a Pass
 * Action, following all the usual rules for a Pass Action." The bomb is NOT
 * the ball — it is a separate projectile that never Bounces:
 *   1. A Passing Ability Test is made from the thrower's square to the target.
 *   2. On a Fumble the bomb explodes in the thrower's own square (a Turnover).
 *   3. Otherwise it flies to the target (Accurate) or scatters (Inaccurate).
 *      A player under the Range Ruler may Intercept it — a caught/intercepted
 *      bomb must be thrown again immediately, following all the same rules.
 *   4. When the bomb comes to rest it explodes: the player in that square is
 *      hit, and each adjacent player is hit on a 4+. Standing players hit are
 *      Knocked Down; an Armour Roll is made for every player hit (including
 *      already Prone / Stunned ones).
 *
 * NOT modelled yet: the "only one Throw Bomb per team Turn" declaration limit;
 * a bomb scattering into the crowd (it is clamped to the pitch and explodes at
 * the edge); Pass-side skills that would fold onto the Passing Ability Test
 * (Accurate, Cannoneer, …) — the bomb rolls a plain PA test for now.
 */
export class BombardierOperation extends GameOperation {
  public readonly name = "BombardierOperation";

  /** Safety cap on catch/intercept re-throw chains. */
  private static readonly MAX_RETHROWS = 5;

  constructor(
    private throwerId: string,
    private targetX: number,
    private targetY: number
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;

    const thrower = gameService.getPlayerById(this.throwerId);
    if (!thrower?.gridPosition) return;
    if (thrower.status !== PlayerStatus.ACTIVE) {
      eventBus.emit(GameEventNames.UI_Notification, "The Bomber must be Standing!");
      return;
    }
    if (!hasSkill(thrower.skills, SkillType.BOMBARDIER)) return;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${thrower.playerName} lobs a bomb!`
    );
    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: thrower.id,
      skill: SkillType.BOMBARDIER,
      effect: "Throw Bomb Special Action",
    });

    await this.resolveThrow(
      context,
      this.throwerId,
      { x: this.targetX, y: this.targetY },
      0
    );

    // The activation ends once the bomb and any blast it queued have settled.
    context.flowManager.add(new FinishBombOperation(this.throwerId));
  }

  /**
   * Throw the bomb from `throwerId` at `target`, resolving the flight, any
   * interception/catch (which triggers an immediate re-throw), and the
   * explosion. Recurses for re-throws up to MAX_RETHROWS.
   */
  private async resolveThrow(
    context: FlowContext,
    throwerId: string,
    target: { x: number; y: number },
    depth: number
  ): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const passController = gameService.getPassController();
    const catchController = gameService.getCatchController();

    const thrower = gameService.getPlayerById(throwerId);
    if (!thrower?.gridPosition) return;

    await context.delay(600);

    // 1. Passing Ability Test (a plain test — bomb-side skill folds deferred).
    const opponents = gameService.getOpponents(thrower.teamId);
    const marking = catchController.countMarkingOpponents(
      thrower.gridPosition,
      opponents
    );
    const range = passController.measureRange(thrower.gridPosition, target);
    const test = passController.testAccuracy(thrower, range, marking);

    // 2. Fumble — the bomb explodes in the thrower's own square, no Bounce.
    if (test.fumbled) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `Fumble! The bomb goes off in ${thrower.playerName}'s square!`
      );
      this.explode(context, { ...thrower.gridPosition });
      gameService.triggerTurnover("Fumbled Bomb");
      return;
    }

    // 3. Determine where the bomb comes down.
    let landing = test.accurate
      ? { ...target }
      : this.scatterFrom(gameService, target);
    landing = this.clampToPitch(landing);
    eventBus.emit(
      GameEventNames.UI_Notification,
      test.accurate ? "The bomb is on target!" : "The bomb scatters!"
    );

    // Animate the bomb arcing from the thrower to its landing square.
    eventBus.emit(GameEventNames.BombThrown, {
      playerId: thrower.id,
      from: { ...thrower.gridPosition },
      to: { ...landing },
    });

    await context.delay(600);

    // 4. Interception: a player under the Range Ruler may catch the bomb in
    //    flight — and must then immediately throw it again.
    const interceptorId = await this.resolveInterception(
      context,
      thrower,
      landing,
      test.accurate
    );
    if (interceptorId) {
      await this.rethrow(context, interceptorId, depth);
      return;
    }

    // 5. Landing square.
    const occupant = gameService.getPlayerAt(landing.x, landing.y);
    if (occupant) {
      // The player in the square must try to Catch the bomb.
      const catchMarking = catchController.countMarkingOpponents(
        landing,
        gameService.getOpponents(occupant.teamId)
      );
      const result = catchController.attemptCatch(
        occupant,
        landing,
        false,
        false,
        catchMarking
      );
      if (result.success) {
        eventBus.emit(
          GameEventNames.UI_Notification,
          `${occupant.playerName} catches the bomb — and must throw it again!`
        );
        await this.rethrow(context, occupant.id, depth);
        return;
      }
      // Dropped — the bomb does not Bounce; it explodes in that square.
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${occupant.playerName} drops the bomb — it explodes!`
      );
      this.explode(context, landing);
      return;
    }

    // 6. Comes to rest on empty ground — it explodes there.
    this.explode(context, landing);
  }

  /** Throw the bomb again from a catcher/interceptor at an auto-chosen target. */
  private async rethrow(
    context: FlowContext,
    newThrowerId: string,
    depth: number
  ): Promise<void> {
    const gameService = context.gameService as IGameService;
    const newThrower = gameService.getPlayerById(newThrowerId);
    if (!newThrower?.gridPosition) return;

    if (depth + 1 >= BombardierOperation.MAX_RETHROWS) {
      // Runaway chain — drop it where it is so it resolves.
      context.eventBus.emit(
        GameEventNames.UI_Notification,
        "The bomb is dropped and explodes!"
      );
      this.explode(context, { ...newThrower.gridPosition });
      return;
    }

    await this.resolveThrow(
      context,
      newThrowerId,
      this.autoRethrowTarget(gameService, newThrower),
      depth + 1
    );
  }

  /**
   * A player forced to re-throw a caught bomb lobs it at the nearest
   * opposition player; with no opponents on the pitch, they drop it at their
   * feet (it explodes on them).
   */
  private autoRethrowTarget(
    gameService: IGameService,
    thrower: Player
  ): { x: number; y: number } {
    const here = thrower.gridPosition!;
    const enemies = gameService
      .getOpponents(thrower.teamId)
      .filter((e) => !!e.gridPosition);
    let best: { x: number; y: number } | undefined;
    let bestDist = Infinity;
    for (const e of enemies) {
      const d = Math.max(
        Math.abs(e.gridPosition!.x - here.x),
        Math.abs(e.gridPosition!.y - here.y)
      );
      if (d < bestDist) {
        bestDist = d;
        best = { ...e.gridPosition! };
      }
    }
    return best ?? { ...here };
  }

  /** Inaccurate scatter — three steps of the ball's scatter template. */
  private scatterFrom(
    gameService: IGameService,
    target: { x: number; y: number }
  ): { x: number; y: number } {
    const path = gameService.getBallMovementController().scatter(target);
    return path.length ? path[path.length - 1] : { ...target };
  }

  /**
   * Resolve the bomb's explosion in `square`: the player in that square is
   * hit; each adjacent player is hit on a 4+. Standing players hit are Knocked
   * Down, and an Armour Roll is queued for every player hit.
   */
  private explode(context: FlowContext, square: { x: number; y: number }): void {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const dice = gameService.getDiceController();

    eventBus.emit(GameEventNames.UI_Notification, "BOOM! The bomb explodes!");
    // Visual blast covering the square and its eight neighbours.
    eventBus.emit(GameEventNames.BombExploded, { x: square.x, y: square.y });

    const hits: Player[] = [];
    const direct = gameService.getPlayerAt(square.x, square.y);
    if (direct) hits.push(direct);

    // Every on-pitch player adjacent to the blast: hit on a 4+.
    const candidates = this.adjacentPlayers(gameService, square, direct?.id);
    for (const p of candidates) {
      const roll = dice.rollD6("Bomb Blast", p.teamId);
      if (roll >= 4) hits.push(p);
    }

    for (const player of hits) {
      if (player.status === PlayerStatus.ACTIVE) {
        // Standing → Knocked Down, then an Armour Roll.
        player.status = PlayerStatus.PRONE;
        eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: player.id });
        eventBus.emit(GameEventNames.PlayerStatusChanged, player);
        this.dropBallIfCarried(gameService, context, player);
      }
      // A downed player (already Prone/Stunned, or just knocked down) still
      // takes an Armour Roll from the blast. cause "special" so it never arms
      // block-only traits like Plague Ridden.
      context.flowManager.add(
        new ArmourOperation(player.id, undefined, undefined, "special"),
        true
      );
    }
  }

  /** On-pitch players in the eight squares around `square` (excluding one id). */
  private adjacentPlayers(
    gameService: IGameService,
    square: { x: number; y: number },
    excludeId?: string
  ): Player[] {
    const found: Player[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const p = gameService.getPlayerAt(square.x + dx, square.y + dy);
        if (p && p.id !== excludeId) found.push(p);
      }
    }
    return found;
  }

  /** A knocked-down carrier drops the ball where they stand. */
  private dropBallIfCarried(
    gameService: IGameService,
    context: FlowContext,
    player: Player
  ): void {
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
   * Offer the defending coach an interception of the bomb in flight. Returns
   * the interceptor's id when the bomb was caught mid-air (it must then be
   * re-thrown), otherwise undefined.
   */
  private async resolveInterception(
    context: FlowContext,
    thrower: Player,
    landing: { x: number; y: number },
    accurate: boolean
  ): Promise<string | undefined> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    if (!thrower.gridPosition) return undefined;

    const passController = gameService.getPassController();
    const catchController = gameService.getCatchController();
    const opponents = gameService.getOpponents(thrower.teamId);

    const eligible = passController.checkInterceptions(
      thrower.gridPosition,
      landing,
      opponents,
      accurate
    );
    if (eligible.length === 0) return undefined;

    const passingTeam = [thrower, ...gameService.getTeammates(thrower.id)];
    const candidates = eligible.map((e) => {
      const interceptor = gameService.getPlayerById(e.playerId)!;
      const marking = catchController.countMarkingOpponents(
        interceptor.gridPosition!,
        passingTeam
      );
      return { playerId: e.playerId, base: e.modifier, marking };
    });

    const chooserTeamId = gameService.getPlayerById(
      candidates[0].playerId
    )!.teamId;
    const answer = (await gameService.getDecisionService().request({
      type: "interception",
      chooserTeamId,
      passerId: thrower.id,
      candidates: candidates.map((c) => ({
        playerId: c.playerId,
        playerName: gameService.getPlayerById(c.playerId)?.playerName,
        modifier: c.base - c.marking,
      })),
    })) as InterceptionDecisionAnswer;

    const chosen = answer.playerId
      ? candidates.find((c) => c.playerId === answer.playerId)
      : undefined;
    if (!chosen) return undefined;

    const interceptor = gameService.getPlayerById(chosen.playerId)!;
    const outcome = passController.attemptInterception(
      interceptor,
      chosen.base,
      chosen.marking
    );
    if (!outcome.success) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${interceptor.playerName} fails to catch the bomb!`
      );
      return undefined;
    }
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${interceptor.playerName} intercepts the bomb!`
    );
    return interceptor.id;
  }

  /** Keep a scattered landing on the pitch (crowd handling deferred). */
  private clampToPitch(pos: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    return {
      x: Math.max(0, Math.min(GameConfig.PITCH_WIDTH - 1, pos.x)),
      y: Math.max(0, Math.min(GameConfig.PITCH_HEIGHT - 1, pos.y)),
    };
  }
}
