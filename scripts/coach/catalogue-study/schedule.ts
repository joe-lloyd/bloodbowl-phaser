import { COMPUTER_TEAM_CATALOGUE } from "../../../src/data/computerTeamCatalogue";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../../../src/competition/computerTeamTemplates";
import { SkillType } from "../../../src/types/Skills";
import { TeamSpecialRule } from "../../../src/types/Team";
import { standardFor } from "../../../src/simulation/standards";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import type { StudyJob } from "./model";

export function catalogueInventory() {
  const templates = getComputerTeamTemplates();
  const available = new Set(templates.map((t) => t.id));
  const excluded = COMPUTER_TEAM_CATALOGUE.filter(
    (t) => !available.has(t.id)
  ).map((t) => {
    try {
      createComputerTeamFromTemplate(t.id);
      return { id: t.id, reason: "Unavailable in the default ruleset" };
    } catch (error) {
      return { id: t.id, reason: String(error) };
    }
  });
  const teams = templates.map((template) => {
    const team = createComputerTeamFromTemplate(template.id);
    return {
      ...template,
      teamValue: team.teamValue,
      specialRules: getRosterByRosterName(team.rosterName).specialRules,
      standard: standardFor(template.rosterName),
      players: team.players.map((p) => ({
        position: p.positionName,
        number: p.number,
        skills: p.skills,
        stats: p.stats,
      })),
    };
  });
  return {
    teams,
    excluded,
    skills: Object.values(SkillType),
    specialRules: Object.values(TeamSpecialRule),
  };
}

/** Every available recipe plays every other recipe, at home and away. */
function leagueSchedule(ids: string[]): StudyJob[] {
  const jobs: StudyJob[] = [];
  let pair = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const pairId = `league-${pair}`;
      for (const reverse of [false, true]) {
        jobs.push({
          id: `${pairId}-${Number(reverse)}`,
          cohort: "league",
          pair: pairId,
          seed: 1_000_000 + pair,
          templates: reverse ? [ids[j], ids[i]] : [ids[i], ids[j]],
          coaches: ["planner", "planner"],
        });
      }
      pair++;
    }
  }
  return jobs;
}

export function studySchedule(): StudyJob[] {
  const ids = getComputerTeamTemplates().map((t) => t.id);
  const jobs = leagueSchedule(ids);
  // Odd-sized catalogue: each cyclic opponent offset visits every team at
  // home and away. Swapping coaches within each seed balances roster strength.
  for (const [cohort, offsets, firstSeed, opponent] of [
    ["calibration", [1, 7, 17, 29, 37, 40], 2_000_000, "heuristic"],
    ["hard", [23], 3_000_000, "hard"],
    ["legend", [31], 4_000_000, "legend"],
  ] as const) {
    for (const [round, offset] of offsets.entries()) {
      for (let i = 0; i < ids.length; i++) {
        const pairId = `${cohort}-${round}-${i}`;
        for (const swap of [false, true]) {
          jobs.push({
            id: `${pairId}-${Number(swap)}`,
            cohort,
            pair: pairId,
            seed: firstSeed + round * ids.length + i,
            templates: [ids[i], ids[(i + offset) % ids.length]],
            coaches: swap ? [opponent, "planner"] : ["planner", opponent],
          });
        }
      }
    }
  }
  return jobs;
}
