import { IEventBus } from "../../services/EventBus";
import { GameState, GamePhase, SubPhase } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { GameEventNames } from "../../types/events";

import { WeatherManager } from "./WeatherManager";
import { KickoffController } from "../controllers/KickoffController";
import { PickupController } from "../controllers/PickupController";
import { BallMovementController } from "../controllers/BallMovementController";
import { DiceController } from "../controllers/DiceController";
import { GameConfig } from "../../config/GameConfig";
import { CatchOperation } from "../operations/CatchOperation";
import { BounceOperation } from "../operations/BounceOperation";
import { ReactionDecisionAnswer } from "../../types/decisions";
import {
  KICKOFF_EVENT_MEANING,
  KickoffEventOutcome,
} from "../kickoff/kickoffEvents";

/**
 * BallManager
 *
 * Purpose: The central authority for the Ball's state and lifecycle.
 * It maintians the "Single Source of Truth" for where the ball is and who has it.
 * It orchestrates high-level sequences but delegates specific rule calculations to controllers.
 */
export class BallManager {
  public movementController: BallMovementController; // Public so GameService can inject it into PassController
  public kickoffController: KickoffController;
  public pickupController: PickupController;

  /** Kick landed out of bounds / short: resolve as a touchback once play starts */
  private pendingTouchback: boolean = false;
  /** Waiting for the receiving coach to hand the ball to one of their players */
  private touchbackTeamId: string | null = null;
  /** Team orientation for the kickoff currently in flight. */
  private isTeam1Kicking = true;

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    _weatherService: WeatherManager,
    private diceController: DiceController,
    private callbacks: {
      onTurnover: (reason: string) => void;
      onPhaseChange: (phase: GamePhase, subPhase: SubPhase) => void;
      onBallPlaced: (x: number, y: number) => void;
      getFlowManager?: () => import("../core/GameFlowManager").GameFlowManager;
      /** Resolve the Sevens event, pausing while an interactive step is open. */
      resolveKickoffEvent?: (isTeam1Kicking: boolean) => Promise<void>;
      /** High Kick is offered after deviation, before the ball lands. */
      resolveHighKickStep?: (
        isTeam1Kicking: boolean,
        landingSquare: { x: number; y: number }
      ) => Promise<void>;
      /** Changing Weather / Perfect Conditions adds Scatter (3). */
      consumeWeatherScatterPending?: () => boolean;
    },
    private delay: import("../core/GameFlowManager").DelayProvider = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {
    // Instantiate controllers with DiceController
    this.movementController = new BallMovementController(this.diceController);
    this.kickoffController = new KickoffController(
      this.movementController,
      this.diceController
    );
    this.pickupController = new PickupController(eventBus, this.diceController);
  }

  // --- KICKOFF ORCHESTRATION ---

  public async kickBall(
    isTeam1Kicking: boolean,
    playerId: string,
    targetX: number,
    targetY: number
  ): Promise<void> {
    this.isTeam1Kicking = isTeam1Kicking;
    // 1. Transition State
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.ROLL_KICKOFF);

    // Kick (p.130): a nominated kicker with the Kick skill lets their coach
    // halve the deviation to D3. The reduced deviation is always the safer
    // choice (the ball lands nearer the aim), so it is applied whenever the
    // kicker has the skill.
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

    // 2. Calculate Deviation (using Controller)
    const result = this.kickoffController.calculateKickDestination(
      targetX,
      targetY,
      isTeam1Kicking,
      useKickD3
    );

    // 3. Update State. A kick landing out of bounds or in the kicking
    // team's own third is a Touchback (p.71): the ball never lands — the
    // receiving coach hands it to any of their players once play starts.
    this.pendingTouchback = result.isTouchback;
    if (result.isTouchback) {
      this.state.ballPosition = null;
      this.eventBus.emit(GameEventNames.UI_Notification, "Touchback!");
    } else {
      this.state.ballPosition = { x: result.finalX, y: result.finalY };
    }

    // On the Ball's kick-off clause sits exactly here: deviation is known,
    // but no Kick-off Event has been rolled yet. Touchbacks suppress it.
    if (!result.isTouchback) {
      await this.resolveKickoffOnTheBall(isTeam1Kicking);
    }

    // 4. Put the ball in the air before resolving the table. The browser
    // keeps the real ball airborne and shows a translucent landing preview
    // while any interactive kickoff step is open.
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

    // 5. Resolve the Event Table. Awaiting here is what lets interactive
    // kickoff steps suspend browser/headless/online execution consistently
    // while the ball remains visibly airborne.
    // The browser's airborne tween is 800ms. Do not roll the table until
    // the enlarged ball has reached its deviated square.
    await this.delay(900);
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.RESOLVE_KICKOFF);
    await this.resolveKickoffEvent();

    await this.finishKickoffResolution();
  }

  /**
   * One Open receiving player may make a legal, no-Rush move of up to three
   * squares. The engine's deterministic policy chooses the first eligible
   * player and a safe route toward the deviated ball; the reaction decision
   * still belongs to the receiving coach.
   */
  private async resolveKickoffOnTheBall(
    isTeam1Kicking: boolean
  ): Promise<void> {
    const receiving = isTeam1Kicking ? this.team2 : this.team1;
    const opponents = isTeam1Kicking ? this.team1 : this.team2;
    const isOpen = (player: Player) =>
      !!player.gridPosition &&
      !opponents.players.some(
        (opponent) =>
          opponent.status === PlayerStatus.ACTIVE &&
          opponent.gridPosition &&
          Math.max(
            Math.abs(opponent.gridPosition.x - player.gridPosition!.x),
            Math.abs(opponent.gridPosition.y - player.gridPosition!.y)
          ) === 1
      );
    const reactor = receiving.players
      .filter(
        (player) =>
          player.status === PlayerStatus.ACTIVE &&
          hasSkill(player.skills ?? [], SkillType.ON_THE_BALL) &&
          isOpen(player)
      )
      .sort(
        (a, b) =>
          a.gridPosition!.y - b.gridPosition!.y ||
          a.gridPosition!.x - b.gridPosition!.x
      )[0];
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
      const current = reactor.gridPosition;
      const occupied = new Set(
        [...this.team1.players, ...this.team2.players]
          .filter((player) => player.id !== reactor.id && player.gridPosition)
          .map(
            (player) => `${player.gridPosition!.x},${player.gridPosition!.y}`
          )
      );
      const candidates: { x: number; y: number }[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const square = { x: current.x + dx, y: current.y + dy };
          const staysOwnHalf = isTeam1Kicking
            ? square.x >= GameConfig.PITCH_WIDTH / 2
            : square.x < GameConfig.PITCH_WIDTH / 2;
          const marked = opponents.players.some(
            (opponent) =>
              opponent.status === PlayerStatus.ACTIVE &&
              opponent.gridPosition &&
              Math.max(
                Math.abs(opponent.gridPosition.x - square.x),
                Math.abs(opponent.gridPosition.y - square.y)
              ) === 1
          );
          if (
            square.x >= 0 &&
            square.x < GameConfig.PITCH_WIDTH &&
            square.y >= 0 &&
            square.y < GameConfig.PITCH_HEIGHT &&
            staysOwnHalf &&
            !marked &&
            !occupied.has(`${square.x},${square.y}`)
          ) {
            candidates.push(square);
          }
        }
      }
      candidates.sort(
        (a, b) =>
          Math.max(
            Math.abs(a.x - this.state.ballPosition!.x),
            Math.abs(a.y - this.state.ballPosition!.y)
          ) -
            Math.max(
              Math.abs(b.x - this.state.ballPosition!.x),
              Math.abs(b.y - this.state.ballPosition!.y)
            ) ||
          a.y - b.y ||
          a.x - b.x
      );
      const next = candidates[0];
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
      // Lightweight/unit-test fallback when BallManager is constructed alone.
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
      await this.callbacks.resolveHighKickStep(
        this.isTeam1Kicking,
        { ...this.state.ballPosition }
      );
    }

    if (
      this.state.ballPosition &&
      this.callbacks.consumeWeatherScatterPending?.()
    ) {
      const from = { ...this.state.ballPosition };
      const path = this.movementController.scatter(from);
      const to = path[path.length - 1];
      const offPitch =
        to.x < 0 ||
        to.x >= GameConfig.PITCH_WIDTH ||
        to.y < 0 ||
        to.y >= GameConfig.PITCH_HEIGHT;
      const ownThird = this.isTeam1Kicking ? to.x < 7 : to.x > 13;
      this.pendingTouchback = offPitch || ownThird;
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
        // Let the same enlarged ball finish moving to the weather-adjusted
        // square before starting its landing tween.
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

    // This must precede ReadyToStart: that event changes phase
    // synchronously and removes the kickoff handler's listeners.
    this.eventBus.emit(GameEventNames.KickoffSequenceCompleted, {
      isTouchback: this.pendingTouchback,
    });

    // ReadyToStart handlers call startGame synchronously, so once emit
    // returns the receiving team is the active team.
    this.eventBus.emit(GameEventNames.ReadyToStart);

    if (this.pendingTouchback) {
      this.pendingTouchback = false;
      this.touchbackTeamId = this.state.activeTeamId;
      if (this.touchbackTeamId) {
        this.eventBus.emit(GameEventNames.TouchbackAwarded, {
          teamId: this.touchbackTeamId,
        });
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          "Touchback! Choose any of your players to take the ball."
        );
      }
    } else if (this.state.ballPosition) {
      const landing = { ...this.state.ballPosition };
      const occupant = this.playerAt(landing);
      const catcher = occupant ?? this.divingCatcherAt(landing);
      if (catcher) {
        this.callbacks.getFlowManager?.()?.add(
          new CatchOperation(catcher.id, false, {
            origin: "kick-off",
            divingCatch: !occupant,
            landingPosition: landing,
          }),
          true
        );
      } else {
        // A kickoff landing in an empty square bounces once. This happens
        // only after the airborne animation and kickoff table resolution.
        this.callbacks
          .getFlowManager?.()
          ?.add(new BounceOperation(landing), true);
      }
    }
  }

  /**
   * Touchback resolution (p.71): the receiving coach gives the ball to any
   * of their standing players on the pitch. Returns false while no
   * touchback is pending or for an invalid choice.
   */
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

  /** True while a touchback waits for the receiving coach's choice. */
  public isTouchbackPending(): boolean {
    return this.touchbackTeamId !== null;
  }

  /**
   * Throw-in (rulebook p.73): the crowd throws the ball back from the last
   * square it occupied. D6 picks one of the three infield directions from
   * the exit edge; the ball travels 2D6 squares (exit square counts as the
   * first). Leaves the pitch again → repeat. Lands occupied → catch attempt;
   * lands empty → ball rests there.
   */
  public throwIn(from: { x: number; y: number }): void {
    const maxX = GameConfig.PITCH_WIDTH - 1;
    const maxY = GameConfig.PITCH_HEIGHT - 1;

    // Infield directions for the edge the ball left from
    let dirs: { x: number; y: number }[];
    if (from.x <= 0)
      dirs = [
        { x: 1, y: -1 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ];
    else if (from.x >= maxX)
      dirs = [
        { x: -1, y: -1 },
        { x: -1, y: 0 },
        { x: -1, y: 1 },
      ];
    else if (from.y <= 0)
      dirs = [
        { x: -1, y: 1 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ];
    else
      dirs = [
        { x: -1, y: -1 },
        { x: 0, y: -1 },
        { x: 1, y: -1 },
      ];

    const directionRoll = this.diceController.rollD6("Throw-in Direction");
    const dir = dirs[Math.floor((directionRoll - 1) / 2)];

    const distance =
      this.diceController.rollD6("Throw-in Distance") +
      this.diceController.rollD6("Throw-in Distance");

    // Exit square counts as the first square travelled
    const landing = {
      x: from.x + dir.x * (distance - 1),
      y: from.y + dir.y * (distance - 1),
    };

    if (
      landing.x < 0 ||
      landing.x > maxX ||
      landing.y < 0 ||
      landing.y > maxY
    ) {
      // Left the pitch again: repeat from the last on-pitch square along dir
      const steps = distance - 1;
      let lastIn = { ...from };
      for (let s = 1; s <= steps; s++) {
        const p = { x: from.x + dir.x * s, y: from.y + dir.y * s };
        if (p.x < 0 || p.x > maxX || p.y < 0 || p.y > maxY) break;
        lastIn = p;
      }
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
      // A dropped throw-in is not a turnover
      this.callbacks
        .getFlowManager?.()
        ?.add(
          new CatchOperation(occupant.id, false, { origin: "throw-in" }),
          true
        );
    } else {
      const catcher = this.divingCatcherAt(landing);
      if (catcher) {
        this.callbacks.getFlowManager?.()?.add(
          new CatchOperation(catcher.id, false, {
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

  // --- PICKUP ORCHESTRATION ---

  public attemptPickup(
    player: Player,
    position: { x: number; y: number }
  ): boolean {
    // 1. Calculate Modifiers (State dependent)
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

    // 2. Delegate to Controller
    const result = this.pickupController.attemptPickup(player, standingEnemies);

    // 3. Handle Result
    if (!result.success) {
      // Bounce Logic handled by GameService usually for turn end?
      // Or should Manager do it?
      // The original code returned false and triggered turnover.
      // We should bounce the ball here too if we want MANAGER to manage ball.

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
    // We don't have direct access to players list here trivially unless we search teams
    // But we usually call this from GameService which passes player ID.
    // Actually, checking if a player has the ball requires checking their position vs ball position.
    // We need to find the player first.

    // Optimization: If we trust the caller to check valid player, we just need coordinates.
    // But we only have ID.
    const p1 = this.team1.players.find((p) => p.id === playerId);
    const p2 = this.team2.players.find((p) => p.id === playerId);
    const player = p1 || p2;

    if (!player || !player.gridPosition || !this.state.ballPosition)
      return false;

    return (
      player.gridPosition.x === this.state.ballPosition.x &&
      player.gridPosition.y === this.state.ballPosition.y
    );
  }
}
