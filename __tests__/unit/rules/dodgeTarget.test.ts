import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { dodgeTarget } from "../../../src/game/rules/rollPreview";
import { planMoveLegs } from "../../../src/game/rules/moveLegs";
import { PlayerStatus } from "../../../src/types/Player";
import { getSkill, SkillType } from "../../../src/types/Skills";
import { createTestPlayer } from "../../fixtures/players";

const from = { x: 5, y: 5 };
const to = { x: 6, y: 5 };
const player = createTestPlayer({
  stats: { MA: 6, ST: 2, AG: 3, PA: 4, AV: 8 },
  skills: [],
});
const markers = [
  { x: 5, y: 6 },
  { x: 6, y: 6 },
  { x: 7, y: 6 },
].map((gridPosition, i) =>
  createTestPlayer({
    id: `marker-${String(i)}`,
    gridPosition,
    status: PlayerStatus.ACTIVE,
    skills: [],
  })
);

describe("Dodge targets in a marked destination", () => {
  it.each([
    { name: "ordinary player", skills: [], target: 6 },
    { name: "Stunty", skills: [SkillType.STUNTY], target: 3 },
    {
      name: "Stunty and Titchy",
      skills: [SkillType.STUNTY, SkillType.TITCHY],
      target: 2,
    },
    {
      name: "Stunty and Two Heads",
      skills: [SkillType.STUNTY, SkillType.TWO_HEADS],
      target: 2,
    },
    {
      name: "both dodge bonuses",
      skills: [SkillType.STUNTY, SkillType.TITCHY, SkillType.TWO_HEADS],
      target: 2,
    },
  ])("shows $target+ for $name", ({ skills, target }) => {
    expect(
      dodgeTarget(
        { ...player, skills: skills.map((s) => getSkill(s)) },
        from,
        to,
        markers
      )
    ).toBe(target);
  });

  it("does not count a Titchy marker's penalty but still requires a Dodge", () => {
    const opponents = [{ ...fixtureValue(markers[0]), skills: [getSkill(SkillType.TITCHY)] }];
    expect(
      planMoveLegs(from, [to], {
        player,
        opponents,
        ma: 6,
        used: 0,
        rushModifier: 0,
      })
    ).toEqual([{ risk: { kind: "dodge", dodgeNeed: 3 }, path: [to] }]);
  });

  it("counts only the ordinary markers in a mixture with Titchy", () => {
    const opponents = markers.map((p, i) => ({
      ...p,
      skills: i === 0 ? [getSkill(SkillType.TITCHY)] : [],
    }));
    expect(dodgeTarget(player, from, to, opponents)).toBe(5);
  });

  it("ignores Prehensile Tail when it marks only the destination", () => {
    const opponent = {
      ...fixtureValue(markers[2]),
      skills: [getSkill(SkillType.PREHENSILE_TAIL)],
    };
    expect(dodgeTarget(player, from, to, [opponent])).toBe(4);
  });
});
