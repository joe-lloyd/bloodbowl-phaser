import { ballOnSquare } from "@/game/rules/ballInTheAir";
import { type IEventBus } from "../../services/EventBus";
import { type GameState } from "@/types/GameState";
import { type Team } from "@/types/Team";
import { type Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { BlockResolutionService } from "../../services/BlockResolutionService";
import { GameEventNames } from "../../types/events";
import { BounceOperation } from "../operations/BounceOperation";
import { GameConfig } from "../../config/GameConfig";
import { DiceController } from "../controllers/DiceController";
import { GameOperation } from "../core/GameOperation";
import { gatherParticipants, adjacentStanding } from "../skills";

export abstract class BlockManagerBase {
  protected eventBus: IEventBus;
  protected state: GameState;
  protected team1: Team;
  protected team2: Team;
  protected blockResolutionService: BlockResolutionService;
  protected diceController: DiceController;
  protected callbacks: {
    onTurnover: (reason: string) => void;
    getFlowManager?: () => import("../core/GameFlowManager").GameFlowManager;
  };
  constructor(
    eventBus: IEventBus,
    state: GameState,
    team1: Team,
    team2: Team,
    blockResolutionService: BlockResolutionService,
    diceController: DiceController,
    callbacks: {
      onTurnover: (reason: string) => void;
      getFlowManager?: () => import("../core/GameFlowManager").GameFlowManager;
    }
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.team1 = team1;
    this.team2 = team2;
    this.blockResolutionService = blockResolutionService;
    this.diceController = diceController;
    this.callbacks = callbacks;
  }

  protected isBlitzBlock(attacker: Player): boolean {
    return (
      this.state.activePlayer?.action === "blitz" &&
      this.state.activePlayer?.id === attacker.id
    );
  }

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

  private adjacentEmptySquare(pos: {
    x: number;
    y: number;
  }): { x: number; y: number } | null {
    const occupied = new Set(
      this.allPlayers()
        .filter((p) => p.gridPosition)
        .map((p) => `${String(p.gridPosition!.x)},${String(p.gridPosition!.y)}`)
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
      if (!occupied.has(`${String(s.x)},${String(s.y)}`)) return s;
    }
    return null;
  }

  protected knockDownPlayer(player: Player): void {
    player.status = PlayerStatus.PRONE;
    this.eventBus.emit(GameEventNames.PlayerKnockedDown, {
      playerId: player.id,
    });
  }

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
    triggers.forEach((t) => {
      this.eventBus.emit(GameEventNames.SkillTriggered, t);
    });
  }
}
