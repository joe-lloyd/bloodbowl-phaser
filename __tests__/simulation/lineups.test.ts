import { describe, it, expect } from "vitest";
import { RosterName } from "../../src/types/Team";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { createLineupTeam } from "../../src/simulation/lineups";
import {
  isLinemanPosition,
  validateRosterLegality,
} from "../../src/game/rules/rosterLegality";
import { validateInsignificant } from "../../src/game/rules/insignificant";

/**
 * Simulated matches field these line-ups, so each must be a team a coach
 * could legally draft, and should show off the roster's positionals.
 */
describe("simulation line-ups", () => {
  it.each(Object.values(RosterName))("%s is a legal Sevens draft", (roster) => {
    const team = createLineupTeam(roster, "Lineup", 0);

    expect(validateRosterLegality(team, getRosterByRosterName(roster))).toEqual(
      []
    );
    expect(validateInsignificant(team.players)).toBeNull();
    expect(team.players.length).toBeGreaterThanOrEqual(7);
    expect(team.players.some((p) => !isLinemanPosition(p.keywords))).toBe(true);
  });
});
