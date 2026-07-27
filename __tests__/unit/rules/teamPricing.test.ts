import { describe, expect, it } from "vitest";
import { RosterName, createTeam } from "../../../src/types/Team";
import {
  DEDICATED_FAN_COST,
  priceOf,
} from "../../../src/game/rules/teamPricing";
import { stampFirstCompletedMatch } from "../../../src/game/rules/teamLifecycle";

function draftTeam(rerollCost = 50000) {
  return createTeam(
    "Test",
    RosterName.HUMAN,
    { primary: 0, secondary: 0 },
    rerollCost
  );
}

describe("priceOf", () => {
  it("draft re-rolls cost roster price", () => {
    const team = draftTeam(60000);
    expect(priceOf(team, { type: "reroll" }).amount).toBe(60000);
  });

  it("active re-rolls cost exactly double roster price — the displayed price equals the charge", () => {
    const team = draftTeam(60000);
    stampFirstCompletedMatch(team, 1);
    const price = priceOf(team, { type: "reroll" });
    expect(price.amount).toBe(120000);
  });

  it("draft Dedicated Fans are purchasable at a fixed cost", () => {
    const team = draftTeam();
    expect(priceOf(team, { type: "dedicated-fan" })).toEqual({
      amount: DEDICATED_FAN_COST,
    });
  });

  it("active Dedicated Fans are refused, not merely priced", () => {
    const team = draftTeam();
    stampFirstCompletedMatch(team, 1);
    const price = priceOf(team, { type: "dedicated-fan" });
    expect(price.amount).toBeNull();
    expect(price.reason).toMatch(/Dedicated Fans/);
  });

  it("an eligible player is roster price in both draft and active mode", () => {
    const draft = draftTeam();
    const active = draftTeam();
    stampFirstCompletedMatch(active, 1);
    expect(priceOf(draft, { type: "player", cost: 70000 }).amount).toBe(70000);
    expect(priceOf(active, { type: "player", cost: 70000 }).amount).toBe(
      70000
    );
  });
});
