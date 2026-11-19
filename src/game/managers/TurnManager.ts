import {
  hasPendingMoments,
  whenMomentsComplete,
} from "../presentation/momentQueue";
import { realTimeDelay } from "../core/GameFlowManager";
import { type IEventBus } from "../../services/EventBus";
import {
  type GameState,
  GamePhase,
  SubPhase,
  type TurnData,
} from "@/types/GameState";
import { type Team } from "@/types/Team";
import { PlayerStatus } from "@/types/Player";
import { ActivationValidator } from "../validators/ActivationValidator";
import { type AllEvents, GameEventNames } from "../../types/events";
import { replenishTeamRerolls } from "../teamRerolls";
import { undecided } from "../rules/extraTime";

export interface TurnManagerState {
  turnCounts: Record<string, number>;
  driveKickingTeamId: string | null;
  firstHalfKickingTeamId: string | null;
  turnoverInProgress: boolean;

  stunnedAtTurnStart?: string[];
}

export type NextHalf = { kickingTeamId: string } | { rollOff: true };

export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

export class TurnManager {
  private handoverPending = false;

  private betweenTurnsActive = false;
  private maxTurns = 6;
  private turnCounts: Record<string, number> = {};
  private driveKickingTeamId: string | null = null;
  private firstHalfKickingTeamId: string | null = null;
  private turnoverInProgress = false;

  private stunnedAtTurnStart: string[] = [];
  private activationValidator: ActivationValidator = new ActivationValidator();

  private eventBus: IEventBus;
  private state: GameState;
  private team1: Team;
  private team2: Team;
  private callbacks: {
    onPhaseChanged: (phase: GamePhase, subPhase?: SubPhase) => void;

    onHalfEnded?: (next: NextHalf) => void;

    shootout?: () => Record<string, number>;

    onTurnEnding?: (endingTeamId: string) => void;

    betweenTurns?: (endingTeamId: string) => Promise<void> | null;
  };
  private delay: import("../core/GameFlowManager").DelayProvider;
  constructor(
    eventBus: IEventBus,
    state: GameState,
    team1: Team,
    team2: Team,
    callbacks: {
      onPhaseChanged: (phase: GamePhase, subPhase?: SubPhase) => void;

      onHalfEnded?: (next: NextHalf) => void;

      shootout?: () => Record<string, number>;

      onTurnEnding?: (endingTeamId: string) => void;

      betweenTurns?: (endingTeamId: string) => Promise<void> | null;
    },
    delay: import("../core/GameFlowManager").DelayProvider = realTimeDelay
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.team1 = team1;
    this.team2 = team2;
    this.callbacks = callbacks;
    this.delay = delay;
    this.turnCounts[team1.id] = 0;
    this.turnCounts[team2.id] = 0;
  }

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

    const receivingTeamId =
      kickingTeamId === this.team1.id ? this.team2.id : this.team1.id;

    this.state.subPhase = SubPhase.TURN_RECEIVING;
    this.state.activeTeamId = receivingTeamId;

    const activatePlayers = (team: Team) => {
      team.players.forEach((p) => {
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

    this.turnoverInProgress = false;
    this.state.activePlayer = null;

    if (this.driveKickingTeamId) {
      this.state.subPhase =
        teamId === this.driveKickingTeamId
          ? SubPhase.TURN_KICKING
          : SubPhase.TURN_RECEIVING;
    }

    this.callbacks.onPhaseChanged(GamePhase.PLAY, this.state.subPhase);

    this.turnCounts[teamId] = (this.turnCounts[teamId] || 0) + 1;
    const currentTurn = this.turnCounts[teamId];

    this.state.turn = {
      teamId: teamId,
      turnNumber: currentTurn,
      isHalf2: this.state.turn.isHalf2,
      ...(this.state.turn.extraTime ? { extraTime: true } : {}),
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

    const activeTeam = teamId === this.team1.id ? this.team1 : this.team2;
    this.stunnedAtTurnStart = activeTeam.players
      .filter((p) => p.status === PlayerStatus.STUNNED && p.gridPosition)
      .map((p) => p.id);

    this.eventBus.emit(GameEventNames.TurnStarted, this.state.turn);

    this.announceTurnStart(activeTeam.name, currentTurn);
  }

  private announceTurnStart(teamName: string, turnNumber: number): void {
    this.eventBus.emit(GameEventNames.UI_Announce, {
      kind: "turn-started",
      headline: `${possessive(teamName)} Turn`,
      subtitle: `Turn ${String(turnNumber)}`,
    });
  }

  public endTurn(): void {
    if (this.handoverPending || this.turnoverInProgress) return;

    if (hasPendingMoments(this.eventBus)) {
      this.handoverPending = true;
      const turn = this.state.turn;
      void whenMomentsComplete(this.eventBus).then(() => {
        this.handoverPending = false;
        if (this.state.turn === turn && this.state.phase === GamePhase.PLAY)
          this.endTurn();
      });
      return;
    }
    const currentTeamId = this.state.activeTeamId;
    if (!currentTeamId) return;

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

    this.callbacks.onTurnEnding?.(currentTeamId);

    const between = this.callbacks.betweenTurns?.(currentTeamId);
    if (between) {
      this.handoverPending = true;
      this.betweenTurnsActive = true;
      const turn = this.state.turn;
      void between.then(() => {
        this.handoverPending = false;
        this.betweenTurnsActive = false;
        if (this.state.turn === turn && this.state.phase === GamePhase.PLAY)
          this.beginNextTurn(currentTeamId);
      });
      return;
    }
    this.beginNextTurn(currentTeamId);
  }

  private beginNextTurn(currentTeamId: string): void {
    const otherTeamId =
      currentTeamId === this.team1.id ? this.team2.id : this.team1.id;
    const nextTeamId = [otherTeamId, currentTeamId].find(
      (teamId) => (this.turnCounts[teamId] ?? 0) < this.maxTurns
    );
    if (!nextTeamId) {
      this.endHalf();
      return;
    }

    this.startTurn(nextTeamId);
  }

  public skipNextTurn(teamId: string): void {
    this.turnCounts[teamId] = Math.min(
      this.maxTurns,
      (this.turnCounts[teamId] ?? 0) + 1
    );
  }

  public isHalfExhausted(): boolean {
    return (
      (this.turnCounts[this.team1.id] ?? 0) >= this.maxTurns &&
      (this.turnCounts[this.team2.id] ?? 0) >= this.maxTurns
    );
  }

  public beginNextHalf(): NextHalf | null {
    const undecidedGame =
      !this.state.result && undecided(this.state, this.team1, this.team2);
    if (this.state.turn.isHalf2 && undecidedGame && !this.state.turn.extraTime)
      return this.beginExtraTime();
    if (this.state.turn.isHalf2) {
      this.state.phase = GamePhase.GAME_OVER;
      this.state.activeTeamId = null;
      this.state.result ??= {
        reason: "completed",
        ...(undecidedGame && this.callbacks.shootout
          ? { penalties: this.callbacks.shootout() }
          : {}),
      };
      this.callbacks.onPhaseChanged(GamePhase.GAME_OVER);
      return null;
    }

    this.state.turn.isHalf2 = true;
    replenishTeamRerolls(this.state);
    this.turnCounts[this.team1.id] = 0;
    this.turnCounts[this.team2.id] = 0;
    this.announceBreak("Halftime");

    return {
      kickingTeamId:
        this.firstHalfKickingTeamId === this.team1.id
          ? this.team2.id
          : this.team1.id,
    };
  }

  private beginExtraTime(): NextHalf {
    this.state.turn.extraTime = true;
    this.turnCounts[this.team1.id] = 0;
    this.turnCounts[this.team2.id] = 0;
    this.announceBreak("Extra Time");
    return { rollOff: true };
  }

  private announceBreak(headline: string): void {
    this.state.phase = GamePhase.HALFTIME;
    this.callbacks.onPhaseChanged(GamePhase.HALFTIME);
    const score = `${this.team1.name} ${String(this.state.score?.[this.team1.id] ?? 0)} : ${String(this.state.score?.[this.team2.id] ?? 0)} ${this.team2.name}`;
    this.eventBus.emit(GameEventNames.UI_LogEntry, {
      category: "drive",
      headline,
      detail: score,
    });
    this.eventBus.emit(GameEventNames.UI_Announce, {
      kind: "halftime",
      headline,
      subtitle: score,
    });
  }

  public endHalf(): void {
    const next = this.beginNextHalf();

    if (next) this.callbacks.onHalfEnded?.(next);
  }

  public finishActivation(playerId: string): void {
    if (this.state.phase !== GamePhase.PLAY) return;

    if (!this.state.turn.activatedPlayerIds.has(playerId)) {
      this.state.turn.activatedPlayerIds.add(playerId);
      this.eventBus.emit(GameEventNames.PlayerActivated, playerId);
    }

    const activeTeam =
      this.state.activeTeamId === this.team1.id ? this.team1 : this.team2;
    const hasActions = this.activationValidator.hasAvailablePlayers(
      activeTeam,
      this.state.turn
    );

    if (!hasActions) {
      const turn = this.state.turn;
      this.delay(500).then(() => {
        if (this.state.turn === turn && this.state.phase === GamePhase.PLAY)
          this.endTurn();
      });
    }
  }

  public checkTurnover(
    reason: string
  ): AllEvents[typeof GameEventNames.UI_Turnover] | null {
    if (this.betweenTurnsActive) return null;
    if (this.turnoverInProgress) {
      console.log(
        `[TurnManager] Turnover already latched; ignoring: ${reason}`
      );
      return null;
    }
    this.turnoverInProgress = true;

    const player = [...this.team1.players, ...this.team2.players].find(
      (candidate) => candidate.id === this.state.activePlayer?.id
    );
    const who =
      player?.playerName ??
      (this.state.activeTeamId === this.team1.id ? this.team1 : this.team2)
        .name;
    this.eventBus.emit(GameEventNames.UI_LogEntry, {
      category: "action",
      headline: "TURNOVER",
      detail: `${who}: ${reason}`,
      teamId: this.state.activeTeamId ?? undefined,
    });
    this.eventBus.emit(GameEventNames.Turnover, {
      teamId: this.state.activeTeamId || "",
    });
    return {
      teamId: this.state.activeTeamId || "",
      reason,
      playerName: player?.playerName,
    };
  }

  public completeTurnover(): void {
    if (!this.turnoverInProgress) return;
    this.turnoverInProgress = false;

    if (this.state.phase !== GamePhase.PLAY) return;
    this.endTurn();
  }

  public isTurnoverInProgress(): boolean {
    return this.turnoverInProgress;
  }

  public getTurnNumber(teamId: string): number {
    return this.turnCounts[teamId] || 0;
  }

  public turnsLeft(teamId: string): number {
    return Math.max(0, this.maxTurns - this.getTurnNumber(teamId));
  }

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
