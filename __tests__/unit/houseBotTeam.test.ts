import { describe, expect, it } from "vitest";
import { createComputerTeamFromTemplate } from "../../src/competition/computerTeamTemplates";
import { houseBotTeam } from "../../src/social/houseBotTeam";
import { teamValueText, withinTeamValue } from "../../src/social/teamValueRange";
import { calculateTeamValue } from "../../src/types/Team";

describe("a team value range", () => {
  const goblins = createComputerTeamFromTemplate("goblin-max-weapons");

  it("lets in a team between its bounds and keeps others out", () => {
    expect(calculateTeamValue(goblins)).toBe(490_000);
    expect(withinTeamValue(goblins, { min: 450_000, max: 500_000 })).toBe(true);
    expect(withinTeamValue(goblins, { max: 480_000 })).toBe(false);
    expect(withinTeamValue(goblins, { min: 500_000 })).toBe(false);
    expect(withinTeamValue(goblins, undefined)).toBe(true);
  });

  it("reads plainly", () => {
    expect(teamValueText({ min: 450_000, max: 500_000 })).toBe("450k to 500k");
    expect(teamValueText({ max: 600_000 })).toBe("up to 600k");
    expect(teamValueText({ min: 700_000 })).toBe("700k or more");
    expect(teamValueText({})).toBe("any team value");
  });
});

describe("the house bot's team", () => {
  it("is a computer team inside the host's range, coached by the bot", () => {
    const picks = [0, 0.99].map((roll) =>
      houseBotTeam({ gameType: "sevens", teamValue: { min: 450_000, max: 500_000 }, random: () => roll })
    );
    expect(picks.map((team) => team?.name).sort()).toEqual([
      "Second Breakfast Club",
      "Weapons of Pass Destruction",
    ]);
    expect(picks.map((team) => [team?.computerCoached, team?.coachName, team?.advancementMode])).toEqual([
      [undefined, "House Bot", "matched-play"],
      [undefined, "House Bot", "matched-play"],
    ]);
  });

  it("can be any computer team when the host sets no range", () => {
    const names = new Set(
      Array.from({ length: 40 }, (_, index) =>
        houseBotTeam({ gameType: "sevens", teamValue: undefined, random: () => index / 40 })?.name
      )
    );
    expect(names.size).toBeGreaterThan(30);
  });

  it("is missing when no computer team fits the range", () => {
    expect(houseBotTeam({ gameType: "sevens", teamValue: { min: 1_000_000 }, random: () => 0 })).toBeNull();
  });
});
