import { describe, expect, it } from "vitest";
import { createPlayer } from "../../types/Player";
import { SkillCategory, SkillType, getSkill } from "../../types/Skills";
import { fixtureValue } from "../../testing/fixtureValue";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { RosterName } from "../../types/Team";
import { rollRandomPrimaryCandidates } from "./progression";

function devious(skills: readonly SkillType[]) {
  const template = fixtureValue(
    getRosterByRosterName(RosterName.HUMAN).playerTemplates[0]
  );
  const player = createPlayer(template, "team", 1);
  player.primary = [SkillCategory.DEVIOUS];
  player.skills = skills.map((skill) => getSkill(skill));
  return player;
}

function dice(...rolls: number[]) {
  return { rollDie: () => fixtureValue(rolls.shift()) };
}

const VIOLENT_INNOVATOR = [6, 6] as const;
const DIRTY_PLAYER = [1, 1] as const;
const EYE_GOUGE = [1, 2] as const;

describe("rolling a random skill", () => {
  it("re-rolls Violent Innovator without a Special Action trait", () => {
    const rolled = rollRandomPrimaryCandidates(
      devious([]),
      SkillCategory.DEVIOUS,
      dice(...VIOLENT_INNOVATOR, ...DIRTY_PLAYER, ...EYE_GOUGE)
    );
    expect(rolled.map((r) => r.skill)).toEqual(["Dirty Player", "Eye Gouge"]);
  });

  it("keeps Violent Innovator for a player with Stab", () => {
    const rolled = rollRandomPrimaryCandidates(
      devious([SkillType.STAB]),
      SkillCategory.DEVIOUS,
      dice(...VIOLENT_INNOVATOR, ...DIRTY_PLAYER)
    );
    expect(rolled.map((r) => r.skill)).toEqual([
      "Violent Innovator",
      "Dirty Player",
    ]);
  });

  it("re-rolls a skill the player has", () => {
    const rolled = rollRandomPrimaryCandidates(
      devious([SkillType.DIRTY_PLAYER]),
      SkillCategory.DEVIOUS,
      dice(...EYE_GOUGE, ...DIRTY_PLAYER, ...EYE_GOUGE)
    );
    expect(rolled.map((r) => r.skill)).toEqual(["Eye Gouge", "Eye Gouge"]);
  });

  it("keeps the same valid skill rolled twice", () => {
    const rolled = rollRandomPrimaryCandidates(
      devious([]),
      SkillCategory.DEVIOUS,
      dice(...DIRTY_PLAYER, ...DIRTY_PLAYER)
    );
    expect(rolled.map((r) => r.skill)).toEqual([
      "Dirty Player",
      "Dirty Player",
    ]);
  });
});
