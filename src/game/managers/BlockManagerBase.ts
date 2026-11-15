import { ballOnSquare } from "@/game/rules/ballInTheAir";
import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { BlockResolutionService } from "../../services/BlockResolutionService";
import { GameEventNames } from "../../types/events";
import { BounceOperation } from "../operations/BounceOperation";
import { GameConfig } from "../../config/GameConfig";
import { DiceController } from "../controllers/DiceController";
import { GameOperation } from "../core/GameOperation";
import { gatherParticipants, adjacentStanding } from "../skills";

/**
 * BlockManager is one class split across files by stage of the Block
 * Action, each extending the one before: BlockManagerBase, BlockRerolls,
 * BlockActivation, BlockPushChain, then BlockManager. This first one holds
 * what every stage reads: the game it plays on and the board queries.
 */
export abstract class BlockManagerBase {
  constructor(
    protected eventBus: IEventBus,
    protected state: GameState,
    protected team1: Team,
    protected team2: Team,
    protected blockResolutionService: BlockResolutionService,
    protected diceController: DiceController,
    protected callbacks: {
      onTurnover: (reason: string) => void;
      getFlowManager?: () => import("../core/GameFlowManager").GameFlowManager;
    }
  ) {}

  /** Is this block the block at the end of the active player's Blitz? */
  protected isBlitzBlock(attacker: Player): boolean {
    return (
      this.state.activePlayer?.action === "blitz" &&
      this.state.activePlayer?.id === attacker.id
    );
  }

  /** Is this attacker the Fanatic mid-lurch (Ball & Chain)? */
  protected isBallAndChain(attacker: Player): boolean {
    return (
      this.state.activePlayer?.action === "ballAndChain" &&
      this.state.activePlayer?.id === attacker.id
    );
  }

  protected getPlayerAt(x: number, y: number): Player | undefined {
    return [...this.team1.players, ...this.team2.players].find(
      (p) => p.gridPosition && p.gridPosition.x === x && p.gridPosition.y === y
    );
  }

  protected isOnBall(player: Player): boolean {
    return !!player.gridPosition && this.ballAt(player.gridPosition);
  }

  protected ballAt(square: { x: number; y: number }): boolean {
    return ballOnSquare(this.state, square);
  }

  /**
   * A knocked-down carrier drops the ball. Safe Pair of Hands (2025 p.126)
   * places it in an adjacent unoccupied square instead of Bouncing; otherwise
   * the ball Bounces from the carrier's square as normal: the returned
   * operation, for the caller to queue after the Armour Roll.
   */
  protected dropCarrierBall(
    player: Player,
    flowManager: import("../core/GameFlowManager").GameFlowManager
  ): GameOperation | null {
    const pos = player.gridPosition!;
    if (hasSkill(player.skills, SkillType.SAFE_PAIR_OF_HANDS)) {
      const spot = this.adjacentEmptySquare(pos);
      if (spot) {
        flowManager.context.gameService.setBallPosition(spot.x, spot.y);
        this.eventBus.emit(GameEventNames.BallPlaced, spot);
        this.eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: SkillType.SAFE_PAIR_OF_HANDS,
          effect: "Safe Pair of Hands: places the ball in an adjacent square",
        });
        return null;
      }
    }
    return new BounceOperation(pos);
  }

  /** First unoccupied on-pitch square adjacent to `pos` (fixed clockwise order). */
  private adjacentEmptySquare(pos: {
    x: number;
    y: number;
  }): { x: number; y: number } | null {
    const occupied = new Set(
      this.allPlayers()
        .filter((p) => p.gridPosition)
        .map((p) => `${p.gridPosition!.x},${p.gridPosition!.y}`)
    );
    const dirs = [
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
    ];
    for (const [dx, dy] of dirs) {
      const s = { x: pos.x + dx, y: pos.y + dy };
      if (
        s.x < 0 ||
        s.y < 0 ||
        s.x >= GameConfig.PITCH_WIDTH ||
        s.y >= GameConfig.PITCH_HEIGHT
      ) {
        continue;
      }
      if (!occupied.has(`${s.x},${s.y}`)) return s;
    }
    return null;
  }

  /**
   * Knock down a player
   */
  protected knockDownPlayer(player: Player): void {
    player.status = PlayerStatus.PRONE;
    this.eventBus.emit(GameEventNames.PlayerKnockedDown, {
      playerId: player.id,
    });
  }

  /**
   * Knock the Block's target down. A target on the active team, which only
   * a Ball & Chain collision can block, is a Turnover: "A player on the
   * active team is Knocked Down during their own team's turn" (p.43).
   */
  protected knockDownTarget(defender: Player): void {
    this.knockDownPlayer(defender);
    if (defender.teamId === this.state.activeTeamId) {
      this.callbacks.onTurnover("Team-mate Knocked Down");
    }
  }

  protected getPlayerById(playerId: string): Player | undefined {
    return (
      this.team1.players.find((p) => p.id === playerId) ||
      this.team2.players.find((p) => p.id === playerId)
    );
  }

  protected allPlayers(): Player[] {
    return [...this.team1.players, ...this.team2.players];
  }

  protected decisions() {
    return this.callbacks
      .getFlowManager?.()
      ?.context.gameService.getDecisionService();
  }

  /** Attacker → defender → players adjacent to either, by position. */
  protected blockParticipants(attacker: Player, defender: Player): Player[] {
    const all = this.allPlayers();
    const adjacents = [
      ...(attacker.gridPosition
        ? adjacentStanding(attacker.gridPosition, all)
        : []),
      ...(defender.gridPosition
        ? adjacentStanding(defender.gridPosition, all)
        : []),
    ];
    return gatherParticipants(attacker, defender, adjacents);
  }

  protected announce(
    triggers: { playerId: string; skill: string; effect: string }[]
  ): void {
    triggers.forEach((t) =>
      this.eventBus.emit(GameEventNames.SkillTriggered, t)
    );
  }
}
