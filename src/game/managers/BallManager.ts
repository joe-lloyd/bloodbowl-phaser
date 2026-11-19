import { ballOnSquare } from "@/game/rules/ballInTheAir";
import { whenMomentsComplete } from "../presentation/momentQueue";
import { realTimeDelay } from "../core/GameFlowManager";
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
import { GameConfig, isKickingTeamTerritory } from "../../config/GameConfig";
import { CatchOperation } from "../operations/CatchOperation";
import {
  isOffPitch,
  kickoffOnTheBallReactor,
  kickoffOnTheBallStep,
  lastSquareIn,
  throwInDirections,
} from "./ballPaths";
import { BounceOperation } from "../operations/BounceOperation";
import { type ReactionDecisionAnswer } from "../../types/decisions";
import {
  KICKOFF_EVENT_MEANING,
  type KickoffEventOutcome,
} from "../kickoff/kickoffEvents";

export class BallManager {
  public movementController: BallMovementController;
  public kickoffController: KickoffController;
  public pickupController: PickupController;

  private pendingTouchback = false;

  private touchbackTeamId: string | null = null;

  private isTeam1Kicking = true;

  private eventBus: IEventBus;
  private state: GameState;
  private team1: Team;
  private team2: Team;
  private diceController: DiceController;
  private callbacks: {
    onTurnover: (reason: string) => void;
    onPhaseChange: (phase: GamePhase, subPhase: SubPhase) => void;
    onBallPlaced: (x: number, y: number) => void;
    getFlowManager?: () => import("../core/GameFlowManager").GameFlowManager;

    resolveKickoffEvent?: (isTeam1Kicking: boolean) => Promise<void>;

    resolveHighKickStep?: (
      isTeam1Kicking: boolean,
      landingSquare: { x: number; y: number }
    ) => Promise<void>;

    consumeWeatherScatterPending?: () => boolean;
  };
  private delay: import("../core/GameFlowManager").DelayProvider;
  constructor(
    eventBus: IEventBus,
    state: GameState,
    team1: Team,
    team2: Team,
    _weatherService: WeatherManager,
    diceController: DiceController,
    callbacks: {
      onTurnover: (reason: string) => void;
      onPhaseChange: (phase: GamePhase, subPhase: SubPhase) => void;
      onBallPlaced: (x: number, y: number) => void;
      getFlowManager?: () => import("../core/GameFlowManager").GameFlowManager;

      resolveKickoffEvent?: (isTeam1Kicking: boolean) => Promise<void>;

      resolveHighKickStep?: (
        isTeam1Kicking: boolean,
        landingSquare: { x: number; y: number }
      ) => Promise<void>;

      consumeWeatherScatterPending?: () => boolean;
    },
    delay: import("../core/GameFlowManager").DelayProvider = realTimeDelay
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.team1 = team1;
    this.team2 = team2;
    this.diceController = diceController;
    this.callbacks = callbacks;
    this.delay = delay;

    this.movementController = new BallMovementController(this.diceController);
    this.kickoffController = new KickoffController({ movementController: this.movementController, diceController: this.diceController });
    this.pickupController = new PickupController(eventBus, this.diceController);
  }

  public async kickBall(
    isTeam1Kicking: boolean,
    playerId: string,
    targetX: number,
    targetY: number
  ): Promise<void> {
    this.isTeam1Kicking = isTeam1Kicking;

    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.ROLL_KICKOFF);

    if (this.state.kickoffKickResolved) {
      this.isTeam1Kicking = this.state.kickoffKickResolved.isTeam1Kicking;
      this.pendingTouchback = this.state.ballPosition === null;
      if (this.pendingTouchback) {
        this.eventBus.emit(GameEventNames.UI_Notification, "Touchback!");
      }
      this.eventBus.emit(GameEventNames.BallKicked, {
        playerId,
        targetX,
        targetY,
        direction: 0,
        distance: 0,
        finalX: this.state.ballPosition?.x ?? targetX,
        finalY: this.state.ballPosition?.y ?? targetY,
        isTouchback: this.pendingTouchback,
      });
      await this.delay(900);
      this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.RESOLVE_KICKOFF);
      await this.resolveKickoffEvent();
      await this.finishKickoffResolution();
      return;
    }

    const kicker = [...this.team1.players, ...this.team2.players].find(
      (p) => p.id === playerId
    );
    const useKickD3 = !!kicker && hasSkill(kicker.skills ?? [], SkillType.KICK);
    if (useKickD3) {
      this.eventBus.emit(GameEventNames.SkillTriggered, {
        playerId,
        skill: SkillType.KICK,
        effect: "Kick: the ball Deviates only D3 squares",
      });
    }

    const result = this.kickoffController.calculateKickDestination(
      { targetX,targetY,isTeam1Kicking,useKickD3,kickingTeamId: isTeam1Kicking? this.team1.id:this.team2.id }    );

    this.pendingTouchback = result.isTouchback;
    if (result.isTouchback) {
      this.state.ballPosition = null;
      this.eventBus.emit(GameEventNames.UI_Notification, "Touchback!");
    } else {
      this.state.ballPosition = { x: result.finalX, y: result.finalY };
    }

    this.state.kickoffKickResolved = { isTeam1Kicking };

    if (!result.isTouchback) {
      await this.resolveKickoffOnTheBall(isTeam1Kicking);
    }

    this.eventBus.emit(GameEventNames.BallKicked, {
      playerId,
      targetX,
      targetY,
      direction: 0,
      distance: 0,
      finalX: result.finalX,
      finalY: result.finalY,
      isTouchback: result.isTouchback,
    });

    await this.delay(900);
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.RESOLVE_KICKOFF);
    await this.resolveKickoffEvent();

    await this.finishKickoffResolution();
  }

  public async automaticTouchback(isTeam1Kicking: boolean): Promise<void> {
    this.isTeam1Kicking = isTeam1Kicking;
    this.state.kickoffKickResolved = { isTeam1Kicking };
    this.state.ballPosition = null;
    this.pendingTouchback = true;
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      "No kicker on the pitch: Touchback!"
    );
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.PLACE_BALL);
    await this.resolveBallPlacement();
  }

  private async resolveKickoffOnTheBall(
    isTeam1Kicking: boolean
  ): Promise<void> {
    const receiving = isTeam1Kicking ? this.team2 : this.team1;
    const opponents = isTeam1Kicking ? this.team1 : this.team2;
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
        [...this.team1.players, ...this.team2.players]
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

    if (path.length) {
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
  }

  public async rollKickoff(): Promise<void> {
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.RESOLVE_KICKOFF);
    await this.resolveKickoffEvent();
    await this.finishKickoffResolution();
  }

  private async resolveKickoffEvent(): Promise<void> {
    if (this.callbacks.resolveKickoffEvent) {
      await this.callbacks.resolveKickoffEvent(this.isTeam1Kicking);
    } else {
      const { roll, event } = this.kickoffController.rollKickoffEvent();
      const outcome: KickoffEventOutcome = {
        event,
        meaning: KICKOFF_EVENT_MEANING[event],
        perTeam: {},
      };
      this.eventBus.emit(GameEventNames.KickoffResult, {
        roll,
        event,
        meaning: outcome.meaning,
        outcome,
      });
    }
  }

  private async finishKickoffResolution(): Promise<void> {
    if (this.state.ballPosition && this.callbacks.resolveHighKickStep) {
      await this.callbacks.resolveHighKickStep(this.isTeam1Kicking, {
        ...this.state.ballPosition,
      });
    }

    if (
      this.state.ballPosition &&
      this.callbacks.consumeWeatherScatterPending?.()
    ) {
      const from = { ...this.state.ballPosition };
      const path = this.movementController.scatter(from);
      const to = path[path.length - 1];
      if (!to) throw new Error("Weather scatter produced no path");
      const offPitch =
        to.x < 0 ||
        to.x >= GameConfig.PITCH_WIDTH ||
        to.y < 0 ||
        to.y >= GameConfig.PITCH_HEIGHT;
      this.pendingTouchback =
        offPitch || isKickingTeamTerritory(to.x, this.isTeam1Kicking);
      this.state.ballPosition = this.pendingTouchback ? null : { ...to };
      this.eventBus.emit(GameEventNames.BallScattered, {
        from,
        to,
        reason: "Changing Weather: Perfect Conditions",
      });
      if (this.state.ballPosition) {
        this.eventBus.emit(GameEventNames.KickoffAirbornePositionChanged, {
          ...this.state.ballPosition,
        });

        await this.delay(800);
      }
    }

    this.eventBus.emit(GameEventNames.KickoffBallLanding, {
      landingSquare: this.state.ballPosition
        ? { ...this.state.ballPosition }
        : null,
      isTouchback: this.pendingTouchback,
    });

    await this.delay(1000);
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.PLACE_BALL);
    await this.resolveBallPlacement();
  }

  public async resolveBallPlacement(): Promise<void> {
    await this.delay(200);
    await whenMomentsComplete(this.eventBus);

    this.eventBus.emit(GameEventNames.KickoffSequenceCompleted, {
      isTouchback: this.pendingTouchback,
    });

    this.eventBus.emit(GameEventNames.ReadyToStart, undefined);

    if (this.pendingTouchback) {
      this.pendingTouchback = false;
      this.awardTouchbackToReceivers();
    } else if (this.state.ballPosition) {
      const landing = { ...this.state.ballPosition };
      const occupant = this.playerAt(landing);
      const catcher = occupant ?? this.divingCatcherAt(landing);
      if (catcher) {
        this.callbacks.getFlowManager?.()?.add(
          new CatchOperation(catcher.id, {
            origin: "kick-off",
            divingCatch: !occupant,
            landingPosition: landing,
            kickoff: true,
          }),
          true
        );
      } else {
        this.callbacks
          .getFlowManager?.()
          ?.add(new BounceOperation(landing, true), true);
      }
    }
  }

  public kickoffBounceTouchback(to: { x: number; y: number }): boolean {
    const offPitch =
      to.x < 0 ||
      to.x >= GameConfig.PITCH_WIDTH ||
      to.y < 0 ||
      to.y >= GameConfig.PITCH_HEIGHT;
    if (!offPitch && !isKickingTeamTerritory(to.x, this.isTeam1Kicking)) {
      return false;
    }
    this.state.ballPosition = null;
    this.awardTouchbackToReceivers();
    return true;
  }

  private awardTouchbackToReceivers(): void {
    const team = [this.team1, this.team2].find(
      (t) => t.id === this.state.activeTeamId
    );
    // Nobody standing on the pitch can take it: the ball stays out of play.
    const taker = team?.players.some(
      (p) => p.gridPosition && p.status === PlayerStatus.ACTIVE
    );
    this.touchbackTeamId = taker ? (team?.id ?? null) : null;
    if (!this.touchbackTeamId) return;
    this.eventBus.emit(GameEventNames.TouchbackAwarded, {
      teamId: this.touchbackTeamId,
    });
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      "Touchback! Choose any of your players to take the ball."
    );
  }

  public awardTouchback(playerId: string): boolean {
    if (!this.touchbackTeamId) return false;

    const player = [...this.team1.players, ...this.team2.players].find(
      (p) => p.id === playerId
    );
    if (
      !player ||
      player.teamId !== this.touchbackTeamId ||
      !player.gridPosition ||
      player.status !== PlayerStatus.ACTIVE
    ) {
      return false;
    }

    this.touchbackTeamId = null;
    this.state.ballPosition = { ...player.gridPosition };
    this.callbacks.onBallPlaced(player.gridPosition.x, player.gridPosition.y);
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName} takes the touchback ball.`
    );
    return true;
  }

  public isTouchbackPending(): boolean {
    return this.touchbackTeamId !== null;
  }

  public throwIn(from: { x: number; y: number }): void {
    const dirs = throwInDirections(from);

    const directionRoll = this.diceController.rollD6("Throw-in Direction");
    const dir = dirs[Math.floor((directionRoll - 1) / 2)];
    if (!dir)
      throw new Error(`No throw-in direction for roll ${String(directionRoll)}`);

    const distance = this.diceController.rollD6("Throw-in Distance") + 2;

    const landing = {
      x: from.x + dir.x * (distance - 1),
      y: from.y + dir.y * (distance - 1),
    };

    if (isOffPitch(landing)) {
      const lastIn = lastSquareIn(from, dir, distance - 1);
      this.eventBus.emit(GameEventNames.UI_Notification, "Thrown out again!");
      this.throwIn(lastIn);
      return;
    }

    this.state.ballPosition = { x: landing.x, y: landing.y };
    this.eventBus.emit(GameEventNames.BallThrownIn, {
      from,
      to: landing,
      distance,
    });
    this.eventBus.emit(GameEventNames.BallPlaced, landing);

    const occupant = [...this.team1.players, ...this.team2.players].find(
      (p) =>
        p.gridPosition &&
        p.gridPosition.x === landing.x &&
        p.gridPosition.y === landing.y
    );
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

  private playerAt(square: { x: number; y: number }): Player | undefined {
    return [...this.team1.players, ...this.team2.players].find(
      (player) =>
        player.gridPosition?.x === square.x &&
        player.gridPosition?.y === square.y
    );
  }

  private divingCatcherAt(landing: {
    x: number;
    y: number;
  }): Player | undefined {
    return [...this.team1.players, ...this.team2.players]
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
    const oppTeam = player.teamId === this.team1.id ? this.team2 : this.team1;
    let standingEnemies = 0;

    oppTeam.players.forEach((p) => {
      if (p.status === PlayerStatus.ACTIVE && p.gridPosition) {
        const dx = Math.abs(p.gridPosition.x - position.x);
        const dy = Math.abs(p.gridPosition.y - position.y);
        if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
          standingEnemies++;
        }
      }
    });

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
    const p1 = this.team1.players.find((p) => p.id === playerId);
    const p2 = this.team2.players.find((p) => p.id === playerId);
    const player = p1 || p2;

    return !!player && ballOnSquare(this.state, player.gridPosition);
  }
}
