import { describe, it, expect } from "vitest";
import { RosterName } from "../../src/types/Team";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import {
  createLineupTeam,
  createReadyMadeTeam,
} from "../../src/simulation/lineups";
import {
  isLinemanPosition,
  validateRosterLegality,
} from "../../src/game/rules/rosterLegality";
import { validateInsignificant } from "../../src/game/rules/insignificant";

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

describe("ready-made teams", () => {
  it.each(Object.values(RosterName))(
    "%s buys team re-rolls and a legal line-up",
    (roster) => {
      const team = createReadyMadeTeam(roster, "Ready", 0);

      expect(
        validateRosterLegality(team, getRosterByRosterName(roster))
      ).toEqual([]);
      expect(validateInsignificant(team.players)).toBeNull();
      expect(team.rerolls).toBeGreaterThanOrEqual(1);
      expect(team.treasury).toBeGreaterThanOrEqual(0);
      expect(team.players.length).toBeGreaterThanOrEqual(7);
    }
  );
});
