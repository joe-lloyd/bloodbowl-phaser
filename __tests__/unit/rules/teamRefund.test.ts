import { describe, expect, it } from "vitest";
import { RosterName, createTeam } from "../../../src/types/Team";
import { purchase, refund } from "../../../src/game/rules/teamPricing";
import { stampFirstCompletedMatch } from "../../../src/game/rules/teamLifecycle";
import { Inducement } from "../../../src/types/Inducements";

function draftTeam(
  mode: "advanced-league" | "matched-play" = "advanced-league"
) {
  return createTeam(
    "Test",
    RosterName.HUMAN,
    { primary: 0, secondary: 0 },
    60_000,
    2_000_000,
    mode
  );
}

describe("refunding draft purchases", () => {
  it("gives back a re-roll at the price paid", () => {
    const team = draftTeam();
    purchase(team, { type: "reroll" });
    purchase(team, { type: "reroll" });
    expect(refund(team, { type: "reroll" })).toEqual({ amount: 100_000 });
    expect(team.rerolls).toBe(1);
    expect(team.treasury).toBe(1_900_000);
  });

  it("gives back cheerleaders, coaches and the apothecary", () => {
    const team = draftTeam();
    purchase(team, { type: "cheerleader" });
    purchase(team, { type: "coach" });
    purchase(team, { type: "apothecary" });
    refund(team, { type: "cheerleader" });
    refund(team, { type: "coach" });
    refund(team, { type: "apothecary" });
    expect([team.cheerleaders, team.coaches, team.apothecary]).toEqual([
      0,
      0,
      false,
    ]);
    expect(team.treasury).toBe(2_000_000);
  });

  it("refuses when nothing was bought, keeping the free Dedicated Fan", () => {
    const team = draftTeam();
    expect(team.dedicatedFans).toBe(1);
    expect(refund(team, { type: "dedicated-fan" }).amount).toBeNull();
    expect(refund(team, { type: "cheerleader" }).amount).toBeNull();
    expect(team.dedicatedFans).toBe(1);
    expect(team.treasury).toBe(2_000_000);
  });

  it("removes a draft-list inducement and drops the empty line", () => {
    const team = draftTeam("matched-play");
    purchase(team, { type: "inducement", inducement: Inducement.BRIBE });
    refund(team, { type: "inducement", inducement: Inducement.BRIBE });
    expect(team.draftInducements).toEqual([]);
    expect(team.treasury).toBe(2_000_000);
  });

  it("refuses once the team has played its first match", () => {
    const team = draftTeam();
    purchase(team, { type: "cheerleader" });
    stampFirstCompletedMatch(team, 1);
    expect(refund(team, { type: "cheerleader" }).amount).toBeNull();
    expect(team.cheerleaders).toBe(1);
  });
});
