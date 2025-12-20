import { IEventBus } from "../../services/EventBus";
import { GameState, GamePhase, SubPhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { SetupZone } from "@/types/SetupTypes";

import { WeatherManager } from "./WeatherManager";

export class SetupManager {
  private placedPlayers: Map<string, { x: number; y: number }> = new Map();
  private setupReady: Set<string> = new Set();

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    private weatherService: WeatherManager,
    private callbacks: {
      onKickoffRequested: () => void;
    }
  ) {
    // Sync placedPlayers from initial team state (for Scenario loading)
    this.syncPlacedPlayers(team1);
    this.syncPlacedPlayers(team2);
  }

  private syncPlacedPlayers(team: Team): void {
    team.players.forEach((p) => {
      if (p.gridPosition) {
        this.placedPlayers.set(p.id, {
          x: p.gridPosition.x,
          y: p.gridPosition.y,
        });
      }
    });
  }

  /**
   * Static utility: Sanitize team state - clear positions and reset status
   * Used when starting a fresh game to prevent state leaks
   */
  public static sanitizeTeam(team: Team): void {
    team.players.forEach((player) => {
      player.gridPosition = undefined;
      player.status = PlayerStatus.RESERVE;
      player.hasActed = false;
    });
  }

  public startSetup(startingTeamId?: string): void {
    this.state.phase = GamePhase.SETUP;

    // If startingTeamId provided, jump to kicking setup
    if (startingTeamId) {
      this.state.subPhase = SubPhase.SETUP_KICKING;
      this.state.activeTeamId = startingTeamId;
      this.eventBus.emit(GameEventNames.PhaseChanged, {
        phase: GamePhase.SETUP,
        subPhase: this.state.subPhase,
      });
    } else {
      // Otherwise start at beginning sequence (Weather)
      this.state.subPhase = SubPhase.WEATHER;
      this.eventBus.emit(GameEventNames.PhaseChanged, {
        phase: GamePhase.SETUP,
        subPhase: SubPhase.WEATHER,
      });

      // Perform Weather Roll (Delegated to TurnManager/GameService? Or handled here?)
      // We'll trigger it via event or return signal?
      // For now, let's assume GameService handles the Weather Roll orchestration or we expose a helper.
      // Actually, Weather is Setup.
      // Weather Service handles the roll
      this.weatherService.rollWeather();

      // Proceed to Coin Flip after a short delay
      setTimeout(() => {
        this.state.subPhase = SubPhase.COIN_FLIP;
        this.eventBus.emit(GameEventNames.PhaseChanged, {
          phase: GamePhase.SETUP,
          subPhase: SubPhase.COIN_FLIP,
        });
      }, 2000);
    }
  }

  // Weather moved to Service

  public placePlayer(playerId: string, x: number, y: number): boolean {
    if (this.state.phase !== GamePhase.SETUP) return false;

    // Validate position
    if (!this.isValidSetupPosition(playerId, x, y)) return false;

    // Check if occupied by another player
    if (this.isSquareOccupiedByOther(x, y, playerId)) return false;

    // Check limit (7 players)
    const player = this.getPlayerById(playerId);
    if (!player) return false;

    const teamId = player.teamId;
    const teamPlacedCount = this.getPlacedCount(teamId);

    // If moving existing player, don't count against limit
    const isNewPlacement = !this.placedPlayers.has(playerId);
    if (isNewPlacement && teamPlacedCount >= 7) return false;

    this.placedPlayers.set(playerId, { x, y });
    player.gridPosition = { x, y };

    this.eventBus.emit(GameEventNames.PlayerPlaced, { playerId, x, y });
    return true;
  }

  public removePlayer(playerId: string): void {
    if (this.placedPlayers.has(playerId)) {
      this.placedPlayers.delete(playerId);
      const player = this.getPlayerById(playerId);
      if (player) player.gridPosition = undefined;

      this.eventBus.emit(GameEventNames.PlayerRemoved, playerId);
    }
  }

  public swapPlayers(player1Id: string, player2Id: string): boolean {
    if (this.state.phase !== GamePhase.SETUP) return false;

    const pos1 = this.placedPlayers.get(player1Id);
    const pos2 = this.placedPlayers.get(player2Id);

    if (!pos1 && !pos2) return false;

    // Update positions logic
    if (pos1 && pos2) {
      this.placedPlayers.set(player1Id, pos2);
      this.placedPlayers.set(player2Id, pos1);
    } else if (pos1 && !pos2) {
      this.placedPlayers.set(player2Id, pos1);
      this.placedPlayers.delete(player1Id);
    } else if (!pos1 && pos2) {
      this.placedPlayers.set(player1Id, pos2);
      this.placedPlayers.delete(player2Id);
    }

    // Sync player objects
    const p1 = this.getPlayerById(player1Id);
    const p2 = this.getPlayerById(player2Id);

    if (p1) p1.gridPosition = this.placedPlayers.get(player1Id);
    if (p2) p2.gridPosition = this.placedPlayers.get(player2Id);

    this.eventBus.emit(GameEventNames.PlayersSwapped, { player1Id, player2Id });
    return true;
  }

  public confirmSetup(teamId: string): void {
    this.setupReady.add(teamId);

    if (this.state.subPhase === SubPhase.SETUP_KICKING) {
      if (teamId === this.state.activeTeamId) {
        // Kicking team done. Switch to Receiving.
        const receivingTeamId =
          teamId === this.team1.id ? this.team2.id : this.team1.id;
        this.state.subPhase = SubPhase.SETUP_RECEIVING;
        this.state.activeTeamId = receivingTeamId;

        this.eventBus.emit(GameEventNames.PhaseChanged, {
          phase: GamePhase.SETUP,
          subPhase: SubPhase.SETUP_RECEIVING,
          activeTeamId: receivingTeamId,
        });
      }
    } else if (this.state.subPhase === SubPhase.SETUP_RECEIVING) {
      if (teamId === this.state.activeTeamId) {
        // Receiving team done. Proceed to Kickoff.
        this.callbacks.onKickoffRequested();
      }
    } else {
      // Fallback
      if (
        this.setupReady.has(this.team1.id) &&
        this.setupReady.has(this.team2.id)
      ) {
        this.callbacks.onKickoffRequested();
      } else {
        this.eventBus.emit(GameEventNames.SetupConfirmed, teamId);
      }
    }
  }

  public isSetupComplete(teamId: string): boolean {
    const placed = this.getPlacedCount(teamId);
    const team = teamId === this.team1.id ? this.team1 : this.team2;

    const eligiblePlayers = team.players.filter(
      (p) => p.status !== "KO" && p.status !== "Injured" && p.status !== "Dead"
    );
    const available = Math.min(7, eligiblePlayers.length);

    return placed === available;
  }

  public getSetupZone(teamId: string): SetupZone | undefined {
    if (teamId === this.team1.id) {
      return { minX: 0, maxX: 6, minY: 0, maxY: 10 };
    } else if (teamId === this.team2.id) {
      return { minX: 13, maxX: 19, minY: 0, maxY: 10 };
    }
    return undefined;
  }

  // Helpers
  private getPlacedCount(teamId: string): number {
    let count = 0;
    this.placedPlayers.forEach((_pos, pid) => {
      const p = this.getPlayerById(pid);
      if (p && p.teamId === teamId) count++;
    });
    return count;
  }

  private isValidSetupPosition(
    playerId: string,
    x: number,
    y: number
  ): boolean {
    if (x < 0 || x >= 20 || y < 0 || y >= 11) return false;
    const player = this.getPlayerById(playerId);
    if (!player) return false;

    // Team 1: Left side (x: 0-5), Team 2: Right side (x: 14-19)
    if (player.teamId === this.team1.id) {
      return x >= 0 && x <= 5;
    } else {
      return x >= 14 && x < 20;
    }
  }

  private isSquareOccupiedByOther(
    x: number,
    y: number,
    playerId: string
  ): boolean {
    for (const [pid, pos] of this.placedPlayers.entries()) {
      if (pid !== playerId && pos.x === x && pos.y === y) {
        return true;
      }
    }
    return false;
  }

  private getPlayerById(playerId: string): Player | undefined {
    return (
      this.team1.players.find((p) => p.id === playerId) ||
      this.team2.players.find((p) => p.id === playerId)
    );
  }

  // For Sandbox/Scenario loading, we might need a reset or direct set
  public reset(): void {
    this.placedPlayers.clear();
    this.setupReady.clear();
  }

  public setPlacedPlayer(playerId: string, x: number, y: number): void {
    this.placedPlayers.set(playerId, { x, y });
  }
}
