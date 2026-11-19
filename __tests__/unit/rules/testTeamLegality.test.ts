import { describe, it, expect } from "vitest";
import { TeamFactory } from "../../../src/game/TeamFactory";
import {
  getAvailableRosterNames,
  getRosterByRosterName,
} from "../../../src/data/RosterTemplates";
import { validateRosterLegality } from "../../../src/game/rules/rosterLegality";
import { validateInsignificant } from "../../../src/game/rules/insignificant";
import { RosterName } from "../../../src/types/Team";

describe("generated test teams", () => {
  it.each(getAvailableRosterNames())("%s is a legal draft list", (name) => {
    const team = TeamFactory.createTestTeam(name, "Test", 0);

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
