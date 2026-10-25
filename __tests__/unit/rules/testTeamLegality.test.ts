import { describe, it, expect } from "vitest";
import { TeamFactory } from "../../../src/game/TeamFactory";
import {
  getAvailableRosterNames,
  getRosterByRosterName,
} from "../../../src/data/RosterTemplates";
import { validateRosterLegality } from "../../../src/game/rules/rosterLegality";
import { validateInsignificant } from "../../../src/game/rules/insignificant";
import { RosterName } from "../../../src/types/Team";

/**
 * Every generated test team must be a legal Sevens draft list, so the
 * sandbox, headless scenarios and simulations play the game the book
 * describes. Insignificant, p.129: "When creating a Team Draft List, you
 * may not include more players with this Trait than players without this
 * Trait." Snotling Linemen are Insignificant, so seven of them was illegal.
 */
describe("generated test teams", () => {
  it.each(getAvailableRosterNames())("%s is a legal draft list", (name) => {
    const team = TeamFactory.createTestTeam(name, "Test", 0);

    // Scenario teams carry no Veteran (D8) on purpose: scenarios address
    // players by index and rely on the printed stat lines, and the
    // Veteran's MA -1 would change them. Every other rule applies.
    expect(
      validateRosterLegality(team, getRosterByRosterName(name))
        .filter((v) => v.rule !== "veteran")
        .map((v) => `${v.rule}: ${v.detail}`)
    ).toEqual([]);
    expect(validateInsignificant(team.players)).toBeNull();
  });

  it("fields Snotlings with three Insignificant Linemen and four others", () => {
    const team = TeamFactory.createTestTeam(RosterName.SNOTLING, "Test", 0);

    expect(team.players.map((p) => p.positionName)).toEqual([
      "Pump Wagon",
      "Trained Troll",
      "Stilty Runna",
      "Stilty Runna",
      "Snotling Lineman",
      "Snotling Lineman",
      "Snotling Lineman",
    ]);
  });
});
