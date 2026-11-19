import { type GameState, type TurnUsage } from "../../types/GameState";
import { type Team } from "../../types/Team";
import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { consumeFreeReroll, freeRerollsFor } from "../kickoff/driveEffects";
import { spendTeamReroll, teamRerollsLeft } from "../teamRerolls";

export type TeamRerollKind = "free" | "team" | "leader";

export class RerollArbiter {
  private state: GameState;
  private getTeam: (teamId: string) => Team | undefined;
  private eventBus: (IEventBus) | undefined;
  constructor(
    state: GameState,
    getTeam: (teamId: string) => Team | undefined,
    eventBus?: IEventBus
  ) {
    this.state = state;
    this.getTeam = getTeam;
    this.eventBus = eventBus;
  }

  public beginHalf(teamIds: string[]): void {
    const half = this.state.turn.isHalf2 ? "h2" : "h1";
    if (this.state.leaderRerolls?.half === half) return;
    this.state.leaderRerolls = {
      half,
      teamIds: teamIds.filter((teamId) => this.hasOnPitchLeader(teamId)),
    };
  }

  private onPitchLeader(teamId: string): Player | undefined {
    return this.getTeam(teamId)?.players.find(
      (player) =>
        !!player.gridPosition && hasSkill(player.skills, SkillType.LEADER)
    );
  }

  private hasOnPitchLeader(teamId: string): boolean {
    return !!this.onPitchLeader(teamId);
  }

  private leaderRerollAvailable(teamId: string): boolean {
    return (
      !!this.state.leaderRerolls?.teamIds.includes(teamId) &&
      this.hasOnPitchLeader(teamId)
    );
  }

  private turnKey(): string {
    const t = this.state.turn;
    const period = t.extraTime ? "et" : t.isHalf2 ? "h2" : "h1";
    const key = `${t.teamId}:${String(t.turnNumber)}:${period}`;
    const charge = this.state.chargeTeamId;
    return charge ? `charge:${charge}:${key}` : key;
  }

  private spent(): TurnUsage | undefined {
    const usage = this.state.turnUsage;
    return usage?.turn === this.turnKey() ? usage : undefined;
  }

  private spend(): TurnUsage {
    const turn = this.turnKey();
    if (this.state.turnUsage?.turn !== turn)
      this.state.turnUsage = { turn, teams: [], once: [], uses: {} };
    return this.state.turnUsage;
  }

  public skillRerollAvailable(player: Player, skill: SkillType): boolean {
    return !this.spent()?.once.includes(`${player.id}|${skill}`);
  }

  public teamRerollAvailable(teamId: string): boolean {
    return this.nextTeamReroll(teamId) !== null;
  }

  public nextTeamReroll(teamId: string): TeamRerollKind | null {
    const turnTeamId = this.state.chargeTeamId ?? this.state.turn.teamId;
    if (turnTeamId !== teamId) return null;
    if (this.spent()?.teams.includes(teamId)) return null;
    if (freeRerollsFor(this.state, teamId) > 0) return "free";
    if (this.teamRerollsLeftFor(teamId) > 0) return "team";
    if (this.leaderRerollAvailable(teamId)) return "leader";
    return null;
  }

  public teamRerollsLeftFor(teamId: string): number {
    const team = this.getTeam(teamId);
    return team ? teamRerollsLeft(this.state, team) : 0;
  }

  public veteranRerollAvailable(player: Player): boolean {
    return (
      !!player.veteran && !this.state.veteranRerollsUsed?.includes(player.id)
    );
  }

  public consumeVeteranReroll(player: Player): void {
    this.state.veteranRerollsUsed = [
      ...(this.state.veteranRerollsUsed ?? []),
      player.id,
    ];
    this.eventBus?.emit(GameEventNames.SkillTriggered, {
      playerId: player.id,
      skill: "Veteran",
      effect: "Veteran: spent the once-per-game re-roll",
    });
  }

  public consumeSkillReroll(player: Player, skill: SkillType): void {
    const once = this.spend().once;
    const key = `${player.id}|${skill}`;
    if (!once.includes(key)) once.push(key);
  }

  public onceAvailable(player: Player, skill: SkillType): boolean {
    return this.skillRerollAvailable(player, skill);
  }

  public consumeOnce(player: Player, skill: SkillType): void {
    this.consumeSkillReroll(player, skill);
  }

  public usesThisTurn(player: Player, skill: SkillType): number {
    return this.spent()?.uses[`${player.id}|${skill}`] ?? 0;
  }

  public consumeUse(player: Player, skill: SkillType): void {
    const uses = this.spend().uses;
    const key = `${player.id}|${skill}`;
    uses[key] = (uses[key] ?? 0) + 1;
  }

  public markTeamRerollUsed(teamId: string): void {
    const teams = this.spend().teams;
    if (!teams.includes(teamId)) teams.push(teamId);
  }

  public consumeTeamReroll(teamId: string): void {
    this.markTeamRerollUsed(teamId);

    if (consumeFreeReroll(this.state, teamId)) {
      this.eventBus?.emit(GameEventNames.DriveEffectExpired, {
        teamId,
        effect: "free-team-reroll",
        detail: "Brilliant Coaching free re-roll spent",
      });
      this.eventBus?.emit(
        GameEventNames.UI_Notification,
        "Brilliant Coaching: free re-roll spent"
      );
      return;
    }
    const team = this.getTeam(teamId);
    if (team && spendTeamReroll(this.state, team)) return;
    if (this.state.leaderRerolls && this.leaderRerollAvailable(teamId)) {
      this.state.leaderRerolls.teamIds =
        this.state.leaderRerolls.teamIds.filter((id) => id !== teamId);
      const leader = this.onPitchLeader(teamId);
      if (leader) {
        this.eventBus?.emit(GameEventNames.SkillTriggered, {
          playerId: leader.id,
          skill: SkillType.LEADER,
          effect: "Leader: spent the team's Leader Re-roll",
        });
      }
    }
  }
}
