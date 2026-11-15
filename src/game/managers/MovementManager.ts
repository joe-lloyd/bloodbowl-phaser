import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import {
  Player,
  PlayerStatus,
  PlayerCondition,
  hasCondition,
} from "@/types/Player";
import { MovementValidator } from "../validators/MovementValidator";
import { GameEventNames } from "../../types/events";
import { DodgeController } from "../controllers/DodgeController";
import { DiceController } from "../controllers/DiceController";
import { FlowContext } from "../core/GameFlowManager";
import { moveAllowance, standUpCost } from "../skills/movement";
import {
  effectiveMA as driveEffectiveMA,
  withDriveModifiers,
} from "../kickoff/driveEffects";
import { SkillType, hasSkill } from "../../types/Skills";
import {
  MovementDeps,
  findPlayer,
  movementUsed,
  rollToStand,
} from "./movementShared";
import { movePlayer } from "./moveAction";
import { jumpPlayer } from "./jumpAction";

export class MovementManager {
  private movementValidator: MovementValidator = new MovementValidator();
  private readonly deps: MovementDeps;

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    private diceController: DiceController,
    private callbacks: {
      onTurnover: (reason: string) => void;
      onActivationFinished: (playerId: string) => void;
      onTouchdown?: (teamId: string, scorerId: string) => void;
    }
  ) {
    this.deps = {
      eventBus,
      state,
      team1,
      team2,
      diceController,
      dodgeController: new DodgeController(diceController),
      movementValidator: this.movementValidator,
      callbacks,
    };
  }

  public getMovementUsed(playerId: string): number {
    return movementUsed(this.state, playerId);
  }

  public getAvailableMovements(
    playerId: string
  ): { x: number; y: number; cost?: number }[] {
    const player = findPlayer(this.deps, playerId);
    if (!player || player.teamId !== this.state.activeTeamId) return [];
    // Rooted and Chomped players may not leave their square.
    if (
      hasCondition(player, PlayerCondition.ROOTED) ||
      hasCondition(player, PlayerCondition.CHOMPED)
    ) {
      return [];
    }

    const used = this.getMovementUsed(playerId);
    const ma = driveEffectiveMA(player, this.state);

    if (used >= moveAllowance(withDriveModifiers(player, this.state)))
      return [];

    const team = player.teamId === this.team1.id ? this.team1 : this.team2;
    const opponentTeam =
      player.teamId === this.team1.id ? this.team2 : this.team1;

    // Every positioned player blocks a square, whatever their status.
    const opponents = opponentTeam.players.filter((p) => p.gridPosition);
    const teammates = team.players.filter(
      (p) => p.gridPosition && p.id !== player.id
    );

    let remainingMA = ma - used;
    if (player.status === PlayerStatus.PRONE) {
      remainingMA = Math.max(0, remainingMA - standUpCost(player));
    }

    const proxyPlayer = {
      ...player,
      stats: {
        ...player.stats,
        MA: remainingMA,
      },
    };

    return this.movementValidator.findReachableSquares(
      proxyPlayer as Player,
      opponents,
      teammates
    );
  }

  public async standUp(playerId: string): Promise<void> {
    const player = findPlayer(this.deps, playerId);
    if (!player || player.status !== PlayerStatus.PRONE) {
      return Promise.reject("Player is not prone");
    }
    // Drive modifiers (Dodgy Snack) apply to stand-up MA costs/rolls
    const maView = withDriveModifiers(player, this.state);

    // Jump Up (2025 p.130), SECOND clause: standing up to make a declared
    // Block is gated on an Agility test with a +1 modifier — this is not the
    // free stand-up the first clause grants during a movement Action. A
    // failed test leaves the player Prone and wastes the Action, but is NOT
    // a Turnover.
    if (
      this.state.activePlayer?.id === playerId &&
      this.state.activePlayer?.action === "block" &&
      hasSkill(player.skills ?? [], SkillType.JUMP_UP)
    ) {
      const check = this.diceController.rollSkillCheck(
        "Jump Up (stand to Block)",
        player.stats.AG,
        1,
        player.playerName,
        player.teamId
      );
      this.eventBus.emit(GameEventNames.SkillTriggered, {
        playerId,
        skill: SkillType.JUMP_UP,
        effect: check.success
          ? "Jump Up: stood up to make a Block"
          : "Jump Up: failed the stand-up test — Action wasted",
      });
      if (!check.success) {
        // Action wasted. No movement is spent and possession does not change.
        this.callbacks.onActivationFinished(playerId);
        return;
      }
      player.status = PlayerStatus.ACTIVE;
      this.eventBus.emit(GameEventNames.PlayerStoodUp, { playerId, cost: 0 });
      this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
      return;
    }

    const used = this.getMovementUsed(playerId);
    const cost = standUpCost(maView);

    if (used + cost > moveAllowance(maView)) {
      return Promise.reject("Not enough movement to stand up");
    }

    if (!(await rollToStand(this.deps, maView))) {
      // Failed the stand-up roll: still Prone, movement spent, activation over
      this.state.turn.movementUsed.set(playerId, used + cost);
      this.callbacks.onActivationFinished(playerId);
      return;
    }

    player.status = PlayerStatus.ACTIVE;
    this.state.turn.movementUsed.set(playerId, used + cost);

    this.eventBus.emit(GameEventNames.PlayerStoodUp, {
      playerId,
      cost,
    });
    this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);

    if (used + cost >= moveAllowance(maView)) {
      this.callbacks.onActivationFinished(playerId);
    }

    return Promise.resolve();
  }

  public async movePlayer(
    playerId: string,
    path: { x: number; y: number }[],
    context?: FlowContext
  ): Promise<void> {
    return movePlayer(this.deps, playerId, path, context);
  }

  public async jumpPlayer(
    playerId: string,
    target: { x: number; y: number },
    context?: FlowContext
  ): Promise<void> {
    return jumpPlayer(this.deps, playerId, target, context);
  }
}
