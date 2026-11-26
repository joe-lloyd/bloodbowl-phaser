import { describe, expect, it } from "vitest";
import {
  getRosterByRosterName,
  getSecretRosterNames,
} from "../RosterTemplates";
import { hirePlayer, purchase } from "../../game/rules/teamPricing";
import type { Skill } from "../../types/Skills";
import { type RosterName, createTeam } from "../../types/Team";
import { SECRET_TEAMS } from "./secretRosters";

function draft(rosterName: RosterName, positionName: string) {
  const roster = getRosterByRosterName(rosterName);
  const team = createTeam(
    "Test",
    rosterName,
    { primary: 0, secondary: 0 },
    roster.rerollCost
  );
  const template = roster.playerTemplates.find(
    (candidate) => candidate.positionName === positionName
  );
  if (!template) throw new Error(`${rosterName} has no ${positionName}`);
  const { player } = hirePlayer(team, template);
  const reroll = purchase(team, { type: "reroll" });
  return { team, player, reroll };
}

function skillNames(skills: readonly Skill[]) {
  return skills.map((skill) =>
    skill.parameter === undefined
      ? skill.type
      : `${skill.type} (${String(skill.parameter)})`
  );
}

describe("Secret League rosters", () => {
  it("drafts an Albion Woad Berserker with the stat line from the file", () => {
    const { team, player, reroll } = draft("Albion", "Woad Berserker");

    expect(team.rerollCost).toBe(100_000);
    expect(reroll.amount).toBe(100_000);
    expect(player).toMatchObject({
      positionName: "Woad Berserker",
      cost: 90_000,
      stats: { MA: 5, ST: 4, AG: 5, PA: 6, AV: 8 },
      keywords: ["Blitzer", "Human"],
      primary: ["General", "Strength"],
      secondary: ["Agility"],
    });
    expect(skillNames(player?.skills ?? [])).toEqual([
      "Frenzy",
      "Iron Hard Skin",
      "Thick Skull",
      "Unsteady",
    ]);
  });

  it("drafts a Wintertooth Ice Troll that names Breathe Fire (Ice)", () => {
    const { team, player, reroll } = draft("Wintertooth", "Ice Trolls");

    expect(team.rerollCost).toBe(100_000);
    expect(reroll.amount).toBe(100_000);
    expect(player).toMatchObject({
      cost: 120_000,
      stats: { MA: 4, ST: 5, AG: 5, PA: 5, AV: 10 },
      keywords: ["Big Guy", "Troll"],
      primary: ["Mutation", "Strength"],
      secondary: ["Agility", "General", "Passing"],
    });
    expect(skillNames(player?.skills ?? [])).toEqual([
      "Loner (3+)",
      "Always Hungry",
      "Really Stupid",
      "Breathe Fire (Ice)",
      "Mighty Blow",
      "Regeneration",
      "Thick Skull",
      "Throw Team-mate",
    ]);
  });

  it("offers every team whose file entry the game can read", () => {
    expect(getSecretRosterNames()).toHaveLength(101);
    expect(
      SECRET_TEAMS.flatMap((team) => (team.lineup.ok ? [] : [team.name]))
    ).toEqual([
      "Chaos Imp",
      "Elemental",
      "Eonir",
      "Forest Goblin",
      "Malal",
      "Northern Nippon",
      "Spawn of Chaos",
      "Tilea",
      "Tzeentch",
      "Werewolf",
    ]);
  });
});
