import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { InjuryType, PlayerStatus, Player } from "../../types/Player";
import { GamePhase } from "../../types/GameState";
import { movePlayerToBox } from "../rules/playerLocation";
import { SkillType, hasSkill } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";
import { GameConfig } from "../../config/GameConfig";
import {
  SwoopFacing,
  isRightStuffEligible,
  isThrowTeammateInRange,
} from "../rules/throwTeammate";
import { DIRS } from "./BallAndChainOperation";

/** Index into the clockwise DIRS compass for each Swoop facing. */
const FACING_INDEX: Record<SwoopFacing, number> = {
  north: 0,
  east: 2,
  south: 4,
  west: 6,
};
import { InjuryOperation } from "./InjuryOperation";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";
import { CrowdInjuryOperation } from "./CrowdInjuryOperation";
import { trapdoorOpens } from "../inducements/matchInducements";
import { weatherEffects } from "../rules/weather";
import { isOnPitch } from "../controllers/BallMovementController";

/**
 * Ends the thrower's activation once the Throw / Kick Team-mate (and any
 * injury/armour it queued) has fully settled — queued at the BACK of the flow,
 * mirroring StabOperation's FinishStab.
 */
type Square = { x: number; y: number };

/** Throw-in Template: 1-2 left arrow, 3-4 straight, 5-6 right arrow. */
function templateOffset(roll: number): number {
  if (roll <= 2) return -1;
  return roll <= 4 ? 0 : 1;
}

/** Lethal Flight: a Right Stuff player crashing into an opponent causes it. */
const lethalFlight = (teammate: Player, occupant: Player): boolean =>
  hasSkill(teammate.skills, SkillType.LETHAL_FLIGHT) &&
  hasSkill(teammate.skills, SkillType.RIGHT_STUFF) &&
  occupant.teamId !== teammate.teamId;

class FinishThrowTeammateOperation extends GameOperation {
  public readonly name = "FinishThrowTeammate";

  constructor(private throwerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.throwerId);
  }
}

/**
 * ThrowTeammateOperation (2025 rulebook — Throw Team-mate / Kick Team-mate,
 * Right Stuff, Always Hungry, Swoop, Strong Arm)
 *
 * A Standing player with Throw Team-mate (or Kick Team-mate) picks up a
 * Right-Stuff, Strength-3-or-less team-mate and throws them like the ball:
 *   1. Always Hungry (if present) rolls to eat the team-mate first.
 *   2. A Passing Ability Test is made (Strong Arm adds +1 to a THROW only).
 *   3. A fumbled THROW bounces from the thrower's square and attempts to
 *      land at -1; a fumbled KICK removes the team-mate and injures them.
 *   4. On a success the team-mate scatters from the aim square (a Swooping
 *      team-mate may travel by the Throw-in Template instead, and re-roll the
 *      landing) and makes a Right Stuff landing roll: success = land
 *      Standing, failure = land Prone. Landing on an occupied square knocks
 *      the occupant down, then bounces until it reaches an empty square.
 *   5. A failed landing causes a Turnover only if the thrown player held the
 *      ball. Leaving the pitch or knocking down another active-team player
 *      also causes a Turnover.
 *
 * The eat roll and Strong Arm are read directly off the thrower's
 * skills here (like BallManager reads Kick) rather than via a fold — only the
 * thrower's own profile matters and there is no reacting coach.
 */
export class ThrowTeammateOperation extends GameOperation {
  public readonly name = "ThrowTeammateOperation";

  constructor(
    private throwerId: string,
    private teammateId: string,
    private aimX: number,
    private aimY: number,
    private mode: "throw" | "kick",
    private swoopFacing?: SwoopFacing
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;

    const thrower = gameService.getPlayerById(this.throwerId);
    const teammate = gameService.getPlayerById(this.teammateId);
    if (!thrower?.gridPosition || !teammate?.gridPosition) return;

    // The throw is happening — commit the declaration before anything else
    // can be rolled or resolved.
    gameService.commitAction(this.throwerId);

    // Eligibility: Standing thrower with the matching trait, a Standing,
    // Right-Stuff-eligible team-mate adjacent to them.
    const trait =
      this.mode === "kick"
        ? SkillType.KICK_TEAM_MATE
        : SkillType.THROW_TEAM_MATE;
    if (
      thrower.status !== PlayerStatus.ACTIVE ||
      !hasSkill(thrower.skills, trait)
    ) {
      return;
    }
    const refusal = this.throwRefusal(
      thrower,
      thrower.gridPosition,
      teammate,
      teammate.gridPosition
    );
    if (refusal) {
      context.eventBus.emit(GameEventNames.UI_Notification, refusal);
      return;
    }
    this.announce(context, thrower, thrower.gridPosition, teammate, trait);

    await context.delay(600);

    // 1. Always Hungry — before the throw completes, roll to eat the team-mate.
    const hunger = this.alwaysHungry(context, thrower, teammate);
    if (hunger === "eaten") return;

    // 2. Passing Ability Test (Strong Arm helps a THROW only).
    const { fumbled, bullseye, superbThrow } =
      hunger === "squirmed"
        ? { fumbled: true, bullseye: false, superbThrow: false }
        : this.passingTest(context, thrower, thrower.gridPosition);

    // 3. Fumble handling.
    if (fumbled && this.mode === "kick") {
      this.fumbleKick(context, teammate);
      return;
    }
    if (fumbled) {
      context.eventBus.emit(
        GameEventNames.UI_Notification,
        `Fumbled throw! ${teammate.playerName} is dropped and bounces.`
      );
    }

    // 4. Scatter the thrown player from the aim square, then land them.
    const { landing, swooped } = fumbled
      ? {
          landing: gameService
            .getBallMovementController()
            .bounce(thrower.gridPosition),
          swooped: false,
        }
      : this.landingSquare(context, thrower, teammate, bullseye);
    const { carriesBall, occupant } = this.fly(
      context,
      teammate,
      teammate.gridPosition,
      landing
    );

    await this.resolveLanding(context, thrower, teammate, {
      landing,
      carriesBall,
      occupant,
      superbThrow,
      swooped,
    });
  }

  private async resolveLanding(
    context: FlowContext,
    thrower: Player,
    teammate: Player,
    flight: {
      landing: Square;
      carriesBall: boolean;
      occupant: Player | undefined;
      superbThrow: boolean;
      swooped: boolean;
    }
  ): Promise<void> {
    const { gameService } = context;
    const { landing, carriesBall, occupant, superbThrow, swooped } = flight;
    // Give the flight time to play before the landing resolves.
    await context.delay(600);

    if (!isOnPitch(landing)) {
      this.landInCrowd(context, teammate, thrower.gridPosition!, carriesBall);
      return;
    }

    if (occupant && occupant.id !== teammate.id) {
      await this.crash(context, teammate, occupant, landing, carriesBall);
      return;
    }

    // Treacherous Trapdoor (L12): landing on it may drop the thrown player
    // through, injured as if they left the pitch, which is a Turnover.
    if (
      trapdoorOpens(
        gameService.getState(),
        gameService.getDiceController(),
        teammate,
        landing
      )
    ) {
      teammate.gridPosition = undefined;
      context.flowManager.add(
        new CrowdInjuryOperation(teammate.id, { ...landing }, false, {
          carriedBall: carriesBall,
        }),
        true
      );
      this.finishLanding(gameService, context, true, "Fell through a Trapdoor");
      return;
    }

    this.land(context, thrower, teammate, landing, {
      carriesBall,
      superbThrow,
      swooped,
    });
  }

  /** Why the team-mate cannot be thrown to the aim, or null when they can. */
  private throwRefusal(
    thrower: Player,
    from: Square,
    teammate: Player,
    at: Square
  ): string | null {
    if (
      teammate.teamId !== thrower.teamId ||
      teammate.status !== PlayerStatus.ACTIVE ||
      !isRightStuffEligible(teammate)
    ) {
      return "That team-mate cannot be thrown (needs Right Stuff and ST 3 or less)!";
    }
    const dx = Math.abs(from.x - at.x);
    const dy = Math.abs(from.y - at.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) {
      return "The team-mate must be adjacent to be thrown!";
    }

    // A team-mate may only be thrown at Quick or Short range.
    if (!isThrowTeammateInRange(from, { x: this.aimX, y: this.aimY })) {
      return "Out of range — a team-mate can only be thrown to Quick or Short range!";
    }
    return null;
  }

  private announce(
    context: FlowContext,
    thrower: Player,
    from: Square,
    teammate: Player,
    trait: SkillType
  ): void {
    const { eventBus } = context;
    const verb = this.mode === "kick" ? "kicks" : "throws";
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${thrower.playerName} ${verb} ${teammate.playerName}!`
    );
    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: thrower.id,
      skill: trait,
      effect: `${this.mode === "kick" ? "Kick" : "Throw"} Team-mate: ${teammate.playerName}`,
    });

    // The thrower leans into the throw / swings a little kick toward the aim.
    eventBus.emit(GameEventNames.PlayerThrowGesture, {
      playerId: thrower.id,
      mode: this.mode,
      dir: this.aimX >= from.x ? 1 : -1,
    });
  }

  /**
   * Always Hungry: on a 1 the thrower tries to eat the team-mate, and on a
   * second 1 does. Otherwise the team-mate squirms free and the throw is
   * fumbled.
   */
  private alwaysHungry(
    context: FlowContext,
    thrower: Player,
    teammate: Player
  ): "eaten" | "squirmed" | "thrown" {
    const { gameService, eventBus } = context;
    const dice = gameService.getDiceController();
    if (!hasSkill(thrower.skills, SkillType.ALWAYS_HUNGRY)) return "thrown";
    const hunger = dice.rollD6("Always Hungry", thrower.teamId);
    if (hunger !== 1) return "thrown";
    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: thrower.id,
      skill: SkillType.ALWAYS_HUNGRY,
      effect: `${thrower.playerName} tries to eat ${teammate.playerName}!`,
    });
    const eat = dice.rollD6("Always Hungry (Eat)", thrower.teamId);
    if (eat === 1) {
      // Eaten: removed from the Team Draft List, no Apothecary, no
      // Regeneration. A carried ball bounces from the thrower's square.
      // Model it as a Casualty (Dead) so they leave the pitch and land in
      // the dugout's casualty box rather than lingering as a reserve.
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${thrower.playerName} EATS ${teammate.playerName}!`
      );
      const hadBall = this.bounceIfCarried(gameService, context, teammate);
      teammate.injuries.push(InjuryType.DEAD);
      movePlayerToBox(teammate, { box: "casualty", dead: true }, eventBus);
      // A Turnover "only if that eaten player was in possession of the
      // ball" (FAQ); the activation ends either way.
      this.finishLanding(gameService, context, hadBall, "Ate Team-mate");
      return "eaten";
    }
    // Squirmed free: the throw is automatically fumbled.
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${teammate.playerName} squirms free — Fumbled Throw!`
    );
    return "squirmed";
  }

  /**
   * The Passing Ability Test. Bullseye: a Superb Throw (a passed Passing
   * Ability Test, or a natural 6) lands the team-mate on the target square
   * with no Scatter.
   */
  private passingTest(
    context: FlowContext,
    thrower: Player,
    from: Square
  ): { fumbled: boolean; bullseye: boolean; superbThrow: boolean } {
    const { gameService, eventBus } = context;
    const opponents = gameService.getOpponents(thrower.teamId);
    const marking = gameService
      .getCatchController()
      .countMarkingOpponents(from, opponents);
    const passRange = gameService
      .getPassController()
      .measureRange(from, { x: this.aimX, y: this.aimY });

    let extra = 0;
    if (
      this.mode === "throw" &&
      hasSkill(thrower.skills, SkillType.STRONG_ARM)
    ) {
      extra = 1;
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: thrower.id,
        skill: SkillType.STRONG_ARM,
        effect: "Strong Arm: +1 to the Throw Team-mate roll",
      });
    }

    const test = gameService
      .getPassController()
      .testAccuracy(
        thrower,
        passRange,
        marking,
        extra + weatherEffects(gameService.getState().weather).passingAbility,
        this.mode === "throw" ? "Throw Team-mate" : "Kick Team-mate"
      );
    return {
      fumbled: test.fumbled,
      bullseye:
        this.mode === "throw" &&
        test.accurate &&
        hasSkill(thrower.skills, SkillType.BULLSEYE),
      superbThrow: test.accurate,
    };
  }

  private fumbleKick(context: FlowContext, teammate: Player): void {
    const { gameService, eventBus } = context;
    eventBus.emit(
      GameEventNames.UI_Notification,
      `Fumbled kick! ${teammate.playerName} is removed and injured.`
    );
    this.bounceIfCarried(gameService, context, teammate);
    teammate.gridPosition = undefined;
    teammate.status = PlayerStatus.PRONE;
    context.flowManager.add(new InjuryOperation(teammate.id), true);
    gameService.triggerTurnover("Fumbled Kick Team-mate");
  }

  /**
   * Where the thrown player comes down: on target with Bullseye, by the
   * Throw-in Template with Swoop, otherwise scattered from the aim square.
   */
  private landingSquare(
    context: FlowContext,
    thrower: Player,
    teammate: Player,
    bullseye: boolean
  ): { landing: Square; swooped: boolean } {
    const { gameService, eventBus } = context;
    const dice = gameService.getDiceController();
    if (bullseye) {
      // Superb Throw with Bullseye: no scatter — straight to the target square.
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: thrower.id,
        skill: SkillType.BULLSEYE,
        effect: "Bullseye: a Superb Throw lands on target with no scatter",
      });
      return {
        landing: this.clampToPitch({ x: this.aimX, y: this.aimY }),
        swooped: false,
      };
    }
    if (this.swoopFacing) {
      // Swoop: the thrown player chose the Throw-in Template over a Scatter.
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: teammate.id,
        skill: SkillType.SWOOP,
        effect: `Swoop: travels by the Throw-in Template facing ${this.swoopFacing}`,
      });
      // Throw-in Template: 1-2 left arrow, 3-4 straight, 5-6 right arrow.
      const roll = dice.rollD6("Swoop Direction", teammate.teamId);
      const distance = dice.rollD6("Swoop Distance", teammate.teamId);
      const dir =
        DIRS[(FACING_INDEX[this.swoopFacing] + templateOffset(roll) + 8) % 8];
      return {
        landing: this.clampToPitch({
          x: this.aimX + dir.x * distance,
          y: this.aimY + dir.y * distance,
        }),
        swooped: true,
      };
    }
    const path = gameService
      .getBallMovementController()
      .scatter({ x: this.aimX, y: this.aimY }, "Team-mate Scatter");
    return {
      landing: this.clampToPitch(path[path.length - 1]),
      swooped: false,
    };
  }

  /**
   * Fly the thrown player to `landing`, carrying the ball if they hold it.
   * Whether the landing square already holds another player (a crash) is
   * measured BEFORE the thrown player is placed there.
   */
  private fly(
    context: FlowContext,
    teammate: Player,
    from: Square,
    landing: Square,
    carriedBall?: boolean
  ): { carriesBall: boolean; occupant: Player | undefined } {
    const { gameService, eventBus } = context;
    // A thrown team-mate carrying the ball takes it with them through the air.
    const ball = groundBall(gameService.getState());
    const carriesBall =
      carriedBall ?? (!!ball && ball.x === from.x && ball.y === from.y);

    const occupant = gameService.getPlayerAt(landing.x, landing.y);

    // Animate the thrown player flying to the landing square (reuses the
    // PlayerMoved path tween), carrying the ball along if they hold it.
    const origin = { ...from };
    teammate.gridPosition = { ...landing };
    if (carriesBall) {
      gameService.setBallPosition(landing.x, landing.y);
    }
    eventBus.emit(GameEventNames.PlayerMoved, {
      playerId: teammate.id,
      from: origin,
      to: { ...landing },
      path: [{ ...landing }],
      thrown: true,
      ...(carriesBall
        ? { ballFrom: origin, ballPath: [{ ...landing }], ballJoinStep: 0 }
        : {}),
    });
    return { carriesBall, occupant };
  }

  /** Each occupant is knocked down; the thrown player bounces clear and falls. */
  private async crash(
    context: FlowContext,
    teammate: Player,
    occupant: Player,
    landing: Square,
    carriesBall: boolean
  ): Promise<void> {
    const { gameService, eventBus } = context;
    let target: Player | undefined = occupant;
    let square = landing;
    let ownPlayerHit = false;
    while (target && target.id !== teammate.id) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${teammate.playerName} crashes into ${target.playerName}!`
      );
      ownPlayerHit ||= target.teamId === gameService.getState().activeTeamId;
      const ball = groundBall(gameService.getState());
      const dropsBall =
        !carriesBall && ball?.x === square.x && ball.y === square.y;
      // The thrown player is still airborne during the occupant's injury
      // and dropped-ball reactions, so cannot catch that ball themselves.
      teammate.gridPosition = undefined;
      this.knockDown(gameService, eventBus, target);
      // Resolve the injury before another bounce can revisit this square:
      // a casualty has already left it and must not be injured again.
      await context.flowManager.runToRest(
        new ArmourOperation(
          target.id,
          lethalFlight(teammate, target) ? teammate.id : undefined,
          undefined,
          "lethal-flight"
        )
      );
      if (dropsBall) {
        await context.flowManager.runToRest(new BounceOperation({ ...square }));
        if (gameService.getPhase() !== GamePhase.PLAY) return;
      }
      const next = gameService.getBallMovementController().bounce(square);
      target = this.fly(context, teammate, square, next, carriesBall).occupant;
      if (!isOnPitch(next)) {
        this.landInCrowd(context, teammate, square, carriesBall);
        return;
      }
      square = next;
    }
    this.knockDown(gameService, eventBus, teammate);
    // Falling onto a loose ball makes it bounce too; only the original
    // carrier flag below decides whether this fall causes a Turnover.
    this.bounceIfCarried(gameService, context, teammate);
    context.flowManager.add(new ArmourOperation(teammate.id), true);
    // The thrown player Falls Over; "this will only cause a Turnover if the
    // thrown player was holding the ball" (p.82).
    this.finishLanding(
      gameService,
      context,
      carriesBall || ownPlayerHit,
      "Thrown player crashed"
    );
  }

  private landInCrowd(
    context: FlowContext,
    teammate: Player,
    exitSquare: Square,
    carriesBall: boolean
  ): void {
    teammate.gridPosition = undefined;
    if (carriesBall)
      context.gameService.setBallPosition(exitSquare.x, exitSquare.y);
    context.flowManager.add(
      new CrowdInjuryOperation(
        teammate.id,
        { ...exitSquare },
        true,
        undefined,
        carriesBall
      ),
      true
    );
  }

  /**
   * The Landing roll. Landing modifiers (p.82): -1 after a Subpar Throw, -1
   * per opposition player Marking the landing square.
   */
  private land(
    context: FlowContext,
    thrower: Player,
    teammate: Player,
    landing: Square,
    throwResult: {
      carriesBall: boolean;
      superbThrow: boolean;
      swooped: boolean;
    }
  ): void {
    const { gameService, eventBus } = context;
    const dice = gameService.getDiceController();
    const { carriesBall, superbThrow, swooped } = throwResult;
    const landingMarkers = gameService
      .getCatchController()
      .countMarkingOpponents(
        landing,
        gameService.getOpponents(teammate.teamId)
      );
    const rollLanding = () =>
      dice.rollSkillCheck(
        "Landing",
        teammate.stats.AG,
        (superbThrow ? 0 : -1) - landingMarkers,
        teammate.playerName,
        teammate.teamId
      );
    let land = rollLanding();
    if (!land.success && swooped) {
      // A failed re-roll never leaves the player worse off, so take it.
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: teammate.id,
        skill: SkillType.SWOOP,
        effect: "Swoop: re-rolls the landing",
      });
      const before = land.roll;
      land = rollLanding();
      eventBus.emit(GameEventNames.RerollUsed, {
        playerId: teammate.id,
        source: "skill",
        skill: SkillType.SWOOP,
        rollKind: "landing",
        before,
        after: land.roll,
      });
    }

    if (land.success) {
      // Landing is involuntary movement, so a loose ball bounces rather
      // than being picked up. An existing carrier keeps their own ball.
      if (!carriesBall) this.bounceIfCarried(gameService, context, teammate);
      this.landSafely(context, thrower, teammate, superbThrow);
      return;
    }

    // Failed the landing: the thrown player Falls Over.
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${teammate.playerName} fails to land and is Prone!`
    );
    this.knockDown(gameService, eventBus, teammate);
    // A failed landing also bounces a loose ball beneath the fallen player.
    this.bounceIfCarried(gameService, context, teammate);
    context.flowManager.add(new ArmourOperation(teammate.id), true);
    this.finishLanding(
      gameService,
      context,
      carriesBall,
      "Thrown player landed Prone"
    );
  }

  /** Landed Standing — NOT a turnover; they keep the ball if they had it. */
  private landSafely(
    context: FlowContext,
    thrower: Player,
    teammate: Player,
    superbThrow: boolean
  ): void {
    const { eventBus } = context;
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${teammate.playerName} lands safely!`
    );
    if (this.mode === "throw") {
      eventBus.emit(GameEventNames.ThrowTeammateLanded, {
        throwerId: thrower.id,
        thrownPlayerId: teammate.id,
        safeLanding: true,
        superbThrow,
      });
    }
    eventBus.emit(GameEventNames.PlayerStatusChanged, teammate);
    // A carrier landing Standing in the End Zone they score in scores.
    if (context.gameService.checkForTouchdown(teammate.id)) return;
    context.flowManager.add(new FinishThrowTeammateOperation(this.throwerId));
  }

  /** A Fall Over is a Turnover only when the thrown player held the ball. */
  private finishLanding(
    gameService: IGameService,
    context: FlowContext,
    carriedBall: boolean,
    reason: string
  ): void {
    if (carriedBall) {
      gameService.triggerTurnover(reason);
      return;
    }
    context.flowManager.add(new FinishThrowTeammateOperation(this.throwerId));
  }

  /** Knock a player down: Prone, emit the knock-down + status events. */
  private knockDown(
    _gameService: IGameService,
    eventBus: FlowContext["eventBus"],
    player: Player
  ): void {
    player.status = PlayerStatus.PRONE;
    eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: player.id });
    eventBus.emit(GameEventNames.PlayerStatusChanged, player);
  }

  /**
   * If the given player is standing on the ball, bounce it from their square.
   * Returns whether they had it.
   */
  private bounceIfCarried(
    gameService: IGameService,
    context: FlowContext,
    player: Player
  ): boolean {
    const ball = groundBall(gameService.getState());
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
      return true;
    }
    return false;
  }

  /** Keep a scattered landing square on the pitch (crowd handling deferred). */
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
