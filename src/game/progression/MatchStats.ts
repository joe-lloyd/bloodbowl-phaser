import { type IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { type Player } from "../../types/Player";
import { RosterName, type Team, TeamSpecialRule } from "../../types/Team";
import { getRosterByRosterName } from "../../data/RosterTemplates";

export interface PlayerMatchStats {
  playerId: string;
  teamId: string;
  participated: boolean;
  completions: number;

  attempts: number;
  superbThrows: number;
  safeLandings: number;
  interceptions: number;
  casualties: number;

  kills: number;
  touchdowns: number;
  mvps: number;
  blocks: number;

  yards: number;
  injuriesSuffered: number;

  awardedTouchdownSpp?: number;
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

  concedingTeamId?: string;
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

export type SppValues = { readonly [K in keyof typeof SPP_VALUES]: number };

const BRAWLIN_BRUTES_SPP_VALUES: SppValues = {
  ...SPP_VALUES,
  casualty: 3,
  touchdown: 2,
};

export function sppValuesFor(rosterName: RosterName): SppValues {
  return getRosterByRosterName(rosterName).specialRules.includes(
    TeamSpecialRule.BRAWLIN_BRUTES
  )
    ? BRAWLIN_BRUTES_SPP_VALUES
    : SPP_VALUES;
}

function emptyStats(player: Player): PlayerMatchStats {
  return {
    playerId: player.id,
    teamId: player.teamId,
    participated: false,
    completions: 0,
    attempts: 0,
    superbThrows: 0,
    safeLandings: 0,
    interceptions: 0,
    casualties: 0,
    kills: 0,
    touchdowns: 0,
    mvps: 0,
    blocks: 0,
    yards: 0,
    injuriesSuffered: 0,
    awardedTouchdownSpp: 0,
    sppEarned: 0,
  };
}

export function sppFromMatchStats(
  stats: PlayerMatchStats,
  values: SppValues = SPP_VALUES
): number {
  return (
    stats.completions * values.completion +
    stats.superbThrows * values.superbThrow +
    stats.safeLandings * values.safeLanding +
    stats.interceptions * values.interception +
    stats.casualties * values.casualty +
    stats.touchdowns * values.touchdown +
    (stats.awardedTouchdownSpp ?? 0) * values.touchdown +
    stats.mvps * values.mvp
  );
}

export class MatchStats {
  private readonly stats = new Map<string, PlayerMatchStats>();
  private appliedFlag = false;

  private concedingTeamId: string | undefined;

  get applied(): boolean {
    return this.appliedFlag;
  }

  private readonly sppEligibleTeamIds: Set<string>;
  private readonly sppValues: Map<string, SppValues>;

  private readonly eventBus: IEventBus;
  private readonly teams: Team[];
  public readonly progressionEnabled: boolean;
  constructor(eventBus: IEventBus, teams: Team[], progressionEnabled = false) {
    this.eventBus = eventBus;
    this.teams = teams;
    this.progressionEnabled = progressionEnabled;
    this.sppEligibleTeamIds = new Set(
      teams
        .filter(
          (team) =>
            !team.advancementMode || team.advancementMode === "advanced-league"
        )
        .map((team) => team.id)
    );
    this.sppValues = new Map(
      teams.map((team) => [team.id, sppValuesFor(team.rosterName)])
    );
    teams
      .flatMap((team) => team.players)
      .forEach((player) => {
        this.stats.set(player.id, emptyStats(player));
      });
    this.subscribe();
  }

  private get(playerId: string): PlayerMatchStats | undefined {
    if (!this.stats.has(playerId)) {
      const player = this.teams
        .flatMap((team) => team.players)
        .find((candidate) => candidate.id === playerId);
      if (player) this.stats.set(playerId, emptyStats(player));
    }
    return this.stats.get(playerId);
  }

  private participate(playerId: string): void {
    const stats = this.get(playerId);
    if (stats) stats.participated = true;
  }

  private subscribe(): void {
    this.eventBus.on(GameEventNames.PlayerPlaced, ({ playerId }) => {
      this.participate(playerId);
    });
    this.eventBus.on(GameEventNames.PlayerActivated, (playerId) => {
      this.participate(playerId);
    });
    this.eventBus.on(GameEventNames.PassAttempted, ({ playerId }) => {
      const stats = this.get(playerId);
      if (stats) stats.attempts++;
    });
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
    this.eventBus.on(GameEventNames.PlayerKilled, ({ causerId }) => {
      if (!causerId) return;
      const causer = this.get(causerId);
      if (causer) causer.kills++;
    });
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
        if (stats)
          stats.awardedTouchdownSpp = (stats.awardedTouchdownSpp ?? 0) + 1;
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
      throw new Error(
        `MVP requires ${String(required)} unique participating players`
      );
    }
    if (roll < 1 || roll > unique.length) {
      throw new Error("MVP roll is outside the nominated player slots");
    }
    const playerId = unique[roll - 1];
    if (playerId === undefined)
      throw new Error("MVP roll is outside the nominated player slots");
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

      const zeroed = this.appliedFlag && stats.teamId === this.concedingTeamId;
      return {
        ...stats,
        sppEarned:
          this.progressionEnabled && eligible && !zeroed
            ? sppFromMatchStats(stats, this.sppValues.get(stats.teamId))
            : 0,
      };
    });
    return { progressionEnabled: this.progressionEnabled, players: result };
  }

  captureState(): MatchStatsSnapshot {
    return {
      version: 1,
      progressionEnabled: this.progressionEnabled,
      applied: this.appliedFlag,
      ...(this.concedingTeamId === undefined ? {} : { concedingTeamId: this.concedingTeamId }),
      players: [...this.stats.values()].map((stats) => ({ ...stats })),
    };
  }

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
      const legacy: Partial<PlayerMatchStats> = stats;
      this.stats.set(stats.playerId, {
        awardedTouchdownSpp: 0,
        ...stats,
        attempts: legacy.attempts ?? 0,
        kills: legacy.kills ?? 0,
      });
    });
    this.appliedFlag = snapshot.applied;
    this.concedingTeamId = snapshot.concedingTeamId;
  }

  applySpp(teams: Team[], concedingTeamId?: string): MatchStatsSummary {
    if (this.appliedFlag) throw new Error("Match SPP has already been applied");

    this.concedingTeamId = concedingTeamId;
    this.appliedFlag = true;
    const players = teams.flatMap((team) => team.players);
    const summary = this.summary(players);
    if (this.progressionEnabled) {
      const byId = new Map(players.map((player) => [player.id, player]));
      summary.players.forEach((stats) => {
        const player = byId.get(stats.playerId);
        if (!player || player.playerKind === "star") return;
        player.spp = (player.spp ?? 0) + stats.sppEarned;
      });
    }
    this.eventBus.emit(GameEventNames.MatchSppApplied, undefined);
    return summary;
  }
}
