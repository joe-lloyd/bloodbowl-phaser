import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { type IGameService } from "../../services/interfaces/IGameService";
import { InjuryType, PlayerStatus, type Player } from "../../types/Player";
import { GamePhase } from "../../types/GameState";
import { movePlayerToBox } from "../rules/playerLocation";
import { SkillType, hasSkill } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import {
  type SwoopFacing,
  isRightStuffEligible,
  isThrowTeammateInRange,
} from "../rules/throwTeammate";
import { DIRS, templateOffset } from "./throwInTemplate";

const FACING_INDEX: Record<SwoopFacing, number> = {
  north: 0,
  east: 2,
  south: 4,
  west: 6,
};
import { InjuryOperation } from "./InjuryOperation";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";
import { FinishActivationOperation } from "./FinishActivationOperation";
import { bounceIfBallUnder, knockDownPlayer } from "./knockDown";
import { clampToPitch } from "../rules/pitchBounds";
import { CrowdInjuryOperation } from "./CrowdInjuryOperation";
import { trapdoorOpens } from "../inducements/matchInducements";
import { weatherEffects } from "../rules/weather";
import { isOnPitch } from "../controllers/BallMovementController";
import { obstacleKindAt } from "../rules/pitchSquares";
import { activeRules } from "../variants/activeMatch";
import {
  type WallStrike,
  clearOfObstacles,
  clearOfStalls,
  firstWallOnPath,
  pushOffWall,
} from "./thrownIntoObstacles";

interface Square {
  x: number;
  y: number;
}

interface ThrownFlight {
  landing: Square;
  swooped: boolean;
  wall?: Square;
}

const lethalFlight = (teammate: Player, occupant: Player): boolean =>
  hasSkill(teammate.skills, SkillType.LETHAL_FLIGHT) &&
  hasSkill(teammate.skills, SkillType.RIGHT_STUFF) &&
  occupant.teamId !== teammate.teamId;

export class ThrowTeammateOperation extends GameOperation {
  public readonly name = "ThrowTeammateOperation";

  private throwerId: string;
  private teammateId: string;
  private aimX: number;
  private aimY: number;
  private mode: "throw" | "kick";
  private swoopFacing: (SwoopFacing) | undefined;
  constructor(
    throwerId: string,
    teammateId: string,
    aimX: number,
    aimY: number,
    mode: "throw" | "kick",
    swoopFacing?: SwoopFacing
  ) {
    super();
    this.throwerId = throwerId;
    this.teammateId = teammateId;
    this.aimX = aimX;
    this.aimY = aimY;
    this.mode = mode;
    this.swoopFacing = swoopFacing;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;

    const thrower = gameService.getPlayerById(this.throwerId);
    const teammate = gameService.getPlayerById(this.teammateId);
    if (!thrower?.gridPosition || !teammate?.gridPosition) return;

    gameService.commitAction(this.throwerId);

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

    const hunger = this.alwaysHungry(context, thrower, teammate);
    if (hunger === "eaten") return;

    const { fumbled, bullseye, superbThrow } =
      hunger === "squirmed"
        ? { fumbled: true, bullseye: false, superbThrow: false }
        : this.passingTest(context, thrower, thrower.gridPosition);

    if (fumbled && this.mode === "kick") {
      await this.fumbleKick(context, teammate);
      return;
    }
    if (fumbled) {
      context.eventBus.emit(
        GameEventNames.UI_Notification,
        `Fumbled throw! ${teammate.playerName} is dropped and bounces.`
      );
    }

    const flight: ThrownFlight = fumbled
      ? {
          landing: gameService
            .getBallMovementController()
            .bounce(thrower.gridPosition),
          swooped: false,
        }
      : this.landingSquare(context, thrower, teammate, bullseye);
    await this.throwTo(context, teammate, {
      ...flight,
      thrower,
      from: teammate.gridPosition,
      superbThrow,
    });
  }

  private async throwTo(
    context: FlowContext,
    teammate: Player,
    flight: ThrownFlight & {
      thrower: Player;
      from: Square;
      superbThrow: boolean;
    }
  ): Promise<void> {
    const { wall, superbThrow, swooped, thrower } = flight;
    const strike = wall ? { before: flight.landing, wall } : undefined;
    const stopsAtWall = !!strike && this.hitsTheWall(context, teammate, strike);
    const landing =
      strike && !stopsAtWall
        ? pushOffWall(context.gameService.getDiceController(), strike)
        : clearOfStalls(flight.landing);
    const { carriesBall, occupant } = this.fly(
      context,
      teammate,
      flight.from,
      landing
    );
    if (stopsAtWall && !occupant) {
      this.knockedDownAtWall(context, teammate, carriesBall);
      return;
    }
    await this.resolveLanding(context, thrower, teammate, {
      landing,
      carriesBall,
      occupant,
      superbThrow,
      swooped,
    });
  }

  private hitsTheWall(
    context: FlowContext,
    teammate: Player,
    strike: WallStrike
  ): boolean {
    const roll = context.gameService
      .getDiceController()
      .rollD6("Thrown into the Wall", teammate.teamId);
    context.eventBus.emit(GameEventNames.PlayerPushedIntoWall, {
      playerId: teammate.id,
      square: { ...strike.before },
      wall: { ...strike.wall },
      fell: roll < 6,
    });
    return roll < 6;
  }

  private knockedDownAtWall(
    context: FlowContext,
    teammate: Player,
    carriesBall: boolean
  ): void {
    knockDownPlayer(context.eventBus, teammate);
    bounceIfBallUnder(context, teammate);
    context.flowManager.add(
      new ArmourOperation(
        teammate.id,
        undefined,
        undefined,
        "block",
        activeRules().armour.wallPush
      ),
      true
    );
    this.finishLanding(
      context.gameService,
      context,
      carriesBall,
      "Thrown into a wall"
    );
  }

  private dropIntoPit(
    context: FlowContext,
    teammate: Player,
    { pit, carriesBall }: { pit: Square; carriesBall: boolean }
  ): void {
    const from = teammate.gridPosition ?? pit;
    delete teammate.gridPosition;
    teammate.sewerPit = { ...pit };
    context.eventBus.emit(GameEventNames.PlayerFellIntoPit, {
      playerId: teammate.id,
      from: { ...from },
      pit: { ...pit },
    });
    context.eventBus.emit(GameEventNames.PlayerStatusChanged, teammate);
    if (carriesBall) {
      context.gameService.setBallPosition(pit.x, pit.y);
      context.flowManager.add(new BounceOperation({ ...pit }), true);
    }
    this.finishLanding(
      context.gameService,
      context,
      carriesBall,
      "Fell into a Sewer Pit"
    );
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

    await context.delay(600);

    if (!isOnPitch(landing)) {
      this.landInCrowd(context, teammate, thrower.gridPosition!, carriesBall);
      return;
    }

    if (obstacleKindAt(landing) === "sewer-pit") {
      this.dropIntoPit(context, teammate, { pit: landing, carriesBall });
      return;
    }

    if (occupant && occupant.id !== teammate.id) {
      await this.crash(context, teammate, occupant, landing, carriesBall);
      return;
    }

    if (
      trapdoorOpens(
        gameService.getState(),
        gameService.getDiceController(),
        teammate,
        landing
      )
    ) {
      delete teammate.gridPosition;
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

    eventBus.emit(GameEventNames.PlayerThrowGesture, {
      playerId: thrower.id,
      mode: this.mode,
      dir: this.aimX >= from.x ? 1 : -1,
    });
  }

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
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${thrower.playerName} EATS ${teammate.playerName}!`
      );
      const hadBall = bounceIfBallUnder(context, teammate);
      teammate.injuries.push(InjuryType.DEAD);
      movePlayerToBox(teammate, { box: "casualty", dead: true }, eventBus);

      this.finishLanding(gameService, context, hadBall, "Ate Team-mate");
      return "eaten";
    }

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${teammate.playerName} squirms free — Fumbled Throw!`
    );
    return "squirmed";
  }

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
        { player: thrower,passRange,markingOpponents: marking,extraModifier: extra+weatherEffects(gameService.getState().weather).passingAbility,rollName: this.mode==="throw"? "Throw Team-mate":"Kick Team-mate" }      );
    return {
      fumbled: test.fumbled,
      bullseye:
        this.mode === "throw" &&
        test.accurate &&
        hasSkill(thrower.skills, SkillType.BULLSEYE),
      superbThrow: test.accurate,
    };
  }

  private async fumbleKick(
    context: FlowContext,
    teammate: Player
  ): Promise<void> {
    const { gameService, eventBus } = context;
    eventBus.emit(
      GameEventNames.UI_Notification,
      `Fumbled kick! ${teammate.playerName} is removed and injured.`
    );
    bounceIfBallUnder(context, teammate);
    delete teammate.gridPosition;
    teammate.status = PlayerStatus.PRONE;
    await context.flowManager.runToRest(
      new InjuryOperation(teammate.id, { stunnedToReserves: true })
    );

    if (gameService.getPlayerById(teammate.id)?.status === PlayerStatus.STUNNED)
      movePlayerToBox(teammate, { box: "reserves" }, eventBus);
    gameService.triggerTurnover("Fumbled Kick Team-mate");
  }

  private landingSquare(
    context: FlowContext,
    thrower: Player,
    teammate: Player,
    bullseye: boolean
  ): ThrownFlight {
    const { gameService, eventBus } = context;
    const dice = gameService.getDiceController();
    if (bullseye) {
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: thrower.id,
        skill: SkillType.BULLSEYE,
        effect: "Bullseye: a Superb Throw lands on target with no scatter",
      });
      return {
        landing: clampToPitch({ x: this.aimX, y: this.aimY }),
        swooped: false,
      };
    }
    if (this.swoopFacing) {
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: teammate.id,
        skill: SkillType.SWOOP,
        effect: `Swoop: travels by the Throw-in Template facing ${this.swoopFacing}`,
      });

      const roll = dice.rollD6("Swoop Direction", teammate.teamId);
      const distance = dice.rollD6("Swoop Distance", teammate.teamId);
      const dir =
        DIRS[(FACING_INDEX[this.swoopFacing] + templateOffset(roll) + 8) % 8];
      if (!dir) throw new Error(`No Swoop direction for roll ${String(roll)}`);
      return {
        landing: clampToPitch({
          x: this.aimX + dir.x * distance,
          y: this.aimY + dir.y * distance,
        }),
        swooped: true,
      };
    }
    const path = gameService
      .getBallMovementController()
      .scatter({ x: this.aimX, y: this.aimY }, "Team-mate Scatter");
    const scatterEnd = path.at(-1);
    if (!scatterEnd) throw new Error("Team-mate scatter produced no path");
    const strike = firstWallOnPath({ x: this.aimX, y: this.aimY }, path);
    if (strike)
      return { landing: strike.before, swooped: false, wall: strike.wall };
    return {
      landing: clampToPitch(scatterEnd),
      swooped: false,
    };
  }

  private fly(
    context: FlowContext,
    teammate: Player,
    from: Square,
    landing: Square,
    carriedBall?: boolean
  ): { carriesBall: boolean; occupant: Player | undefined } {
    const { gameService, eventBus } = context;

    const ball = groundBall(gameService.getState());
    const carriesBall =
      carriedBall ?? (!!ball && ball.x === from.x && ball.y === from.y);

    const occupant = gameService.getPlayerAt(landing.x, landing.y);

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

      delete teammate.gridPosition;
      knockDownPlayer(eventBus, target);

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
      const next = clearOfObstacles(
        gameService.getBallMovementController().bounce(square)
      );
      target = this.fly(context, teammate, square, next, carriesBall).occupant;
      if (!isOnPitch(next)) {
        this.landInCrowd(context, teammate, square, carriesBall);
        return;
      }
      square = next;
    }
    knockDownPlayer(eventBus, teammate);

    bounceIfBallUnder(context, teammate);
    context.flowManager.add(new ArmourOperation(teammate.id), true);

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
    delete teammate.gridPosition;
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
        { reason: "Landing",target: teammate.stats.AG,modifier: (superbThrow? 0:-1)-landingMarkers,playerName: teammate.playerName,teamId: teammate.teamId }      );
    let land = rollLanding();
    if (!land.success && swooped) {
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
      if (!carriesBall) bounceIfBallUnder(context, teammate);
      this.landSafely(context, thrower, teammate, superbThrow, carriesBall);
      return;
    }

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${teammate.playerName} fails to land and is Prone!`
    );
    knockDownPlayer(eventBus, teammate);

    bounceIfBallUnder(context, teammate);
    context.flowManager.add(new ArmourOperation(teammate.id), true);
    this.finishLanding(
      gameService,
      context,
      carriesBall,
      "Thrown player landed Prone"
    );
  }

  private landSafely(
    context: FlowContext,
    thrower: Player,
    teammate: Player,
    superbThrow: boolean,
    carriesBall: boolean
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

    if (carriesBall && context.gameService.checkForTouchdown(teammate.id))
      return;
    context.flowManager.add(
      new FinishActivationOperation("FinishThrowTeammate", this.throwerId)
    );
  }

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
    context.flowManager.add(
      new FinishActivationOperation("FinishThrowTeammate", this.throwerId)
    );
  }
}
