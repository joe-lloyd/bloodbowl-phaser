/**
 * RerollArbiter - central home for every reroll timing constraint, so no
 * individual skill rule re-implements them:
 *
 * - a reroll may never be rerolled (roll paths only offer on the first roll)
 * - a skill reroll is usable once per action (players activate once per team
 *   turn, so per-turn tracking keyed by player+skill is equivalent)
 * - a team reroll is usable once per team turn, only on that team's own
 *   turn, and spends one of the team's re-rolls for this half
 */

import { GameState } from "../../types/GameState";
import { Team } from "../../types/Team";
import { Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { consumeFreeReroll, freeRerollsFor } from "../kickoff/driveEffects";
import { spendTeamReroll, teamRerollsLeft } from "../teamRerolls";

export class RerollArbiter {
  private usedSkill = new Set<string>();
  private usedTeam = new Set<string>();

  constructor(
    private state: GameState,
    private getTeam: (teamId: string) => Team | undefined,
    private eventBus?: IEventBus
  ) {}

  /**
   * Grant each team with a Leader on the pitch one Leader Re-roll, once per
   * half. The bank lives on GameState so saves and online sync carry it.
   */
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

  /**
   * Usable only with a Leader on the pitch. A Knocked Out or unselected
   * Leader just pauses it; Casualty or Sent-off Leaders never return this
   * half, so once all are gone it is effectively lost.
   */
  private leaderRerollAvailable(teamId: string): boolean {
    return (
      !!this.state.leaderRerolls?.teamIds.includes(teamId) &&
      this.hasOnPitchLeader(teamId)
    );
  }

  /** One team turn = one key; usage sets reset naturally as turns advance. */
  private turnKey(): string {
    const t = this.state.turn;
    return `${t.teamId}:${t.turnNumber}:${t.isHalf2 ? "h2" : "h1"}`;
  }

  public skillRerollAvailable(player: Player, skill: SkillType): boolean {
    return !this.usedSkill.has(`${this.turnKey()}|${player.id}|${skill}`);
  }

  public teamRerollAvailable(teamId: string): boolean {
    // A team reroll may only be spent on that team's own turn
    if (this.state.turn.teamId !== teamId) return false;
    if (this.usedTeam.has(`${this.turnKey()}|${teamId}`)) return false;
    return (
      freeRerollsFor(this.state, teamId) > 0 ||
      this.teamRerollsLeftFor(teamId) > 0 ||
      this.leaderRerollAvailable(teamId)
    );
  }

  private teamRerollsLeftFor(teamId: string): number {
    const team = this.getTeam(teamId);
    return team ? teamRerollsLeft(this.state, team) : 0;
  }

  /** Sevens Veteran (D8): one re-roll per game, kept on GameState. */
  public veteranRerollAvailable(player: Player): boolean {
    return (
      !!player.veteran &&
      !this.state.veteranRerollsUsed?.includes(player.id)
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
    this.usedSkill.add(`${this.turnKey()}|${player.id}|${skill}`);
  }

  /**
   * Generic once-per-turn skill usage (Break Tackle's modifier, …) —
   * the same per-turn ledger the skill rerolls use, aliased for intent.
   */
  public onceAvailable(player: Player, skill: SkillType): boolean {
    return this.skillRerollAvailable(player, skill);
  }

  public consumeOnce(player: Player, skill: SkillType): void {
    this.consumeSkillReroll(player, skill);
  }

  /** Counted per-turn skill usage (Shadowing may fire MA times per turn). */
  private usesCount = new Map<string, number>();

  public usesThisTurn(player: Player, skill: SkillType): number {
    return this.usesCount.get(`${this.turnKey()}|${player.id}|${skill}`) ?? 0;
  }

  public consumeUse(player: Player, skill: SkillType): void {
    const key = `${this.turnKey()}|${player.id}|${skill}`;
    this.usesCount.set(key, (this.usesCount.get(key) ?? 0) + 1);
  }

  public consumeTeamReroll(teamId: string): void {
    this.usedTeam.add(`${this.turnKey()}|${teamId}`);
    // Brilliant Coaching's free re-roll is spent before the team's own.
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
