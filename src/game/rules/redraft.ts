/**
 * Re-drafting a league team between seasons (docs/SEVENS_RULES.md R1-R3).
 *
 * `beginRedraft` is the off-season entry point: Rest and Relaxation, then
 * Emergency Call-ups, then the Re-draft Budget the coach drafts the new
 * Team Draft List with. Sevens has no Temporary Retirement, so there is
 * nothing to recover from it. Re-hiring players and staff from that budget
 * has no screen yet.
 */

import { InjuryType, Player } from "../../types/Player";
import { Team } from "../../types/Team";
import { SkillType } from "../../types/Skills";
import { addedSkillCount } from "../progression/advancementModes";

/** R3 */
export const REDRAFT_BASE_BUDGET = 600_000;
export const REDRAFT_BONUS_PER_WIN = 10_000;
export const REDRAFT_BUDGET_CAP = 750_000;

export interface RedraftStart {
  /** R3: gold for the new Team Draft List. */
  budget: number;
  /** R2: players who left the team for an Emergency Call-up. */
  calledUp: Player[];
}

export function beginRedraft(
  team: Team,
  winsLastSeason: number,
  rollD6: () => number
): RedraftStart {
  restAndRelaxation(team, rollD6);
  const calledUp = emergencyCallUps(team, rollD6);
  return { budget: redraftBudget(team.treasury, winsLastSeason), calledUp };
}

/**
 * R1: players due to miss the next game recover, and each gained Hatred is
 * lost on a 4+. Hatred from the player's own profile never rolls.
 */
function restAndRelaxation(team: Team, rollD6: () => number): void {
  for (const player of team.players) {
    player.injuries = player.injuries.filter(
      (injury) => injury !== InjuryType.MISS_NEXT_GAME
    );
    const before = player.advancements ?? [];
    const kept = before.filter(
      (advancement) => advancement.name !== SkillType.HATRED || rollD6() < 4
    );
    player.advancements = kept;
    // Gained skills follow the profile's own, so drop Hatreds from the end.
    for (let lost = before.length - kept.length; lost > 0; lost--) {
      const index = player.skills
        .map((skill) => skill.type)
        .lastIndexOf(SkillType.HATRED);
      player.skills.splice(index, 1);
    }
  }
}

/** R2: a D6 for each player with an added skill; on a 1 they leave. */
function emergencyCallUps(team: Team, rollD6: () => number): Player[] {
  const calledUp = team.players.filter(
    (player) => addedSkillCount(player) > 0 && rollD6() === 1
  );
  team.players = team.players.filter((player) => !calledUp.includes(player));
  return calledUp;
}

/** R3: 600,000 plus the Treasury plus 10,000 a win, capped at 750,000. */
function redraftBudget(treasury: number, winsLastSeason: number): number {
  return Math.min(
    REDRAFT_BUDGET_CAP,
    REDRAFT_BASE_BUDGET + treasury + REDRAFT_BONUS_PER_WIN * winsLastSeason
  );
}
