import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus, Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";
import { GameConfig } from "../../config/GameConfig";
import { isRightStuffEligible, isThrowTeammateInRange } from "../rules/throwTeammate";
import { InjuryOperation } from "./InjuryOperation";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";

/**
 * Ends the thrower's activation once the Throw / Kick Team-mate (and any
 * injury/armour it queued) has fully settled — queued at the BACK of the flow,
 * mirroring StabOperation's FinishStab.
 */
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
 *   3. On a Fumble: a THROW drops the team-mate Prone in the thrower's square
 *      and injures them; a KICK removes the team-mate and injures them. Both
 *      cause a Turnover.
 *   4. On a success the team-mate scatters from the aim square (Swoop uses the
 *      tighter throw-in template) and makes a Right Stuff landing roll (+1 with
 *      Swoop): success = land Standing, failure = land Prone. Landing on an
 *      occupied square knocks BOTH players down (a crash).
 *   5. A Throw Team-mate ending with the thrown player Prone / injured / off
 *      the pitch causes a Turnover; landing Standing in an empty square does not.
 *
 * The eat roll, Strong Arm and Swoop are read directly off the thrower's
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
    private mode: "throw" | "kick"
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const dice = gameService.getDiceController();

    const thrower = gameService.getPlayerById(this.throwerId);
    const teammate = gameService.getPlayerById(this.teammateId);
    if (!thrower?.gridPosition || !teammate?.gridPosition) return;

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
    if (
      teammate.teamId !== thrower.teamId ||
      teammate.status !== PlayerStatus.ACTIVE ||
      !isRightStuffEligible(teammate)
    ) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        "That team-mate cannot be thrown (needs Right Stuff and ST 3 or less)!"
      );
      return;
    }
    const dx = Math.abs(thrower.gridPosition.x - teammate.gridPosition.x);
    const dy = Math.abs(thrower.gridPosition.y - teammate.gridPosition.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        "The team-mate must be adjacent to be thrown!"
      );
      return;
    }

    // A team-mate may only be thrown at Quick or Short range.
    if (
      !isThrowTeammateInRange(thrower.gridPosition, {
        x: this.aimX,
        y: this.aimY,
      })
    ) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        "Out of range — a team-mate can only be thrown to Quick or Short range!"
      );
      return;
    }

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

    await context.delay(600);

    // 1. Always Hungry — before the throw completes, roll to eat the team-mate.
    let forcedFumble = false;
    if (hasSkill(thrower.skills, SkillType.ALWAYS_HUNGRY)) {
      const hunger = dice.rollD6("Always Hungry", thrower.teamId);
      if (hunger === 1) {
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: thrower.id,
          skill: SkillType.ALWAYS_HUNGRY,
          effect: `${thrower.playerName} tries to eat ${teammate.playerName}!`,
        });
        const eat = dice.rollD6("Always Hungry (Eat)", thrower.teamId);
        if (eat === 1) {
          // Eaten: removed from the Team Draft List, no Apothecary, no
          // Regeneration. A carried ball bounces from the thrower's square.
          eventBus.emit(
            GameEventNames.UI_Notification,
            `${thrower.playerName} EATS ${teammate.playerName}!`
          );
          this.bounceIfCarried(gameService, context, teammate);
          gameService.removePlayer(teammate.id);
          gameService.triggerTurnover("Ate Team-mate");
          return;
        }
        // Squirmed free: the throw is automatically fumbled.
        eventBus.emit(
          GameEventNames.UI_Notification,
          `${teammate.playerName} squirms free — Fumbled Throw!`
        );
        forcedFumble = true;
      }
    }

    // 2. Passing Ability Test (Strong Arm helps a THROW only).
    let fumbled = forcedFumble;
    if (!forcedFumble) {
      const opponents = gameService.getOpponents(thrower.teamId);
      const marking = gameService
        .getCatchController()
        .countMarkingOpponents(thrower.gridPosition, opponents);
      const passRange = gameService
        .getPassController()
        .measureRange(thrower.gridPosition, { x: this.aimX, y: this.aimY });

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
        .testAccuracy(thrower, passRange, marking, extra);
      fumbled = test.fumbled;
    }

    // 3. Fumble handling.
    if (fumbled) {
      if (this.mode === "kick") {
        // A fumbled kick removes the player from play and injures them.
        eventBus.emit(
          GameEventNames.UI_Notification,
          `Fumbled kick! ${teammate.playerName} is removed and injured.`
        );
        this.bounceIfCarried(gameService, context, teammate);
        teammate.gridPosition = undefined;
        teammate.status = PlayerStatus.PRONE;
        context.flowManager.add(new InjuryOperation(teammate.id), true);
        gameService.triggerTurnover("Fumbled Kick Team-mate");
        return;
      }
      // A fumbled throw drops the team-mate Prone in the thrower's square.
      eventBus.emit(
        GameEventNames.UI_Notification,
        `Fumbled throw! ${teammate.playerName} is dropped.`
      );
      this.bounceIfCarried(gameService, context, teammate);
      teammate.gridPosition = { ...thrower.gridPosition };
      teammate.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: teammate.id });
      eventBus.emit(GameEventNames.PlayerStatusChanged, teammate);
      context.flowManager.add(new InjuryOperation(teammate.id), true);
      gameService.triggerTurnover("Fumbled Throw Team-mate");
      return;
    }

    // 4. Scatter the thrown player from the aim square, then land them.
    const swoop = hasSkill(thrower.skills, SkillType.SWOOP);
    const movement = gameService.getBallMovementController();
    let landing: { x: number; y: number };
    if (swoop) {
      // Swoop: the tighter throw-in template — a single scatter step.
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: thrower.id,
        skill: SkillType.SWOOP,
        effect: "Swoop: throw-in template scatter and +1 to landing",
      });
      landing = movement.bounce({ x: this.aimX, y: this.aimY });
    } else {
      const path = movement.scatter({ x: this.aimX, y: this.aimY });
      landing = path[path.length - 1];
    }
    landing = this.clampToPitch(landing);

    // A thrown team-mate carrying the ball takes it with them through the air.
    const ball = gameService.getState().ballPosition;
    const carriesBall =
      !!ball &&
      ball.x === teammate.gridPosition.x &&
      ball.y === teammate.gridPosition.y;

    // Whether the landing square already holds another player (a crash) is
    // measured BEFORE the thrown player is placed there.
    const occupant = gameService.getPlayerAt(landing.x, landing.y);

    // Animate the thrown player flying to the landing square (reuses the
    // PlayerMoved path tween), carrying the ball along if they hold it.
    const origin = { ...teammate.gridPosition };
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

    // Give the flight time to play before the landing resolves.
    await context.delay(600);

    // Right Stuff landing roll: an Agility Test, +1 with Swoop.
    const landingBonus = swoop ? 1 : 0;

    if (occupant && occupant.id !== teammate.id) {
      // Crash: both players are knocked down and take an Armour Roll.
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${teammate.playerName} crashes into ${occupant.playerName}!`
      );
      this.knockDown(gameService, eventBus, teammate);
      this.knockDown(gameService, eventBus, occupant);
      // A knocked-down carrier drops the ball where they land.
      if (carriesBall) {
        context.flowManager.add(new BounceOperation({ ...landing }), true);
      }
      context.flowManager.add(new ArmourOperation(teammate.id), true);
      context.flowManager.add(new ArmourOperation(occupant.id), true);
      gameService.triggerTurnover("Thrown player crashed");
      return;
    }

    const land = dice.rollSkillCheck(
      "Landing",
      teammate.stats.AG,
      landingBonus,
      teammate.playerName,
      teammate.teamId
    );

    if (land.success) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${teammate.playerName} lands safely!`
      );
      eventBus.emit(GameEventNames.PlayerStatusChanged, teammate);
      // Landed Standing — NOT a turnover; they keep the ball if they had it.
      context.flowManager.add(new FinishThrowTeammateOperation(this.throwerId));
      return;
    }

    // Failed the landing — Placed Prone, which is a Turnover.
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${teammate.playerName} fails to land and is Prone!`
    );
    this.knockDown(gameService, eventBus, teammate);
    // A downed carrier drops the ball where they land.
    if (carriesBall) {
      context.flowManager.add(new BounceOperation({ ...landing }), true);
    }
    context.flowManager.add(new ArmourOperation(teammate.id), true);
    gameService.triggerTurnover("Thrown player landed Prone");
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

  /** If the given player is standing on the ball, bounce it from their square. */
  private bounceIfCarried(
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
