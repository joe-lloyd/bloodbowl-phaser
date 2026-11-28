import { type IEventBus } from "../../services/EventBus";
import { type GameState } from "@/types/GameState";
import {
  opponentsOf,
  playerById,
  type Seating,
  teammatesOf,
} from "../seating";
import {
  type Player,
  PlayerStatus,
  PlayerCondition,
  hasCondition,
} from "@/types/Player";
import { MovementValidator } from "../validators/MovementValidator";
import { GameEventNames } from "../../types/events";
import { DodgeController } from "../controllers/DodgeController";
import { DiceController } from "../controllers/DiceController";
import { type FlowContext } from "../core/GameFlowManager";
import { moveAllowance, standUpCost } from "../skills/movement";
import {
  effectiveMA as driveEffectiveMA,
  withDriveModifiers,
} from "../kickoff/driveEffects";
import { SkillType, hasSkill } from "../../types/Skills";
import {
  type MovementDeps,
  finishIfSpent,
  movementUsed,
  rise,
  standToMove,
} from "./movementShared";
import { movePlayer } from "./moveAction";
import { jumpPlayer } from "./jumpAction";
import { reachWithJumps, type MoveReach } from "../validators/jumpReach";
import type { MoveStep } from "../../headless/protocol";

export class MovementManager {
  private movementValidator: MovementValidator = new MovementValidator();
  private readonly deps: MovementDeps;

  private eventBus: IEventBus;
  private state: GameState;
  private diceController: DiceController;
  private callbacks: MovementDeps["callbacks"];
  constructor(
    eventBus: IEventBus,
    state: GameState,
    seating: Seating,
    diceController: DiceController,
    callbacks: MovementDeps["callbacks"]
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.diceController = diceController;
    this.callbacks = callbacks;
    this.deps = {
      eventBus,
      state,
      seating,
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
    playerId: string,
    reach: MoveReach = "walk"
  ): { x: number; y: number; cost?: number }[] {
    const player = playerById(this.deps.seating, playerId);
    const position = player?.gridPosition;
    if (!position || player.teamId !== this.state.activeTeamId) return [];

    if (
      hasCondition(player, PlayerCondition.ROOTED) ||
      hasCondition(player, PlayerCondition.CHOMPED)
    ) {
      return [];
    }

    const used = this.getMovementUsed(playerId);
    if (used >= moveAllowance(withDriveModifiers(player, this.state)))
      return [];

    const opponents = opponentsOf(this.deps.seating, player.teamId).filter(
      (p) => p.gridPosition
    );
    const teammates = teammatesOf(this.deps.seating, player.id);
    const proxyPlayer = this.withMovementLeft(player, used);
    return reach === "walk"
      ? this.movementValidator.findReachableSquares(
          proxyPlayer,
          opponents,
          teammates
        )
      : reachWithJumps({
          player: proxyPlayer,
          start: position,
          others: [...opponents, ...teammates],
        });
  }

  private withMovementLeft(player: Player, used: number): Player {
    const left = driveEffectiveMA(player, this.state) - used;
    const MA =
      player.status === PlayerStatus.PRONE
        ? Math.max(0, left - standUpCost(player))
        : left;
    return { ...player, stats: { ...player.stats, MA } };
  }

  private jumpUpToBlock(player: Player, maView: Player): boolean {
    const declared = this.state.activePlayer;
    if (
      declared?.id !== player.id ||
      declared.action !== "block" ||
      !hasSkill(maView.skills ?? [], SkillType.JUMP_UP)
    )
      return false;
    const check = this.diceController.rollSkillCheck({
      reason: "Jump Up (stand to Block)",
      target: player.stats.AG,
      modifier: 1,
      playerName: player.playerName,
      teamId: player.teamId,
    });
    this.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: player.id,
      skill: SkillType.JUMP_UP,
      effect: check.success
        ? "Jump Up: stood up to make a Block"
        : "Jump Up: failed the stand-up test — Action wasted",
    });
    if (check.success) rise(this.deps, player, 0);
    else this.callbacks.onActivationFinished(player.id);
    return true;
  }

  public async standUp(playerId: string): Promise<void> {
    const player = playerById(this.deps.seating, playerId);
    if (player?.status !== PlayerStatus.PRONE) {
      throw new Error("Player is not prone");
    }

    const maView = withDriveModifiers(player, this.state);
    if (this.jumpUpToBlock(player, maView)) return;

    const allowance = moveAllowance(maView);
    if (this.getMovementUsed(playerId) + standUpCost(maView) > allowance) {
      throw new Error("Not enough movement to stand up");
    }

    if (!(await standToMove(this.deps, player, maView))) return;

    finishIfSpent(this.deps, player);
  }

  public movePlayer(
    playerId: string,
    path: MoveStep[],
    context?: FlowContext
  ): Promise<void> {
    return movePlayer(this.deps, playerId, path, context);
  }

  public jumpPlayer(
    playerId: string,
    target: { x: number; y: number },
    context?: FlowContext
  ): Promise<void> {
    return jumpPlayer(this.deps, playerId, target, context);
  }
}
