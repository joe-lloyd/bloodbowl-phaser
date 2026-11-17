import { describe, expect, it } from "vitest";
import { RosterName, createTeam } from "../../../src/types/Team";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import {
  hirePlayer,
  hireRefusal,
  positionAllowance,
} from "../../../src/game/rules/teamPricing";
import { stampFirstCompletedMatch } from "../../../src/game/rules/teamLifecycle";

/**
 * The Team Builder's Allowed column. Orc roster, 2025 rulebook: 0-16 Orc
 * Linemen, 0-4 Goblin Linemen, 0-2 Blitzers. Sevens caps a team at 11
 * players and 4 without the Lineman keyword.
 */
const orcs = getRosterByRosterName(RosterName.ORC);
const template = (position: string) =>
  orcs.playerTemplates.find((t) => t.positionName === position)!;

function activeOrcs() {
  const team = createTeam(
    "Orcs",
    RosterName.ORC,
    { primary: 0, secondary: 0 },
    0,
    2_000_000,
    "advanced-league"
  );
  stampFirstCompletedMatch(team, 1);
  return team;
}

describe("positionAllowance", () => {
  it("counts hired Goblins against the roster's 0-4", () => {
    const team = activeOrcs();
    for (let i = 0; i < 4; i++) hirePlayer(team, template("Goblin Lineman"));

    expect(positionAllowance(team, template("Goblin Lineman"))).toEqual({
      hired: 4,
      max: 4,
    });
    expect(hireRefusal(team, template("Goblin Lineman"))).toBe(
      "Goblin Lineman: the Orc roster allows 0-4, and this team has 4."
    );
  });

  it("caps 0-16 Orc Linemen at the Sevens roster limit of 11", () => {
    expect(positionAllowance(activeOrcs(), template("Orc Lineman"))).toEqual({
      hired: 0,
      max: 11,
    });
  });

  it("keeps a positional's own QTY", () => {
    const team = activeOrcs();
    hirePlayer(team, template("Orc Blitzer"));

    expect(positionAllowance(team, template("Orc Blitzer"))).toEqual({
      hired: 1,
      max: 2,
    });
  });
});
