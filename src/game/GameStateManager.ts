import Phaser from "phaser";
import { GamePhase, GameState } from "../types/GameState";
import { Team } from "../types/Team";

/**
 * GameStateManager - Central state management for the game
 * @deprecated Use GameService and ServiceContainer instead. This class will be removed in future phases.
 */
export class GameStateManager extends Phaser.Events.EventEmitter {
  private state: GameState;
  private team1: Team;
  private team2: Team;
  private maxTurns: number = 6; // Sevens default
  private turnCounts: { [key: string]: number } = {};
  private placedPlayers: Map<string, { x: number; y: number }> = new Map();
  private setupReady: Set<string> = new Set();

  constructor(team1: Team, team2: Team) {
    super();
    this.team1 = team1;
    this.team2 = team2;

    this.turnCounts = {
      [team1.id]: 0,
      [team2.id]: 0,
    };

    this.state = {
      phase: GamePhase.SETUP,
      activeTeamId: null,
      turn: {
        teamId: "",
        turnNumber: 0,
        isHalf2: false,
        activatedPlayerIds: new Set(),
        hasBlitzed: false,
        hasPassed: false,
        hasHandedOff: false,
        hasFouled: false,
      },
      score: {
        [team1.id]: 0,
        [team2.id]: 0,
      },
    };
  }

  // --- Setup Phase ---

  public placePlayer(playerId: string, x: number, y: number): boolean {
    if (this.state.phase !== GamePhase.SETUP) return false;

    // Validate position
    if (!this.isValidSetupPosition(playerId, x, y)) return false;

    // Check if occupied
    if (this.isSquareOccupied(x, y)) return false;

    // Check limit (7 players)
    const player = this.getPlayerById(playerId);
    if (!player) return false;

    const teamId = player.teamId;
    const teamPlacedCount = this.getPlacedCount(teamId);

    // If moving existing player, don't count against limit
    const isNewPlacement = !this.placedPlayers.has(playerId);
    if (isNewPlacement && teamPlacedCount >= 7) return false;

    this.placedPlayers.set(playerId, { x, y });
    player.gridPosition = { x, y }; // Sync with player object

    this.emit("playerPlaced", { playerId, x, y });
    this.emit("stateChanged", this.state);
    return true;
  }

  public swapPlayers(player1Id: string, player2Id: string): boolean {
    if (this.state.phase !== GamePhase.SETUP) return false;

    const pos1 = this.placedPlayers.get(player1Id);
    const pos2 = this.placedPlayers.get(player2Id);

    // If neither is placed, nothing to swap (or swap in dugout? No, only pitch for now)
    if (!pos1 && !pos2) return false;

    // Update positions
    if (pos1) {
      if (pos2) {
        // Both placed: Swap coordinates
        this.placedPlayers.set(player1Id, pos2);
        this.placedPlayers.set(player2Id, pos1);
      } else {
        // P1 placed, P2 in dugout: Move P2 to P1's spot, remove P1
        this.placedPlayers.set(player2Id, pos1);
        this.placedPlayers.delete(player1Id);
      }
    } else if (pos2) {
      // P2 placed, P1 in dugout: Move P1 to P2's spot, remove P2
      this.placedPlayers.set(player1Id, pos2);
      this.placedPlayers.delete(player2Id);
    }

    // Sync player objects
    const p1 = this.getPlayerById(player1Id);
    const p2 = this.getPlayerById(player2Id);

    if (p1) p1.gridPosition = this.placedPlayers.get(player1Id);
    if (p2) p2.gridPosition = this.placedPlayers.get(player2Id);

    this.emit("playersSwapped", { player1Id, player2Id });
    this.emit("stateChanged", this.state);
    return true;
  }

  public removePlayer(playerId: string): void {
    if (this.placedPlayers.has(playerId)) {
      this.placedPlayers.delete(playerId);
      const player = this.getPlayerById(playerId);
      if (player) player.gridPosition = undefined;

      this.emit("playerRemoved", playerId);
      this.emit("stateChanged", this.state);
    }
  }

  public confirmSetup(teamId: string): void {
    this.setupReady.add(teamId);

    // Strict sequence: Receiving Team -> Kicking Team -> Kickoff
    // We need to know who is who.
    // Let's assume the UI handles the order, but we can enforce it here if we track "currentSetupTeam"
    // For now, simple check:

    if (
      this.setupReady.has(this.team1.id) &&
      this.setupReady.has(this.team2.id)
    ) {
      // Both ready, proceed to Kickoff
      this.startKickoff();
    } else {
      // Wait for other team
      this.emit("setupConfirmed", teamId);
    }
  }

  public isSetupComplete(teamId: string): boolean {
    const placed = this.getPlacedCount(teamId);
    const team = teamId === this.team1.id ? this.team1 : this.team2;

    // Count only eligible players (not KO, Injured, or Dead)
    const eligiblePlayers = team.players.filter(
      (p) => p.status !== "KO" && p.status !== "Injured" && p.status !== "Dead"
    );
    const available = Math.min(7, eligiblePlayers.length);

    return placed === available;
  }

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

    // Team 1: Left side (x: 0-5), Team 2: Right side (x: 14-19) - Horizontal orientation
    if (player.teamId === this.team1.id) {
      return x >= 0 && x <= 5;
    } else {
      return x >= 14 && x < 20;
    }
  }

  private isSquareOccupied(x: number, y: number): boolean {
    for (const pos of this.placedPlayers.values()) {
      if (pos.x === x && pos.y === y) return true;
    }
    return false;
  }

  private getPlayerById(playerId: string): any {
    // Need to import Player type properly or use any for now
    return (
      this.team1.players.find((p) => p.id === playerId) ||
      this.team2.players.find((p) => p.id === playerId)
    );
  }

  // --- Kickoff Phase ---

  private startKickoff(): void {
    this.state.phase = GamePhase.KICKOFF;
    this.emit("kickoffStarted");
    this.emit("stateChanged", this.state);

    // Auto-roll for now
    setTimeout(() => this.rollKickoff(), 1000);
  }

  public rollKickoff(): void {
    // Simple D6 or 2D6 roll
    const roll = Math.floor(Math.random() * 6) + 1; // Placeholder
    let event = "Nice Weather";

    // Simple table
    if (roll === 1) event = "Get the Ref!";
    if (roll === 6) event = "Pitch Invasion!";

    this.emit("kickoffResult", { roll, event });

    // Proceed to game after delay
    setTimeout(() => this.startGameAfterKickoff(), 2000);
  }

  private startGameAfterKickoff(): void {
    // Determine who kicks?
    // SetupScene determines kicking team. We need to know that.
    // Let's assume startGame passes the kicking team ID, or we store it.
    // For now, let's just start turn 1.

    // We need to know who is receiving.
    // SetupScene handles the coin toss. We should probably move coin toss here too eventually.
    // For now, let's rely on an explicit call or store it.

    // Let's emit readyToStart and let the scene call startGame
    this.emit("readyToStart");
  }

  public startGame(kickingTeamId: string): void {
    this.state.phase = GamePhase.KICKOFF;
    // In Blood Bowl, the receiving team sets up first, then kicking team.
    // But here we are already past setup.
    // The kicking team kicks, so it's technically their "action" but the receiving team gets the first turn.
    // Let's simplify: Start Turn 1 for Receiving Team.

    const receivingTeamId =
      kickingTeamId === this.team1.id ? this.team2.id : this.team1.id;
    this.startTurn(receivingTeamId);
    this.emit("stateChanged", this.state);
  }

  public startTurn(teamId: string): void {
    this.state.phase = GamePhase.PLAY;
    this.state.activeTeamId = teamId;

    // Increment turn count for this team
    this.turnCounts[teamId] = (this.turnCounts[teamId] || 0) + 1;
    const currentTurn = this.turnCounts[teamId];

    this.state.turn = {
      teamId: teamId,
      turnNumber: currentTurn,
      isHalf2: this.state.turn.isHalf2,
      activatedPlayerIds: new Set(),
      hasBlitzed: false,
      hasPassed: false,
      hasHandedOff: false,
      hasFouled: false,
    };
    this.emit("turnStarted", this.state.turn);
    this.emit("stateChanged", this.state);
  }

  public endTurn(): void {
    const currentTeamId = this.state.activeTeamId;
    if (!currentTeamId) return;

    const nextTeamId =
      currentTeamId === this.team1.id ? this.team2.id : this.team1.id;

    // If we just finished Team 2's turn, increment turn number

    if (currentTeamId === this.team2.id) {
      // Assuming Team 1 always goes first is wrong. We need to track who went first.
      // Simplified: If active team was the one who went second in the round, increment.
      // Actually, Blood Bowl turns are individual.
      // T1 Turn 1 -> T2 Turn 1 -> T1 Turn 2...
      // So we just switch team. If switching back to "first" team, increment turn?
      // No, each team has their own Turn 1.
      // We need to track turn number PER TEAM.
    }

    // Better logic:
    // We start a new turn for the OTHER team.
    // We need to know what turn number THAT team is on.
    // Let's store turn counts in the state or just calculate it.
    // For now, let's just increment if we are switching.
    // Wait, if T1 is on Turn 1, and ends, T2 starts Turn 1.
    // If T2 ends Turn 1, T1 starts Turn 2.

    // We need to track turn counts for both teams.
    // Let's simplify and say we pass the turn number in startTurn,
    // but the manager should probably track it.

    // Let's add a turn tracker to the class
    // this.turnCounts = { [team1]: 0, [team2]: 0 }

    // For this iteration, let's just assume we toggle and increment if it was the second team.
    // But "second team" changes each half.
    // Let's just track it properly.

    // Hack for now: Just toggle team. We need to store turn counts.
    // I'll add turnCounts property.

    // Check if next team has turns left
    const nextTeamTurnCount = this.turnCounts[nextTeamId] || 0;

    if (nextTeamTurnCount >= this.maxTurns) {
      // If both teams finished max turns, end half
      const currentTeamTurnCount = this.turnCounts[currentTeamId];
      if (currentTeamTurnCount >= this.maxTurns) {
        this.endHalf();
        return;
      }
    }

    this.startTurn(nextTeamId);
  }

  // Override startTurn to update counts
  // Actually, let's just update the internal tracker when we start a turn

  public playerAction(playerId: string): boolean {
    if (this.state.phase !== GamePhase.PLAY) return false;
    if (this.state.turn.activatedPlayerIds.has(playerId)) return false;

    this.state.turn.activatedPlayerIds.add(playerId);
    this.emit("playerActivated", playerId);
    this.emit("stateChanged", this.state);
    return true;
  }

  public getState(): GameState {
    return this.state;
  }

  private endHalf(): void {
    this.state.phase = GamePhase.HALFTIME;
    this.emit("stateChanged", this.state);
  }
}
