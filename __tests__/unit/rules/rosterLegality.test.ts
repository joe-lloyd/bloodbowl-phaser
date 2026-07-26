import { describe, it, expect } from "vitest";
import { RosterName, createTeam } from "../../../src/types/Team";
import { createPlayer, PlayerTemplate } from "../../../src/types/Player";
import { validateRosterLegality } from "../../../src/game/rules/rosterLegality";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";

const humanRoster = getRosterByRosterName(RosterName.HUMAN);
const lineman = humanRoster.playerTemplates.find((t) =>
  t.keywords.includes("Lineman" as never)
)!;
const blitzer: PlayerTemplate = humanRoster.playerTemplates.find((t) =>
  t.keywords.includes("Blitzer" as never)
)!;

function teamWith(templates: PlayerTemplate[]) {
  const team = createTeam("Test", RosterName.HUMAN, {
    primary: 0,
    secondary: 0,
  });
  templates.forEach((template, index) => {
    team.players.push(createPlayer(template, team.id, index + 1));
  });
  return team;
}

const repeat = (t: PlayerTemplate, n: number) => Array(n).fill(t);

describe("rosterLegality", () => {
  it("accepts a legal squad", () => {
    const team = teamWith([
      ...repeat(lineman, 3),
      ...repeat(blitzer, 2),
      ...repeat(lineman, 2),
    ]);
    expect(validateRosterLegality(team, humanRoster)).toEqual([]);
  });

  it("rejects fewer than 7 players", () => {
    const team = teamWith(repeat(lineman, 6));
    expect(
      validateRosterLegality(team, humanRoster).some(
        (v) => v.rule === "roster-size"
      )
    ).toBe(true);
  });

  it("rejects a fifth non-Lineman", () => {
    const limited = { ...blitzer, maxAllowed: 8 };
    const roster = {
      ...humanRoster,
      playerTemplates: [limited, lineman],
    };
    const team = teamWith([...repeat(limited, 5), ...repeat(lineman, 2)]);
    const violations = validateRosterLegality(team, roster);
    expect(violations.some((v) => v.rule === "lineman-limit")).toBe(true);
  });

  it("rejects a position above its roster maximum", () => {
    const roster = {
      ...humanRoster,
      playerTemplates: [{ ...blitzer, maxAllowed: 1 }, lineman],
    };
    const team = teamWith([...repeat(blitzer, 2), ...repeat(lineman, 5)]);
    const violations = validateRosterLegality(team, roster);
    expect(violations.some((v) => v.rule === "positional-limit")).toBe(true);
  });

  it("rejects a negative treasury", () => {
    const team = teamWith(repeat(lineman, 7));
    team.treasury = -1;
    expect(
      validateRosterLegality(team, humanRoster).some(
        (v) => v.rule === "budget"
      )
    ).toBe(true);
  });

  it("rejects positions not on the roster", () => {
    const team = teamWith([
      ...repeat(lineman, 6),
      { ...lineman, positionName: "Made Up Position" },
    ]);
    expect(
      validateRosterLegality(team, humanRoster).some(
        (v) => v.rule === "unknown-position"
      )
    ).toBe(true);
  });
});
