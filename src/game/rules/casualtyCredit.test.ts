import { describe, expect, it } from "vitest";
import { createPlayer } from "../../types/Player";
import { SkillType, getSkill } from "../../types/Skills";
import { RosterName } from "../../types/Team";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { fixtureValue } from "../../testing/fixtureValue";
import { earnsCasualtySpp } from "./casualtyCredit";

function player(
  team: string,
  number: number,
  skills: readonly SkillType[] = []
) {
  const template = fixtureValue(
    getRosterByRosterName(RosterName.HUMAN).playerTemplates[0]
  );
  const made = createPlayer(template, team, number);
  made.skills = skills.map((skill) => getSkill(skill));
  return made;
}

describe("SPP for a casualty", () => {
  const innovator = player("a", 1, [SkillType.VIOLENT_INNOVATOR]);
  const plain = player("a", 2);
  const victim = player("b", 1);

  it("pays for a block", () => {
    expect(earnsCasualtySpp(plain, victim, "block")).toBe(true);
  });

  it("pays for a Special Action only with Violent Innovator", () => {
    expect(earnsCasualtySpp(innovator, victim, "special")).toBe(true);
    expect(earnsCasualtySpp(plain, victim, "special")).toBe(false);
  });

  it("never pays for a foul, the crowd or a team-mate", () => {
    expect(earnsCasualtySpp(innovator, victim, "foul")).toBe(false);
    expect(earnsCasualtySpp(undefined, victim, "special")).toBe(false);
    expect(earnsCasualtySpp(innovator, plain, "special")).toBe(false);
  });
});
