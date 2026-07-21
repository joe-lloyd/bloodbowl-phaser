/**
 * RerollArbiter - central home for every reroll timing constraint, so no
 * individual skill rule re-implements them:
 *
 * - a reroll may never be rerolled (roll paths only offer on the first roll)
 * - a skill reroll is usable once per action (players activate once per team
 *   turn, so per-turn tracking keyed by player+skill is equivalent)
 * - a team reroll is usable once per team turn, only on that team's own
 *   turn, and spends one from the team's counter
 */

import { GameState } from "../../types/GameState";
import { Team } from "../../types/Team";
import { Player } from "../../types/Player";
import { SkillType } from "../../types/Skills";

export class RerollArbiter {
  private usedSkill = new Set<string>();
  private usedTeam = new Set<string>();

  constructor(
    private state: GameState,
    private getTeam: (teamId: string) => Team | undefined
  ) {}

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
    return (this.getTeam(teamId)?.rerolls ?? 0) > 0;
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
    const team = this.getTeam(teamId);
    if (team && team.rerolls > 0) team.rerolls -= 1;
  }
}
