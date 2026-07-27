import { IEventBus } from "../../services/EventBus";
import { GameState, GamePhase, SubPhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import {
  FormationPosition,
  SetupFormationResult,
  SetupState,
  SetupTeamStatus,
  SetupZone,
} from "@/types/SetupTypes";
import { SetupValidator } from "../validators/SetupValidator";
import { WeatherManager } from "./WeatherManager";
import { movePlayerToBox, playerBoxOf } from "../rules/playerLocation";

export class SetupManager {
  private placedPlayers: Map<string, { x: number; y: number }> = new Map();
  private setupReady: Set<string> = new Set();
  private validator = new SetupValidator();
  private lastError: string | null = null;
  /** Teams already told they have nobody left to field, this setup. */
  private reportedNoAvailablePlayers: Set<string> = new Set();

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    private weatherService: WeatherManager,
    private callbacks: {
      onKickoffRequested: () => void;
    },
    private delay: import("../core/GameFlowManager").DelayProvider = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {
    this.syncPlacedPlayers(team1);
    this.syncPlacedPlayers(team2);
    this.state.setup?.confirmedTeamIds.forEach((id) => this.setupReady.add(id));
  }

  private syncPlacedPlayers(team: Team): void {
    team.players.forEach((player) => {
      if (player.gridPosition) {
        this.placedPlayers.set(player.id, { ...player.gridPosition });
      }
    });
  }

  public static sanitizeTeam(team: Team): void {
    team.players.forEach((player) => {
      movePlayerToBox(player, { box: "reserves" });
      player.hasActed = false;
    });
  }

  /**
   * The players a team can actually field this drive: everyone not knocked
   * out, not a casualty and not sent off. This — not the seven-player roster
   * minimum — is what decides whether a team can complete its setup.
   */
  public availablePlayers(teamId: string): Player[] {
    const team = this.getTeam(teamId);
    return team ? this.getEligiblePlayers(team) : [];
  }

  /** Convenience count of {@link availablePlayers}. */
  public availablePlayerCount(teamId: string): number {
    return this.availablePlayers(teamId).length;
  }

  /**
   * Take a player off the pitch through the one location seam: the square is
   * released, an available player lands in Reserves and a knocked-out or
   * injured one in the box their status already names.
   */
  private returnToDugout(player: Player): void {
    player.gridPosition = undefined;
    movePlayerToBox(player, {
      box: this.isEligible(player) ? "reserves" : playerBoxOf(player),
    });
  }

  public startSetup(startingTeamId?: string): void {
    this.state.phase = GamePhase.SETUP;
    this.reportedNoAvailablePlayers.clear();

    if (startingTeamId) {
      const kickingTeam = this.getTeam(startingTeamId);
      if (!kickingTeam) {
        this.refuse(`Unknown kicking team: ${startingTeamId}`);
        return;
      }
      const receivingTeam =
        kickingTeam.id === this.team1.id ? this.team2 : this.team1;
      this.setupReady.clear();
      this.state.setup = this.createSetupState(
        kickingTeam.id,
        receivingTeam.id
      );
      this.state.subPhase = SubPhase.SETUP_KICKING;
      this.state.activeTeamId = kickingTeam.id;
      this.updateAllStatuses();
      this.eventBus.emit(GameEventNames.PhaseChanged, {
        phase: GamePhase.SETUP,
        subPhase: this.state.subPhase,
        activeTeamId: kickingTeam.id,
      });
      this.emitStatus(kickingTeam.id);
      return;
    }

    this.state.subPhase = SubPhase.WEATHER;
    this.eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.SETUP,
      subPhase: SubPhase.WEATHER,
    });
    this.weatherService.rollWeather();
    this.delay(2000).then(() => {
      this.state.subPhase = SubPhase.COIN_FLIP;
      this.eventBus.emit(GameEventNames.PhaseChanged, {
        phase: GamePhase.SETUP,
        subPhase: SubPhase.COIN_FLIP,
      });
    });
  }

  public placePlayer(playerId: string, x: number, y: number): boolean {
    this.lastError = null;
    if (this.state.phase !== GamePhase.SETUP) {
      return this.refuse("Players may only be placed during setup.");
    }

    const player = this.getPlayerById(playerId);
    if (!player) return this.refuse(`Unknown player: ${playerId}`);
    if (this.state.activeTeamId !== player.teamId) {
      return this.refuse(
        "Only the team currently setting up may place players."
      );
    }
    if (!this.isEligible(player)) {
      return this.refuse("That player is not available for this drive.");
    }
    const status = this.getSetupStatus(player.teamId);
    if (status?.concessionDecision === "pending") {
      return this.refuse(
        "Choose whether to concede or play on before placing players."
      );
    }

    const team = this.getTeam(player.teamId)!;
    const positions = this.getFormationPositions(player.teamId).filter(
      (position) => position.playerId !== playerId
    );
    const validation = this.validator.validatePlacement(
      { playerId, x, y },
      positions,
      player.teamId === this.team1.id,
      this.getEligiblePlayers(team).length
    );
    if (!validation.valid) {
      return this.refuse(validation.errors[0] ?? "Illegal setup placement.", {
        playerId,
        x,
        y,
      });
    }
    if (this.isSquareOccupiedByOther(x, y, playerId)) {
      return this.refuse("Only one player may occupy a pitch square.", {
        playerId,
        x,
        y,
      });
    }

    this.placedPlayers.set(playerId, { x, y });
    movePlayerToBox(player, { box: "pitch", position: { x, y } });
    this.updateStatus(player.teamId);
    this.eventBus.emit(GameEventNames.PlayerPlaced, { playerId, x, y });
    this.emitStatus(player.teamId);
    return true;
  }

  public removePlayer(playerId: string): void {
    this.lastError = null;
    const player = this.getPlayerById(playerId);
    if (
      !player ||
      this.state.phase !== GamePhase.SETUP ||
      this.state.activeTeamId !== player.teamId
    ) {
      this.refuse("Only the team currently setting up may remove players.");
      return;
    }
    if (this.placedPlayers.delete(playerId)) {
      this.returnToDugout(player);
      this.updateStatus(player.teamId);
      this.eventBus.emit(GameEventNames.PlayerRemoved, playerId);
      this.emitStatus(player.teamId);
    }
  }

  public swapPlayers(player1Id: string, player2Id: string): boolean {
    this.lastError = null;
    if (this.state.phase !== GamePhase.SETUP) {
      return this.refuse("Players may only be swapped during setup.");
    }
    const player1 = this.getPlayerById(player1Id);
    const player2 = this.getPlayerById(player2Id);
    if (
      !player1 ||
      !player2 ||
      player1.teamId !== player2.teamId ||
      player1.teamId !== this.state.activeTeamId
    ) {
      return this.refuse(
        "Only players on the team currently setting up may be swapped."
      );
    }

    const pos1 = this.placedPlayers.get(player1Id);
    const pos2 = this.placedPlayers.get(player2Id);
    if (!pos1 && !pos2) return this.refuse("Neither player is on the pitch.");

    if (pos1 && pos2) {
      this.placedPlayers.set(player1Id, pos2);
      this.placedPlayers.set(player2Id, pos1);
    } else if (pos1) {
      this.placedPlayers.set(player2Id, pos1);
      this.placedPlayers.delete(player1Id);
    } else if (pos2) {
      this.placedPlayers.set(player1Id, pos2);
      this.placedPlayers.delete(player2Id);
    }
    for (const player of [player1, player2]) {
      const position = this.placedPlayers.get(player.id);
      if (position) {
        movePlayerToBox(player, { box: "pitch", position });
      } else {
        this.returnToDugout(player);
      }
    }
    this.updateStatus(player1.teamId);
    this.eventBus.emit(GameEventNames.PlayersSwapped, {
      player1Id,
      player2Id,
    });
    this.emitStatus(player1.teamId);
    return true;
  }

  public applyFormation(
    teamId: string,
    formation: FormationPosition[]
  ): SetupFormationResult {
    this.lastError = null;
    const team = this.getTeam(teamId);
    if (!team || this.state.activeTeamId !== teamId) {
      const reason = "Only the team currently setting up may load a formation.";
      this.refuse(reason);
      return {
        placedPlayerIds: [],
        skipped: [{ reason }],
        status: this.requireStatus(teamId),
      };
    }
    const status = this.getSetupStatus(teamId);
    if (status?.concessionDecision === "pending") {
      const reason =
        "Choose whether to concede or play on before loading a formation.";
      this.refuse(reason);
      return {
        placedPlayerIds: [],
        skipped: [{ reason }],
        status,
      };
    }

    this.clearTeamPlacements(team);
    const eligible = this.getEligiblePlayers(team);
    const placedPlayerIds: string[] = [];
    const skipped: { playerId?: string; reason: string }[] = [];
    const used = new Set<string>();

    formation
      .slice(0, Math.min(7, eligible.length))
      .forEach((position, index) => {
        const rosterIndex = Number.parseInt(position.playerId, 10);
        const indexed = Number.isNaN(rosterIndex)
          ? eligible[index]
          : team.players[rosterIndex];
        const player =
          indexed && this.isEligible(indexed) && !used.has(indexed.id)
            ? indexed
            : eligible.find((candidate) => !used.has(candidate.id));
        if (!player) {
          skipped.push({
            reason: "No available player for this preset square.",
          });
          return;
        }
        used.add(player.id);
        if (this.placePlayer(player.id, position.x, position.y)) {
          placedPlayerIds.push(player.id);
        } else {
          skipped.push({
            playerId: player.id,
            reason: this.lastError ?? "Illegal preset placement.",
          });
        }
      });

    this.updateStatus(teamId);
    this.emitStatus(teamId);
    return {
      placedPlayerIds,
      skipped,
      status: this.requireStatus(teamId),
    };
  }

  public confirmSetup(teamId: string): boolean {
    this.lastError = null;
    if (
      this.state.phase !== GamePhase.SETUP ||
      this.state.activeTeamId !== teamId
    ) {
      return this.refuse(
        "Only the team currently setting up may confirm its formation."
      );
    }

    const status = this.updateStatus(teamId);
    if (!status.canConfirm) {
      const reason =
        status.restrictions.find(
          (restriction) => restriction.satisfiable && !restriction.satisfied
        )?.message ?? "Setup is incomplete.";
      return this.refuse(reason);
    }

    const team = this.getTeam(teamId)!;
    this.getEligiblePlayers(team).forEach((player) => {
      if (!player.gridPosition) movePlayerToBox(player, { box: "reserves" });
    });
    this.setupReady.add(teamId);
    const setup = this.ensureSetupState();
    setup.confirmedTeamIds = Array.from(this.setupReady);
    this.eventBus.emit(GameEventNames.SetupConfirmed, teamId);

    if (this.state.subPhase === SubPhase.SETUP_KICKING) {
      const receivingTeamId = setup.receivingTeamId!;
      this.delay(100).then(() => {
        this.state.subPhase = SubPhase.SETUP_RECEIVING;
        this.state.activeTeamId = receivingTeamId;
        setup.currentTeamId = receivingTeamId;
        this.updateStatus(receivingTeamId);
        this.eventBus.emit(GameEventNames.PhaseChanged, {
          phase: GamePhase.SETUP,
          subPhase: SubPhase.SETUP_RECEIVING,
          activeTeamId: receivingTeamId,
        });
        this.emitStatus(receivingTeamId);
      });
    } else if (this.state.subPhase === SubPhase.SETUP_RECEIVING) {
      setup.currentTeamId = null;
      this.callbacks.onKickoffRequested();
    }
    return true;
  }

  public resolveConcession(teamId: string, concede: boolean): boolean {
    this.lastError = null;
    const status = this.getSetupStatus(teamId);
    if (
      this.state.phase !== GamePhase.SETUP ||
      this.state.activeTeamId !== teamId ||
      !status ||
      status.concessionDecision !== "pending"
    ) {
      return this.refuse(
        "No pre-setup concession decision is pending for that team."
      );
    }

    status.concessionDecision = concede ? "conceded" : "continue";
    if (concede) {
      this.state.phase = GamePhase.GAME_OVER;
      this.state.activeTeamId = null;
      this.ensureSetupState().currentTeamId = null;
      this.eventBus.emit(GameEventNames.SetupConcessionResolved, {
        teamId,
        conceded: true,
        penaltyFree: true,
      });
      this.eventBus.emit(GameEventNames.PhaseChanged, {
        phase: GamePhase.GAME_OVER,
      });
      return true;
    }

    this.updateStatus(teamId);
    this.eventBus.emit(GameEventNames.SetupConcessionResolved, {
      teamId,
      conceded: false,
      penaltyFree: true,
    });
    this.emitStatus(teamId);
    return true;
  }

  /**
   * Setup is complete when `min(7, availablePlayers)` are placed (plus the
   * usual formation restrictions) — never "seven placed". A team depleted by
   * KOs and casualties fields everyone it has and plays on; the placement cap
   * stays at seven.
   */
  public isSetupComplete(teamId: string): boolean {
    return this.updateStatus(teamId).canConfirm;
  }

  public getSetupStatus(teamId: string): SetupTeamStatus | undefined {
    const setup = this.state.setup;
    if (!setup || !this.getTeam(teamId)) return undefined;
    return this.updateStatus(teamId);
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public getSetupZone(teamId: string): SetupZone | undefined {
    if (teamId === this.team1.id) return this.validator.getSetupZone(true);
    if (teamId === this.team2.id) return this.validator.getSetupZone(false);
    return undefined;
  }

  public getFormationPositions(teamId: string): FormationPosition[] {
    const team = this.getTeam(teamId);
    if (!team) return [];
    return team.players.flatMap((player) => {
      const position = this.placedPlayers.get(player.id);
      return position ? [{ playerId: player.id, ...position }] : [];
    });
  }

  public reset(): void {
    this.placedPlayers.clear();
    this.setupReady.clear();
    this.reportedNoAvailablePlayers.clear();
    this.state.setup = undefined;
  }

  public resetForNewDrive(): void {
    this.placedPlayers.clear();
    this.setupReady.clear();
    this.reportedNoAvailablePlayers.clear();
    this.state.setup = undefined;
    [this.team1, this.team2].forEach((team) => {
      team.players.forEach((player) => {
        player.hasActed = false;
        // Everyone leaves the pitch: available players to Reserves, the
        // knocked out / injured / sent off stay in their own box.
        this.returnToDugout(player);
      });
    });
  }

  public setPlacedPlayer(playerId: string, x: number, y: number): void {
    this.placedPlayers.set(playerId, { x, y });
  }

  private createSetupState(
    kickingTeamId: string,
    receivingTeamId: string
  ): SetupState {
    return {
      kickingTeamId,
      receivingTeamId,
      currentTeamId: kickingTeamId,
      confirmedTeamIds: [],
      teams: {},
    };
  }

  private ensureSetupState(): SetupState {
    if (!this.state.setup) {
      const kicking = this.state.activeTeamId ?? this.team1.id;
      const receiving =
        kicking === this.team1.id ? this.team2.id : this.team1.id;
      this.state.setup = this.createSetupState(kicking, receiving);
    }
    return this.state.setup;
  }

  private updateAllStatuses(): void {
    this.updateStatus(this.team1.id);
    this.updateStatus(this.team2.id);
  }

  private updateStatus(teamId: string): SetupTeamStatus {
    const setup = this.ensureSetupState();
    const team = this.getTeam(teamId);
    if (!team) return this.requireStatus(teamId);
    const availablePlayerCount = this.getEligiblePlayers(team).length;
    const positions = this.getFormationPositions(teamId);
    const validation = this.validator.validateFormation(
      positions,
      teamId === this.team1.id,
      availablePlayerCount
    );
    const previousDecision = setup.teams[teamId]?.concessionDecision;
    const concessionDecision =
      previousDecision ??
      (availablePlayerCount <= 3 ? "pending" : "not-offered");
    const restrictions = [...validation.restrictions];
    if (concessionDecision === "pending") {
      restrictions.push({
        id: "concession-decision",
        satisfied: false,
        satisfiable: true,
        message: "Choose whether to concede without penalty or play on.",
      });
    }
    const status: SetupTeamStatus = {
      teamId,
      placedPlayerCount: positions.length,
      requiredPlayerCount: Math.min(7, availablePlayerCount),
      availablePlayerCount,
      restrictions,
      canConfirm:
        restrictions.every(
          (restriction) => !restriction.satisfiable || restriction.satisfied
        ) && concessionDecision !== "pending",
      concessionDecision,
    };
    setup.teams[teamId] = status;
    return status;
  }

  private requireStatus(teamId: string): SetupTeamStatus {
    const existing = this.state.setup?.teams[teamId];
    if (existing) return existing;
    return {
      teamId,
      placedPlayerCount: 0,
      requiredPlayerCount: 0,
      availablePlayerCount: 0,
      restrictions: [],
      canConfirm: false,
      concessionDecision: "not-offered",
    };
  }

  private emitStatus(teamId: string): void {
    const status = this.updateStatus(teamId);
    this.eventBus.emit(GameEventNames.SetupRestrictionsUpdated, status);
    // A team with nobody left to field is a distinct condition, not an
    // incomplete setup — say so once instead of stalling silently.
    if (
      status.availablePlayerCount === 0 &&
      !this.reportedNoAvailablePlayers.has(teamId)
    ) {
      this.reportedNoAvailablePlayers.add(teamId);
      const line = `${this.getTeam(teamId)?.name ?? teamId} has no available players — every player is knocked out, injured or sent off.`;
      this.eventBus.emit(GameEventNames.UI_Notification, line);
      this.eventBus.emit(GameEventNames.UI_GameLog, line);
    }
    if (status.concessionDecision === "pending") {
      this.eventBus.emit(GameEventNames.SetupConcessionOffered, {
        teamId,
        availablePlayerCount: status.availablePlayerCount,
      });
    }
  }

  private refuse(
    reason: string,
    placement?: { playerId: string; x: number; y: number }
  ): false {
    this.lastError = reason;
    if (placement) {
      this.eventBus.emit(GameEventNames.PlacementInvalid, {
        ...placement,
        reason,
      });
    }
    this.eventBus.emit(GameEventNames.UI_Notification, reason);
    return false;
  }

  private clearTeamPlacements(team: Team): void {
    team.players.forEach((player) => {
      if (this.placedPlayers.delete(player.id)) {
        this.returnToDugout(player);
        this.eventBus.emit(GameEventNames.PlayerRemoved, player.id);
      }
    });
  }

  private isSquareOccupiedByOther(
    x: number,
    y: number,
    playerId: string
  ): boolean {
    for (const [id, position] of this.placedPlayers.entries()) {
      if (id !== playerId && position.x === x && position.y === y) return true;
    }
    return false;
  }

  private getEligiblePlayers(team: Team): Player[] {
    return team.players.filter((player) => this.isEligible(player));
  }

  private isEligible(player: Player): boolean {
    return ![
      PlayerStatus.KO,
      PlayerStatus.INJURED,
      PlayerStatus.DEAD,
      PlayerStatus.REMOVED,
    ].includes(player.status);
  }

  private getTeam(teamId: string): Team | undefined {
    if (teamId === this.team1.id) return this.team1;
    if (teamId === this.team2.id) return this.team2;
    return undefined;
  }

  private getPlayerById(playerId: string): Player | undefined {
    return (
      this.team1.players.find((player) => player.id === playerId) ||
      this.team2.players.find((player) => player.id === playerId)
    );
  }
}
