import { InjuryType, type Player } from "../../types/Player";
import { type Team } from "../../types/Team";
import { SkillType } from "../../types/Skills";
import { addedSkillCount } from "../progression/advancementModes";

const REDRAFT_BASE_BUDGET = 600_000;
const REDRAFT_BONUS_PER_WIN = 10_000;
const REDRAFT_BUDGET_CAP = 750_000;

export interface RedraftStart {
  budget: number;

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

    for (let lost = before.length - kept.length; lost > 0; lost--) {
      const index = player.skills
        .map((skill) => skill.type)
        .lastIndexOf(SkillType.HATRED);
      player.skills.splice(index, 1);
    }
  }
}

function emergencyCallUps(team: Team, rollD6: () => number): Player[] {
  const calledUp = team.players.filter(
    (player) => addedSkillCount(player) > 0 && rollD6() === 1
  );
  team.players = team.players.filter((player) => !calledUp.includes(player));
  return calledUp;
}

function redraftBudget(treasury: number, winsLastSeason: number): number {
  return Math.min(
    REDRAFT_BUDGET_CAP,
    REDRAFT_BASE_BUDGET + treasury + REDRAFT_BONUS_PER_WIN * winsLastSeason
  );
}
