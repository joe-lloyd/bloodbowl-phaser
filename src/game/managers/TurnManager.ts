import { IEventBus } from "../../services/EventBus";
import { GameState, GamePhase, SubPhase, TurnData } from "@/types/GameState";
import { Team } from "@/types/Team";
import { PlayerStatus } from "@/types/Player";
import { ActivationValidator } from "../validators/ActivationValidator";
import { GameEventNames } from "../../types/events";

export class TurnManager {
  private maxTurns: number = 6; // Sevens default
  private turnCounts: { [key: string]: number } = {};
  private driveKickingTeamId: string | null = null;
  private firstHalfKickingTeamId: string | null = null;
  private turnoverInProgress: boolean = false;
  private activationValidator: ActivationValidator = new ActivationValidator();

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    private callbacks: {
      onPhaseChanged: (phase: GamePhase, subPhase?: SubPhase) => void;
      /** Fired at halftime with the team kicking off the second half */
      onHalfEnded?: (secondHalfKickingTeamId: string) => void;
      /** Fired as a turn ends, before the next begins (Pick-Me-Up). */
      onTurnEnding?: (endingTeamId: string) => void;
    },
    private delay: import("../core/GameFlowManager").DelayProvider = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {
    this.turnCounts[team1.id] = 0;
    this.turnCounts[team2.id] = 0;
  }

  public startGame(kickingTeamId: string): void {
    this.state.phase = GamePhase.PLAY;
    this.driveKickingTeamId = kickingTeamId;
    if (!this.firstHalfKickingTeamId) {
      this.firstHalfKickingTeamId = kickingTeamId;
    }

    // Determine who goes first (Receiving team)
    const receivingTeamId =
      kickingTeamId === this.team1.id ? this.team2.id : this.team1.id;

    this.state.subPhase = SubPhase.TURN_RECEIVING;
    this.state.activeTeamId = receivingTeamId;

    // Ensure all players on pitch are ACTIVE
    const activatePlayers = (team: Team) => {
      team.players.forEach((p) => {
        if (p.gridPosition) {
          p.status = PlayerStatus.ACTIVE;
        } else if (!p.status) {
          p.status = PlayerStatus.RESERVE;
        }
      });
    };

    activatePlayers(this.team1);
    activatePlayers(this.team2);

    this.startTurn(receivingTeamId);
    this.callbacks.onPhaseChanged(GamePhase.PLAY, this.state.subPhase);
  }

  public startTurn(teamId: string): void {
    this.state.phase = GamePhase.PLAY;
    this.state.activeTeamId = teamId;
    // A fresh turn always clears any stale turnover latch
    this.turnoverInProgress = false;

    if (this.driveKickingTeamId) {
      this.state.subPhase =
        teamId === this.driveKickingTeamId
          ? SubPhase.TURN_KICKING
          : SubPhase.TURN_RECEIVING;
    }

    // Emit phase changed for sub-phase update
    this.callbacks.onPhaseChanged(GamePhase.PLAY, this.state.subPhase);

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
      movementUsed: new Map(),
    };

    // Stunned players recover at the start of their team's turn: they roll
    // face-up (Prone) but have missed their action — counted as already
    // activated for this turn (rulebook p.32).
    const activeTeam = teamId === this.team1.id ? this.team1 : this.team2;
    const recovered = activeTeam.players.filter(
      (p) => p.status === PlayerStatus.STUNNED && p.gridPosition
    );
    recovered.forEach((player) => {
      player.status = PlayerStatus.PRONE;
      this.state.turn.activatedPlayerIds.add(player.id);
    });

    this.eventBus.emit(GameEventNames.TurnStarted, this.state.turn as TurnData);

    // Emitted AFTER TurnStarted: its listeners reset all activation visuals,
    // which would wipe the recovered players' "already activated" marker
    recovered.forEach((player) => {
      this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
      this.eventBus.emit(GameEventNames.PlayerActivated, player.id);
    });
  }

  public endTurn(): void {
    const currentTeamId = this.state.activeTeamId;
    if (!currentTeamId) return;

    // Fires before the next turn starts, so its effects (Pick-Me-Up
    // stand-ups) are in place when that turn begins
    this.callbacks.onTurnEnding?.(currentTeamId);

    const nextTeamId =
      currentTeamId === this.team1.id ? this.team2.id : this.team1.id;

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

  public endHalf(): void {
    if (!this.state.turn.isHalf2) {
      // Halftime: swap kickoff (first-half receiver kicks), reset turn
      // counts, and run a fresh setup for the second half.
      this.state.turn.isHalf2 = true;
      this.turnCounts[this.team1.id] = 0;
      this.turnCounts[this.team2.id] = 0;

      this.state.phase = GamePhase.HALFTIME;
      this.callbacks.onPhaseChanged(GamePhase.HALFTIME);

      const secondHalfKicker =
        this.firstHalfKickingTeamId === this.team1.id
          ? this.team2.id
          : this.team1.id;
      this.callbacks.onHalfEnded?.(secondHalfKicker);
    } else {
      this.state.phase = GamePhase.GAME_OVER;
      this.state.activeTeamId = null;
      this.callbacks.onPhaseChanged(GamePhase.GAME_OVER);
    }
  }

  public finishActivation(playerId: string): void {
    if (this.state.phase !== GamePhase.PLAY) return;

    // Mark as used
    if (!this.state.turn.activatedPlayerIds.has(playerId)) {
      this.state.turn.activatedPlayerIds.add(playerId);
      this.eventBus.emit(GameEventNames.PlayerActivated, playerId); // UI updates visuals
    }

    // Check if any actions remain
    const activeTeam =
      this.state.activeTeamId === this.team1.id ? this.team1 : this.team2;
    const hasActions = this.activationValidator.hasAvailablePlayers(
      activeTeam,
      this.state.turn
    );

    if (!hasActions) {
      this.delay(500).then(() => this.endTurn());
    }
  }

  /**
   * Latch a turnover. Only the FIRST turnover during a resolution counts —
   * secondary failures while the ball settles (a bounce hitting a player who
   * drops it, etc.) must not stack extra end-of-turn calls, or the turn
   * flips twice and hands play straight back to the offending team.
   *
   * Returns true if this call latched the turnover (caller schedules the
   * actual turn end via completeTurnover once the ball is at rest).
   */
  public checkTurnover(reason: string): boolean {
    if (this.turnoverInProgress) {
      console.log(
        `[TurnManager] Turnover already latched; ignoring: ${reason}`
      );
      return false;
    }
    this.turnoverInProgress = true;

    this.eventBus.emit(GameEventNames.UI_Turnover, {
      teamId: this.state.activeTeamId || "",
      reason,
    });
    this.eventBus.emit(GameEventNames.Turnover, {
      teamId: this.state.activeTeamId || "",
    });
    return true;
  }

  /**
   * Finish a latched turnover: ends the turn exactly once. No-op if the
   * turn already ended some other way (e.g. the coach pressed End Turn).
   */
  public completeTurnover(): void {
    if (!this.turnoverInProgress) return;
    this.turnoverInProgress = false;
    this.endTurn();
  }

  // Helpers
  public getTurnNumber(teamId: string): number {
    return this.turnCounts[teamId] || 0;
  }

  public reset(): void {
    this.turnCounts = {
      [this.team1.id]: 0,
      [this.team2.id]: 0,
    };
    this.driveKickingTeamId = null;
  }

  /** True once the first drive has kicked off — the coin flip window is over. */
  public hasGameStarted(): boolean {
    return this.firstHalfKickingTeamId !== null;
  }

  public getDriveKickingTeamId(): string | null {
    return this.driveKickingTeamId;
  }

  public setDriveKickingTeam(teamId: string): void {
    this.driveKickingTeamId = teamId;
  }
}
