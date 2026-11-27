import { ballOnSquare } from "@/game/rules/ballInTheAir";
import { DIE_LANDING_TIMEOUT_MS, DiceWatch } from "../presentation/diceWatch";
import { whenMomentsComplete } from "../presentation/momentQueue";
import {
  type DelayProvider,
  type GameFlowManager,
  realTimeDelay,
  waitAtMost,
} from "../core/GameFlowManager";
import { type IEventBus } from "../../services/EventBus";
import { type GameState, GamePhase, SubPhase } from "@/types/GameState";
import { type Team } from "@/types/Team";
import { type Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { GameEventNames } from "../../types/events";

import { WeatherManager } from "./WeatherManager";
import { KickoffController } from "../controllers/KickoffController";
import { PickupController } from "../controllers/PickupController";
import { BallMovementController } from "../controllers/BallMovementController";
import { DiceController } from "../controllers/DiceController";
import { CatchOperation } from "../operations/CatchOperation";
import {
  kickoffOnTheBallReactor,
  kickoffOnTheBallStep,
  throwInDirections,
} from "./ballPaths";
import {
  type WallHit,
  lastSquareIn,
  leavesByWall,
  ricochetFlight,
  settleKick,
  settleOffObstacle,
} from "../rules/ballFlight";
import { edgeCrossed, isOnPitch } from "../rules/pitchSquares";
import { activeRules } from "../variants/activeMatch";
import type { Frame } from "../rules/frames";
import {
  everyone,
  opponentsOf,
  pairTeams,
  playerAt,
  playerById,
  type Seating,
  seatOf,
  teamsOf,
} from "../seating";
import { inOwnHalf } from "../rules/frames";
import { BounceOperation } from "../operations/BounceOperation";
import { type ReactionDecisionAnswer } from "../../types/decisions";
import {
  type KickRecord,
  type KickStage,
  type KickoffRehearsal,
  newKick,
} from "../kickoff/kickRecord";
import { kickLandsAsTouchback } from "../kickoff/ballConditions";

const SCATTER_SHOWN_GUARD_MS = DIE_LANDING_TIMEOUT_MS + 4000;

interface BallCallbacks {
  onTurnover: (reason: string) => void;
  onPhaseChange: (phase: GamePhase, subPhase: SubPhase) => void;
  onBallPlaced: (x: number, y: number) => void;
  getFlowManager?: () => GameFlowManager;

  rollEvent?: (kick: KickRecord) => Promise<void>;

  coachStep?: (kick: KickRecord) => Promise<void>;

  abandonStep?: () => void;
}

export class BallManager {
  public movementController: BallMovementController;
  public kickoffController: KickoffController;
  public pickupController: PickupController;

  private flight: Promise<void> | null = null;

  private eventBus: IEventBus;
  private state: GameState;
  private seating: Seating;
  private diceController: DiceController;
  private callbacks: BallCallbacks;
  private delay: DelayProvider;
  constructor(
    eventBus: IEventBus,
    state: GameState,
    seating: Seating,
    _weatherService: WeatherManager,
    diceController: DiceController,
    callbacks: BallCallbacks,
    delay: DelayProvider = realTimeDelay
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.seating = seating;
    this.diceController = diceController;
    this.callbacks = callbacks;
    this.delay = delay;

    this.movementController = new BallMovementController(this.diceController);
    this.kickoffController = new KickoffController({ movementController: this.movementController, diceController: this.diceController });
    this.pickupController = new PickupController(eventBus, this.diceController);
  }

  public kickInTheAir(): Promise<void> | null {
    return this.flight;
  }

  public isKickUnderWay(): boolean {
    return this.state.kick !== undefined;
  }

  public abandonFlight(): void {
    this.flight = null;
    if (this.state.kick) this.state.kick = { ...this.state.kick };
    this.callbacks.abandonStep?.();
  }

  public forgetKick(): void {
    delete this.state.kick;
    this.abandonFlight();
  }

  public resumeKick(): Promise<void> {
    const kick = this.state.kick;
    if (!kick || kick.stage === "landed" || this.flight) return Promise.resolve();
    if (kick.stage !== "reaction") this.emitKicked(kick);
    return this.fly(kick);
  }

  private fly(kick: KickRecord): Promise<void> {
    const flight = this.runStages(kick).finally(() => {
      if (this.flight === flight) this.flight = null;
    });
    this.flight = flight;
    return flight;
  }

  private async runStages(kick: KickRecord): Promise<void> {
    while (this.state.kick === kick && kick.stage !== "landed")
      await this.runStage(kick, kick.stage);
  }

  private runStage(
    kick: KickRecord,
    stage: Exclude<KickStage, "landed">
  ): Promise<void> {
    switch (stage) {
      case "reaction":
        return this.reactToKick(kick);
      case "event":
        return this.rollEvent(kick);
      case "coach":
        return this.coachStep(kick, "high-kick");
      case "high-kick":
        return this.coachStep(kick, "scatter");
      case "scatter":
        return this.scatterInTheWind(kick);
      case "landing":
        return this.land(kick);
      case "placing":
        return this.place(kick);
    }
  }

  private async coachStep(kick: KickRecord, next: KickStage): Promise<void> {
    await this.callbacks.coachStep?.(kick);
    if (this.state.kick === kick) kick.stage = next;
  }

  private isTeam1Kicking(): boolean {
    return this.state.kick?.kickingTeamId !== pairTeams(this.seating)[1].id;
  }

  private pairTeam(isTeam1: boolean): Team {
    const [home, away] = pairTeams(this.seating);
    return isTeam1 ? home : away;
  }

  private kickingFrame(): Frame {
    return seatOf(this.seating, this.pairTeam(this.isTeam1Kicking()).id).frame;
  }

  private emitKicked({ aim }: KickRecord): void {
    const ball = this.state.ballPosition;
    const target = { x: aim?.targetX ?? 0, y: aim?.targetY ?? 0 };
    const final = ball ?? target;
    this.eventBus.emit(GameEventNames.BallKicked, {
      playerId: aim?.playerId ?? "",
      targetX: target.x,
      targetY: target.y,
      direction: 0,
      distance: 0,
      finalX: final.x,
      finalY: final.y,
      isTouchback: !ball,
    });
  }

  public kickBall(
    isTeam1Kicking: boolean,
    playerId: string,
    targetX: number,
    targetY: number
  ): Promise<void> {
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.ROLL_KICKOFF);

    const kicker = playerById(this.seating, playerId);
    const useKickD3 = !!kicker && hasSkill(kicker.skills ?? [], SkillType.KICK);
    if (useKickD3) {
      this.eventBus.emit(GameEventNames.SkillTriggered, {
        playerId,
        skill: SkillType.KICK,
        effect: "Kick: the ball Deviates only D3 squares",
      });
    }

    const result = this.kickoffController.calculateKickDestination(
      { targetX,targetY,isTeam1Kicking,useKickD3,kickingTeamId: this.pairTeam(isTeam1Kicking).id }    );

    this.announceWallHits(result.wallHits);
    if (result.isTouchback) {
      this.state.ballPosition = null;
      this.eventBus.emit(GameEventNames.UI_Notification, "Touchback!");
    } else {
      this.state.ballPosition = { x: result.finalX, y: result.finalY };
    }

    const kick = {
      ...newKick(
        this.pairTeam(isTeam1Kicking).id,
        "reaction",
        result.isTouchback
      ),
      aim: { playerId, targetX, targetY },
    };
    this.state.kick = kick;
    return this.fly(kick);
  }

  public kickTo(
    isTeam1Kicking: boolean,
    landing: { x: number; y: number },
    rehearsal: KickoffRehearsal
  ): Promise<void> {
    this.state.kick = {
      ...newKick(this.pairTeam(isTeam1Kicking).id, "event"),
      aim: { playerId: "", targetX: landing.x, targetY: landing.y },
      rehearsal,
    };
    this.state.ballPosition = { ...landing };
    return this.resumeKick();
  }

  public automaticTouchback(kickingTeamId: string): Promise<void> {
    const kick = newKick(kickingTeamId, "placing", true);
    this.state.kick = kick;
    this.state.ballPosition = null;
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      "No kicker on the pitch: Touchback!"
    );
    return this.fly(kick);
  }

  private async reactToKick(kick: KickRecord): Promise<void> {
    if (!kick.touchback) await this.resolveKickoffOnTheBall(this.isTeam1Kicking());
    if (this.state.kick !== kick) return;
    kick.stage = "event";
    this.emitKicked(kick);
  }

  private async rollEvent(kick: KickRecord): Promise<void> {
    await this.delay(900);
    if (this.state.kick !== kick) return;
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.RESOLVE_KICKOFF);
    await this.callbacks.rollEvent?.(kick);
    if (this.state.kick === kick) kick.stage = "coach";
  }

  private async resolveKickoffOnTheBall(
    isTeam1Kicking: boolean
  ): Promise<void> {
    const receiving = this.pairTeam(!isTeam1Kicking);
    const opponents = this.pairTeam(isTeam1Kicking);
    const reactor = kickoffOnTheBallReactor(receiving, opponents);
    const flow = this.callbacks.getFlowManager?.();
    if (!reactor?.gridPosition || !flow || !this.state.ballPosition) return;

    const answer = (await flow.context.gameService
      .getDecisionService()
      .request({
        type: "reaction",
        playerId: reactor.id,
        chooserTeamId: reactor.teamId,
        skill: SkillType.ON_THE_BALL,
        prompt: `${reactor.playerName} may move up to 3 squares before the Kick-off Event — use On the Ball?`,
      })) as ReactionDecisionAnswer;
    if (!answer.accept || !reactor.gridPosition) return;

    const start = { ...reactor.gridPosition };
    const path: { x: number; y: number }[] = [];
    for (let step = 0; step < 3; step++) {
      const occupied = new Set(
        everyone(this.seating)
          .filter((player) => player.id !== reactor.id && player.gridPosition)
          .map(
            (player) =>
              `${String(player.gridPosition!.x)},${String(player.gridPosition!.y)}`
          )
      );
      const next = kickoffOnTheBallStep(reactor.gridPosition, {
        occupied,
        opponents,
        isTeam1Kicking,
        ball: this.state.ballPosition,
      });
      if (!next) break;
      reactor.gridPosition = { ...next };
      path.push({ ...next });
    }

    if (path.length === 0) {
      return;
    }

    this.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: reactor.id,
      skill: SkillType.ON_THE_BALL,
      effect: "On the Ball: receiving-team move before the Kick-off Event",
    });
    this.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId: reactor.id,
      from: start,
      to: { ...reactor.gridPosition },
      path,
      ballJoinStep: 0,
    });
  }

  private async scatterInTheWind(kick: KickRecord): Promise<void> {
    const squares = kick.scatter;
    kick.scatter = 0;
    const from = this.state.ballPosition;
    if (from && squares > 0) {
      this.scatterFrom({ ...from }, squares, kick);
      await waitAtMost(
        this.delay,
        DiceWatch.shared(this.eventBus).landed(),
        SCATTER_SHOWN_GUARD_MS
      );
      await this.delay(800);
    }
    if (this.state.kick !== kick) return;
    if (
      this.state.ballPosition &&
      kickLandsAsTouchback(this.state, this.state.ballPosition)
    ) {
      kick.touchback = true;
      this.state.ballPosition = null;
    }
    kick.stage = "landing";
  }

  private scatterFrom(
    from: { x: number; y: number },
    squares: number,
    kick: KickRecord
  ): void {
    const path = this.movementController.scatter(from, "Scatter", squares);
    const to = path.at(-1);
    if (!to) throw new Error("Weather scatter produced no path");
    const settled = settleKick(
      this.diceController,
      { lastIn: path.at(-2) ?? from, to },
      this.isTeam1Kicking()
    );
    this.announceWallHits(settled.wallHits);
    kick.touchback = settled.landing === null;
    this.state.ballPosition = settled.landing ? { ...settled.landing } : null;
    this.eventBus.emit(GameEventNames.BallScattered, {
      from,
      to,
      reason: `Changing Weather: ${this.state.weather === "Nice" ? "Perfect Conditions" : this.state.weather}`,
    });
    if (this.state.ballPosition)
      this.eventBus.emit(GameEventNames.KickoffAirbornePositionChanged, {
        ...this.state.ballPosition,
      });
  }

  private async land(kick: KickRecord): Promise<void> {
    this.eventBus.emit(GameEventNames.KickoffBallLanding, {
      landingSquare: this.state.ballPosition
        ? { ...this.state.ballPosition }
        : null,
      isTouchback: kick.touchback,
    });
    await this.delay(1000);
    if (this.state.kick === kick) kick.stage = "placing";
  }

  private async place(kick: KickRecord): Promise<void> {
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.PLACE_BALL);
    await this.delay(200);
    await whenMomentsComplete(this.eventBus);
    if (this.state.kick !== kick) return;

    kick.stage = "landed";
    this.eventBus.emit(GameEventNames.KickoffSequenceCompleted, {
      isTouchback: kick.touchback,
    });
    this.eventBus.emit(GameEventNames.ReadyToStart, undefined);
    if (kick.touchback) this.awardTouchbackToReceivers(kick);
    else if (this.state.ballPosition) this.bringDown(this.state.ballPosition);
  }

  private bringDown({ x, y }: { x: number; y: number }): void {
    const landing = { x, y };
    const occupant = playerAt(this.seating, landing);
    const catcher = occupant ?? this.divingCatcherAt(landing);
    this.callbacks.getFlowManager?.().add(
      catcher
        ? new CatchOperation(catcher.id, {
            origin: "kick-off",
            divingCatch: !occupant,
            landingPosition: landing,
            kickoff: true,
          })
        : new BounceOperation(landing, true),
      true
    );
  }

  public kickoffBounceTouchback(to: { x: number; y: number }): boolean {
    const touchback = isOnPitch(to)
      ? inOwnHalf(this.kickingFrame(), to)
      : edgeCrossed(to) === "crowd";
    if (!touchback) return false;
    this.touchback();
    return true;
  }

  private touchback(): void {
    this.state.ballPosition = null;
    this.state.kick ??= newKick(pairTeams(this.seating)[0].id, "landed");
    this.awardTouchbackToReceivers(this.state.kick);
  }

  private announceWallHits(hits: readonly WallHit[]): void {
    for (const hit of hits) {
      this.eventBus.emit(GameEventNames.BallHitWall, { ...hit });
    }
  }

  private awardTouchbackToReceivers(kick: KickRecord): void {
    const team = teamsOf(this.seating).find(
      (t) => t.id === this.state.activeTeamId
    );
    const taker = team?.players.some(
      (p) => p.gridPosition && p.status === PlayerStatus.ACTIVE
    );
    kick.touchbackTeamId = taker ? (team?.id ?? null) : null;
    if (!kick.touchbackTeamId) return;
    this.eventBus.emit(GameEventNames.TouchbackAwarded, {
      teamId: kick.touchbackTeamId,
    });
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      "Touchback! Choose any of your players to take the ball."
    );
  }

  public awardTouchback(playerId: string): boolean {
    const kick = this.state.kick;
    if (!kick?.touchbackTeamId) return false;

    const player = playerById(this.seating, playerId);
    if (
      !player ||
      player.teamId !== kick.touchbackTeamId ||
      !player.gridPosition ||
      player.status !== PlayerStatus.ACTIVE
    ) {
      return false;
    }

    kick.touchbackTeamId = null;
    this.state.ballPosition = { ...player.gridPosition };
    this.callbacks.onBallPlaced(player.gridPosition.x, player.gridPosition.y);
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName} takes the touchback ball.`
    );
    return true;
  }

  public isTouchbackPending(): boolean {
    return this.state.kick?.touchbackTeamId != null;
  }

  public throwIn(
    from: { x: number; y: number },
    toward?: { x: number; y: number },
    kickoff = false
  ): void {
    const wall = leavesByWall(from, toward);
    if (wall) this.ricochet(from, wall, kickoff);
    else this.crowdThrowIn(from);
  }

  private throwInDistance(): number {
    const reason = "Throw-in Distance";
    switch (activeRules().throwInDistance) {
      case "d6+2":
        return this.diceController.rollD6(reason) + 2;
      case "2d6":
        return this.diceController.roll2D6(reason);
      case "d6":
        return this.diceController.rollD6(reason);
    }
  }

  private crowdThrowIn(from: { x: number; y: number }): void {
    const dirs = throwInDirections(from);

    const directionRoll = this.diceController.rollD6("Throw-in Direction");
    const dir = dirs[Math.floor((directionRoll - 1) / 2)];
    if (!dir)
      throw new Error(`No throw-in direction for roll ${String(directionRoll)}`);

    const distance = this.throwInDistance();

    const landing = {
      x: from.x + dir.x * (distance - 1),
      y: from.y + dir.y * (distance - 1),
    };

    if (!isOnPitch(landing)) {
      const lastIn = lastSquareIn(from, dir, distance - 1);
      const wall = leavesByWall(lastIn, {
        x: lastIn.x + dir.x,
        y: lastIn.y + dir.y,
      });
      if (wall) {
        this.ricochet(lastIn, wall, false);
        return;
      }
      this.eventBus.emit(GameEventNames.UI_Notification, "Thrown out again!");
      this.crowdThrowIn(lastIn);
      return;
    }

    this.placeThrownIn(
      from,
      settleOffObstacle(this.diceController, landing),
      distance
    );
  }

  private ricochet(
    from: { x: number; y: number },
    wall: { x: number; y: number },
    kickoff: boolean
  ): void {
    const flight = ricochetFlight(this.diceController, from, wall);
    this.announceWallHits(flight.hits);
    if (flight.kind === "crowd") {
      if (kickoff) this.touchback();
      else this.crowdThrowIn(flight.lastIn);
      return;
    }
    const landing = settleOffObstacle(this.diceController, flight.landing);
    if (kickoff && this.kickoffBounceTouchback(landing)) return;
    this.state.ballPosition = { ...landing };
    this.eventBus.emit(GameEventNames.BallPlaced, { ...landing });
    const occupant = playerAt(this.seating, landing);
    this.callbacks
      .getFlowManager?.()
      .add(
        occupant
          ? new CatchOperation(occupant.id, { origin: "bounce", kickoff })
          : new BounceOperation(landing, kickoff),
        true
      );
  }

  private placeThrownIn(
    from: { x: number; y: number },
    landing: { x: number; y: number },
    distance: number
  ): void {
    this.state.ballPosition = { x: landing.x, y: landing.y };
    this.eventBus.emit(GameEventNames.BallThrownIn, {
      from,
      to: landing,
      distance,
    });
    this.eventBus.emit(GameEventNames.BallPlaced, landing);

    const occupant = playerAt(this.seating, landing);
    if (occupant) {
      this.callbacks
        .getFlowManager?.()
        ?.add(new CatchOperation(occupant.id, { origin: "throw-in" }), true);
    } else {
      const catcher = this.divingCatcherAt(landing);
      if (catcher) {
        this.callbacks.getFlowManager?.()?.add(
          new CatchOperation(catcher.id, {
            origin: "throw-in",
            divingCatch: true,
            landingPosition: landing,
          }),
          true
        );
      }
    }
  }

  private divingCatcherAt(landing: {
    x: number;
    y: number;
  }): Player | undefined {
    return everyone(this.seating)
      .filter(
        (player) =>
          player.gridPosition &&
          player.status === PlayerStatus.ACTIVE &&
          hasSkill(player.skills ?? [], SkillType.DIVING_CATCH) &&
          Math.max(
            Math.abs(player.gridPosition.x - landing.x),
            Math.abs(player.gridPosition.y - landing.y)
          ) === 1
      )
      .sort(
        (a, b) =>
          a.gridPosition!.y - b.gridPosition!.y ||
          a.gridPosition!.x - b.gridPosition!.x
      )[0];
  }

  public attemptPickup(
    player: Player,
    position: { x: number; y: number }
  ): boolean {
    let standingEnemies = 0;

    for (const p of opponentsOf(this.seating, player.teamId)) {
      if (!(p.status === PlayerStatus.ACTIVE && p.gridPosition)) {
        continue;
      }

      const dx = Math.abs(p.gridPosition.x - position.x);
      const dy = Math.abs(p.gridPosition.y - position.y);
      if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
        standingEnemies++;
      }
    }

    const result = this.pickupController.attemptPickup(player, standingEnemies);

    if (!result.success) {
      const bouncePos = this.movementController.bounce(position);
      this.state.ballPosition = bouncePos;
      this.callbacks.onBallPlaced(bouncePos.x, bouncePos.y);

      this.eventBus.emit(GameEventNames.BallScattered, {
        from: position,
        to: bouncePos,
        reason: "Failed Pickup",
      });

      this.callbacks.onTurnover("Failed Pickup");
      return false;
    }

    return true;
  }

  public hasBall(playerId: string): boolean {
    const player = playerById(this.seating, playerId);

    return !!player && ballOnSquare(this.state, player.gridPosition);
  }
}
