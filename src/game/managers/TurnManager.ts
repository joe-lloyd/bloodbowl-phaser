import { realTimeDelay } from "../core/GameFlowManager";
import { IEventBus } from "../../services/EventBus";
import { GameState, GamePhase, SubPhase, TurnData } from "@/types/GameState";
import { Team } from "@/types/Team";
import { PlayerStatus } from "@/types/Player";
import { ActivationValidator } from "../validators/ActivationValidator";
import { GameEventNames } from "../../types/events";
import { replenishTeamRerolls } from "../teamRerolls";

export interface TurnManagerState {
  turnCounts: Record<string, number>;
  driveKickingTeamId: string | null;
  firstHalfKickingTeamId: string | null;
  turnoverInProgress: boolean;
  /** Absent in saves made before Stunned players rolled over at turn end. */
  stunnedAtTurnStart?: string[];
}

/** Cosmetic-only stagger so "turn passes to X" and "X's turn" read as two
 *  beats instead of the announcer instantly replacing one with the other —
 *  the actual turn state below changes synchronously, unaffected. */
const TURN_ANNOUNCE_DELAY_MS = 1100;

export class TurnManager {
  private maxTurns: number = 6; // Sevens default
  private turnCounts: { [key: string]: number } = {};
  private driveKickingTeamId: string | null = null;
  private firstHalfKickingTeamId: string | null = null;
  private turnoverInProgress: boolean = false;
  /** Active-team players who started this turn Stunned; they roll over at its end. */
  private stunnedAtTurnStart: string[] = [];
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
    private delay: import("../core/GameFlowManager").DelayProvider = realTimeDelay
  ) {
    this.turnCounts[team1.id] = 0;
    this.turnCounts[team2.id] = 0;
  }

  /**
   * Force both teams' per-turn counters to a given turn number. Used when a
   * sandbox scenario begins mid-drive so the match tracker shows that turn
   * instead of Turn 0. A live game never calls this — startTurn drives the
   * counts — so it does not disturb normal turn counting or halftime.
   */
  public seedTurnCounts(turnNumber: number): void {
    this.turnCounts[this.team1.id] = turnNumber;
    this.turnCounts[this.team2.id] = turnNumber;
  }

  public captureState(): TurnManagerState {
    return {
      turnCounts: { ...this.turnCounts },
      driveKickingTeamId: this.driveKickingTeamId,
      firstHalfKickingTeamId: this.firstHalfKickingTeamId,
      turnoverInProgress: this.turnoverInProgress,
      stunnedAtTurnStart: [...this.stunnedAtTurnStart],
    };
  }

  public restoreState(snapshot: TurnManagerState): void {
    this.turnCounts = {
      [this.team1.id]: snapshot.turnCounts[this.team1.id] ?? 0,
      [this.team2.id]: snapshot.turnCounts[this.team2.id] ?? 0,
    };
    this.driveKickingTeamId = snapshot.driveKickingTeamId;
    this.firstHalfKickingTeamId = snapshot.firstHalfKickingTeamId;
    this.turnoverInProgress = snapshot.turnoverInProgress;
    this.stunnedAtTurnStart = [...(snapshot.stunnedAtTurnStart ?? [])];
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
        // Setup players enter as Reserves; activate those, but preserve any
        // Prone/Stunned result inflicted by the kickoff event.
        if (p.gridPosition && p.status === PlayerStatus.RESERVE) {
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
    // A fresh turn always clears any stale turnover latch, and any
    // activation a turnover cut short: it belonged to the previous turn.
    this.turnoverInProgress = false;
    this.state.activePlayer = null;

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
      hasThrownTeamMate: false,
      hasKickedTeamMate: false,
      hasThrownBomb: false,
      movementUsed: new Map(),
    };

    // A player who starts the turn Stunned cannot be activated
    // (ActivationValidator) and rolls over at the end of it (endTurn).
    const activeTeam = teamId === this.team1.id ? this.team1 : this.team2;
    this.stunnedAtTurnStart = activeTeam.players
      .filter((p) => p.status === PlayerStatus.STUNNED && p.gridPosition)
      .map((p) => p.id);

    this.eventBus.emit(GameEventNames.TurnStarted, this.state.turn as TurnData);

    this.announceTurnStart(activeTeam.name, currentTurn);
  }

  /** Bookend a turn's start on the announcer — staggered so a preceding
   *  "round passed" beat (see endTurn) has time to actually be seen. */
  private announceTurnStart(teamName: string, turnNumber: number): void {
    this.delay(TURN_ANNOUNCE_DELAY_MS).then(() => {
      this.eventBus.emit(GameEventNames.UI_Announce, {
        kind: "turn-started",
        headline: `${teamName}'s Turn`,
        subtitle: `Turn ${turnNumber}`,
      });
    });
  }

  public endTurn(): void {
    const currentTeamId = this.state.activeTeamId;
    if (!currentTeamId) return;

    // "At the end of each team's turn, any players on their team that
    // started that turn Stunned will automatically roll over and become
    // Prone" (2025 rulebook, Stunned). Stunned mid-turn waits a turn.
    const endingTeam =
      currentTeamId === this.team1.id ? this.team1 : this.team2;
    for (const player of endingTeam.players) {
      if (
        this.stunnedAtTurnStart.includes(player.id) &&
        player.status === PlayerStatus.STUNNED &&
        player.gridPosition
      ) {
        player.status = PlayerStatus.PRONE;
        this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
      }
    }
    this.stunnedAtTurnStart = [];
    this.eventBus.emit(GameEventNames.TurnEnded, { teamId: currentTeamId });

    // Fires before the next turn starts, so its effects (Pick-Me-Up
    // stand-ups) are in place when that turn begins
    this.callbacks.onTurnEnding?.(currentTeamId);

    // Play alternates, but a team that has used all its turns never gets
    // another: the other team plays on, and the half ends once both are out.
    const otherTeamId =
      currentTeamId === this.team1.id ? this.team2.id : this.team1.id;
    const nextTeamId = [otherTeamId, currentTeamId].find(
      (teamId) => (this.turnCounts[teamId] ?? 0) < this.maxTurns
    );
    if (!nextTeamId) {
      this.endHalf();
      return;
    }

    const nextTeam = nextTeamId === this.team1.id ? this.team1 : this.team2;
    this.eventBus.emit(GameEventNames.UI_Announce, {
      kind: "round-passed",
      headline: `Turn Passes To ${nextTeam.name}`,
    });

    this.startTurn(nextTeamId);
  }

  /**
   * A team that scores during its opponent's Turn skips its next Turn
   * celebrating (2025 rulebook, "Scoring during your opponent's Turn"):
   * its Turn Marker moves on without the Turn being played.
   */
  public skipNextTurn(teamId: string): void {
    this.turnCounts[teamId] = Math.min(
      this.maxTurns,
      (this.turnCounts[teamId] ?? 0) + 1
    );
  }

  /** Both teams have used every turn of the current half. */
  public isHalfExhausted(): boolean {
    return (
      (this.turnCounts[this.team1.id] ?? 0) >= this.maxTurns &&
      (this.turnCounts[this.team2.id] ?? 0) >= this.maxTurns
    );
  }

  /**
   * Cross the half boundary without going through endTurn: swap the kickoff
   * (first-half receiver kicks), reset the turn counts and announce
   * HALFTIME. Returns the team that kicks the second half, or null when the
   * second half is already over — the match is finished.
   *
   * Split out of endHalf so a touchdown scored with no turns left can end
   * the half in place, rather than kicking off a further drive in it.
   */
  public beginNextHalf(): string | null {
    if (this.state.turn.isHalf2) {
      this.state.phase = GamePhase.GAME_OVER;
      this.state.activeTeamId = null;
      this.state.result ??= { reason: "completed" };
      this.callbacks.onPhaseChanged(GamePhase.GAME_OVER);
      return null;
    }

    this.state.turn.isHalf2 = true;
    replenishTeamRerolls(this.state);
    this.turnCounts[this.team1.id] = 0;
    this.turnCounts[this.team2.id] = 0;

    this.state.phase = GamePhase.HALFTIME;
    this.callbacks.onPhaseChanged(GamePhase.HALFTIME);
    this.eventBus.emit(GameEventNames.UI_Announce, {
      kind: "halftime",
      headline: "Halftime",
    });

    return this.firstHalfKickingTeamId === this.team1.id
      ? this.team2.id
      : this.team1.id;
  }

  public endHalf(): void {
    const secondHalfKicker = this.beginNextHalf();
    // Halftime runs a fresh setup for the second half; full time does not.
    if (secondHalfKicker) this.callbacks.onHalfEnded?.(secondHalfKicker);
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
      // The coach may press End Turn inside the delay; ending again then
      // would skip the opponent's whole turn.
      const turn = this.state.turn;
      this.delay(500).then(() => {
        if (this.state.turn === turn && this.state.phase === GamePhase.PLAY)
          this.endTurn();
      });
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

  /** True while a turnover has been latched and its resolution is settling. */
  public isTurnoverInProgress(): boolean {
    return this.turnoverInProgress;
  }

  // Helpers
  public getTurnNumber(teamId: string): number {
    return this.turnCounts[teamId] || 0;
  }

  /**
   * Time-Out (kickoff 3): move both teams' turn markers, clamped to the
   * half's bounds — a marker never goes below 0 or past the last turn.
   */
  public moveTurnMarkers(delta: number): void {
    for (const teamId of [this.team1.id, this.team2.id]) {
      const current = this.turnCounts[teamId] || 0;
      this.turnCounts[teamId] = Math.max(
        0,
        Math.min(this.maxTurns, current + delta)
      );
    }
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
