import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { Player } from "../../types/Player";
import { Team } from "../../types/Team";

export interface PlayerMatchStats {
  playerId: string;
  teamId: string;
  participated: boolean;
  completions: number;
  superbThrows: number;
  safeLandings: number;
  interceptions: number;
  casualties: number;
  touchdowns: number;
  mvps: number;
  blocks: number;
  yards: number;
  injuriesSuffered: number;
  sppEarned: number;
}

export interface MatchStatsSummary {
  progressionEnabled: boolean;
  players: PlayerMatchStats[];
}

export interface MatchStatsSnapshot {
  version: 1;
  progressionEnabled: boolean;
  applied: boolean;
  players: PlayerMatchStats[];
}

export const SPP_VALUES = {
  completion: 1,
  superbThrow: 1,
  safeLanding: 1,
  interception: 2,
  casualty: 2,
  touchdown: 3,
  mvp: 4,
} as const;

function emptyStats(player: Player): PlayerMatchStats {
  return {
    playerId: player.id,
    teamId: player.teamId,
    participated: false,
    completions: 0,
    superbThrows: 0,
    safeLandings: 0,
    interceptions: 0,
    casualties: 0,
    touchdowns: 0,
    mvps: 0,
    blocks: 0,
    yards: 0,
    injuriesSuffered: 0,
    sppEarned: 0,
  };
}

export function sppFromMatchStats(stats: PlayerMatchStats): number {
  return (
    stats.completions * SPP_VALUES.completion +
    stats.superbThrows * SPP_VALUES.superbThrow +
    stats.safeLandings * SPP_VALUES.safeLanding +
    stats.interceptions * SPP_VALUES.interception +
    stats.casualties * SPP_VALUES.casualty +
    stats.touchdowns * SPP_VALUES.touchdown +
    stats.mvps * SPP_VALUES.mvp
  );
}

/**
 * Phaser-free event observer. It can be mounted in the browser container or
 * in the plain Node headless bootstrap.
 */
export class MatchStats {
  private readonly stats = new Map<string, PlayerMatchStats>();
  private applied = false;
  /** Only Advanced League teams earn SPP (see team-advancement-modes); a
   *  team with no mode yet (unmigrated legacy team) defaults to earning SPP
   *  so existing saves keep behaving as before this feature existed. */
  private readonly sppEligibleTeamIds: Set<string>;

  constructor(
    private readonly eventBus: IEventBus,
    teams: Team[],
    public readonly progressionEnabled = false
  ) {
    this.sppEligibleTeamIds = new Set(
      teams
        .filter(
          (team) =>
            !team.advancementMode || team.advancementMode === "advanced-league"
        )
        .map((team) => team.id)
    );
    teams
      .flatMap((team) => team.players)
      .forEach((player) => {
        this.stats.set(player.id, emptyStats(player));
      });
    this.subscribe();
  }

  private get(playerId: string): PlayerMatchStats | undefined {
    return this.stats.get(playerId);
  }

  private participate(playerId: string): void {
    const stats = this.get(playerId);
    if (stats) stats.participated = true;
  }

  private subscribe(): void {
    this.eventBus.on(GameEventNames.PlayerPlaced, ({ playerId }) =>
      this.participate(playerId)
    );
    this.eventBus.on(GameEventNames.PlayerActivated, (playerId) =>
      this.participate(playerId)
    );
    this.eventBus.on(GameEventNames.PassCompleted, ({ playerId }) => {
      const stats = this.get(playerId);
      if (stats) stats.completions++;
    });
    this.eventBus.on(GameEventNames.ThrowTeammateLanded, (result) => {
      if (!result.safeLanding) return;
      const passenger = this.get(result.thrownPlayerId);
      if (passenger) passenger.safeLandings++;
      if (result.superbThrow) {
        const thrower = this.get(result.throwerId);
        if (thrower) thrower.superbThrows++;
      }
    });
    this.eventBus.on(GameEventNames.PassIntercepted, ({ interceptorId }) => {
      const stats = this.get(interceptorId);
      if (stats) stats.interceptions++;
    });
    this.eventBus.on(
      GameEventNames.PlayerCasualtyInflicted,
      ({ causerId, victimId, sppEligible }) => {
        const victim = this.get(victimId);
        if (victim) victim.injuriesSuffered++;
        if (!sppEligible || !causerId) return;
        const causer = this.get(causerId);
        if (causer) causer.casualties++;
      }
    );
    this.eventBus.on(GameEventNames.Touchdown, ({ scorerId }) => {
      if (!scorerId) return;
      const stats = this.get(scorerId);
      if (stats) stats.touchdowns++;
    });
    this.eventBus.on(GameEventNames.MvpAwarded, ({ playerId }) => {
      const stats = this.get(playerId);
      if (stats) stats.mvps++;
    });
    this.eventBus.on(
      GameEventNames.AwardedTouchdownAssigned,
      ({ playerId }) => {
        const stats = this.get(playerId);
        if (stats) stats.touchdowns++;
      }
    );
    this.eventBus.on(GameEventNames.BlockDiceRolled, ({ attackerId }) => {
      const stats = this.get(attackerId);
      if (stats) stats.blocks++;
    });
    this.eventBus.on(
      GameEventNames.PlayerMoved,
      ({ playerId, path, thrown }) => {
        this.participate(playerId);
        if (thrown) return;
        const stats = this.get(playerId);
        if (stats) stats.yards += path?.length ?? 1;
      }
    );
  }

  getEligibleMvpPlayers(teamId: string): string[] {
    return [...this.stats.values()]
      .filter((stats) => stats.teamId === teamId && stats.participated)
      .map((stats) => stats.playerId);
  }

  awardMvp(teamId: string, nominatedPlayerIds: string[], roll: number): string {
    const eligible = new Set(this.getEligibleMvpPlayers(teamId));
    const required = Math.min(6, eligible.size);
    const unique = [...new Set(nominatedPlayerIds)];
    if (
      unique.length !== required ||
      unique.some((playerId) => !eligible.has(playerId))
    ) {
      throw new Error(`MVP requires ${required} unique participating players`);
    }
    if (roll < 1 || roll > unique.length) {
      throw new Error("MVP roll is outside the nominated player slots");
    }
    const playerId = unique[roll - 1];
    this.eventBus.emit(GameEventNames.MvpAwarded, { teamId, playerId, roll });
    return playerId;
  }

  assignAwardedTouchdown(playerId: string): void {
    const stats = this.get(playerId);
    if (!stats) throw new Error("Unknown touchdown recipient");
    this.eventBus.emit(GameEventNames.AwardedTouchdownAssigned, {
      teamId: stats.teamId,
      playerId,
    });
  }

  summary(players?: Player[]): MatchStatsSummary {
    const byId = new Map(players?.map((player) => [player.id, player]));
    const result = [...this.stats.values()].map((stats) => {
      const player = byId.get(stats.playerId);
      const eligible =
        player?.playerKind !== "star" &&
        this.sppEligibleTeamIds.has(stats.teamId);
      return {
        ...stats,
        sppEarned:
          this.progressionEnabled && eligible ? sppFromMatchStats(stats) : 0,
      };
    });
    return { progressionEnabled: this.progressionEnabled, players: result };
  }

  /** JSON-safe accumulated state for local-match resume. */
  captureState(): MatchStatsSnapshot {
    return {
      version: 1,
      progressionEnabled: this.progressionEnabled,
      applied: this.applied,
      players: [...this.stats.values()].map((stats) => ({ ...stats })),
    };
  }

  /** Restore counters while preserving this instance's event subscriptions. */
  restoreState(snapshot: MatchStatsSnapshot): void {
    if (
      snapshot.version !== 1 ||
      snapshot.progressionEnabled !== this.progressionEnabled ||
      !Array.isArray(snapshot.players)
    ) {
      throw new Error("unsupported-or-invalid-match-stats-state");
    }
    this.stats.clear();
    snapshot.players.forEach((stats) => {
      this.stats.set(stats.playerId, { ...stats });
    });
    this.applied = snapshot.applied;
  }

  applySpp(teams: Team[], concedingTeamId?: string): MatchStatsSummary {
    if (this.applied) throw new Error("Match SPP has already been applied");
    const players = teams.flatMap((team) => team.players);
    const summary = this.summary(players);
    if (!this.progressionEnabled) {
      this.applied = true;
      return summary;
    }
    const byId = new Map(players.map((player) => [player.id, player]));
    summary.players.forEach((stats) => {
      const player = byId.get(stats.playerId);
      if (!player || player.playerKind === "star") return;
      const earned = stats.teamId === concedingTeamId ? 0 : stats.sppEarned;
      stats.sppEarned = earned;
      player.spp = (player.spp ?? 0) + earned;
    });
    this.applied = true;
    return summary;
  }
}
