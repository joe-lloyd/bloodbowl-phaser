import { describe, expect, it } from "vitest";
import {
  RosterName,
  TeamAdvancementMode,
  calculateTeamValue,
  createTeam,
  setAdvancementMode,
} from "../../../src/types/Team";
import { priceOf, purchase } from "../../../src/game/rules/teamPricing";
import { stampFirstCompletedMatch } from "../../../src/game/rules/teamLifecycle";
import { Inducement } from "../../../src/types/Inducements";

function draftTeam(
  rosterName: RosterName = RosterName.HUMAN,
  advancementMode?: TeamAdvancementMode
) {
  return createTeam(
    "Test",
    rosterName,
    { primary: 0, secondary: 0 },
    60000,
    2_000_000,
    advancementMode
  );
}

function activeTeam(rosterName: RosterName = RosterName.HUMAN) {
  const team = draftTeam(rosterName, "advanced-league");
  stampFirstCompletedMatch(team, 1);
  return team;
}

describe("team re-rolls (D4)", () => {
  it("cost 100,000 at the draft whatever the roster", () => {
    const team = draftTeam();
    expect(priceOf(team, { type: "reroll" })).toEqual({ amount: 100000 });
    expect(purchase(team, { type: "reroll" })).toEqual({ amount: 100000 });
    expect(team.rerolls).toBe(1);
    expect(team.treasury).toBe(1_900_000);
  });

  it("cost 100,000 for an active league team", () => {
    const team = activeTeam();
    expect(purchase(team, { type: "reroll" })).toEqual({ amount: 100000 });
    expect(team.rerolls).toBe(1);
    expect(team.treasury).toBe(1_900_000);
  });

  it("stop at 6, the top of the re-roll tracker", () => {
    const team = draftTeam();
    for (let i = 0; i < 6; i++) purchase(team, { type: "reroll" });
    const seventh = purchase(team, { type: "reroll" });
    expect(seventh.amount).toBeNull();
    expect(seventh.reason).toMatch(/6/);
    expect(team.rerolls).toBe(6);
    expect(team.treasury).toBe(1_400_000);
  });

  it("are refused when the treasury cannot pay", () => {
    const team = draftTeam();
    team.treasury = 99_999;
    const result = purchase(team, { type: "reroll" });
    expect(result.amount).toBeNull();
    expect(team.rerolls).toBe(0);
    expect(team.treasury).toBe(99_999);
  });
});

describe("Assistant Coaches and Cheerleaders (D5)", () => {
  it.each([
    ["coach", "coaches"],
    ["cheerleader", "cheerleaders"],
  ] as const)("%s costs 20,000 and stops at 3", (type, field) => {
    const team = draftTeam();
    for (let i = 0; i < 3; i++) {
      expect(purchase(team, { type })).toEqual({ amount: 20000 });
    }
    expect(purchase(team, { type }).amount).toBeNull();
    expect(team[field]).toBe(3);
    expect(team.treasury).toBe(2_000_000 - 60_000);
  });

  it("can be bought by an active league team", () => {
    const team = activeTeam();
    expect(purchase(team, { type: "coach" })).toEqual({ amount: 20000 });
    expect(purchase(team, { type: "cheerleader" })).toEqual({ amount: 20000 });
    expect(team.coaches).toBe(1);
    expect(team.cheerleaders).toBe(1);
  });
});

describe("Apothecary (D6)", () => {
  it("costs 80,000, at most one", () => {
    const team = draftTeam(RosterName.HUMAN);
    expect(purchase(team, { type: "apothecary" })).toEqual({ amount: 80000 });
    expect(team.apothecary).toBe(true);
    expect(purchase(team, { type: "apothecary" }).amount).toBeNull();
    expect(team.treasury).toBe(1_920_000);
  });

  it("is refused when the roster does not allow one", () => {
    const team = draftTeam(RosterName.SHAMBLING_UNDEAD);
    const result = purchase(team, { type: "apothecary" });
    expect(result.amount).toBeNull();
    expect(result.reason).toMatch(/Apothecary/);
    expect(team.apothecary).toBe(false);
    expect(team.treasury).toBe(2_000_000);
  });
});

describe("Dedicated Fans (D7)", () => {
  it("league teams start with 1", () => {
    expect(draftTeam(RosterName.HUMAN, "advanced-league").dedicatedFans).toBe(1);
    expect(
      draftTeam(RosterName.HUMAN, "sevens-skill-selection").dedicatedFans
    ).toBe(1);
  });

  it("Matched Play teams start with 0", () => {
    expect(draftTeam(RosterName.HUMAN, "matched-play").dedicatedFans).toBe(0);
  });

  it("follow the mode when a draft team changes mode", () => {
    const team = draftTeam();
    expect(team.dedicatedFans).toBe(0);
    setAdvancementMode(team, "sevens-skill-selection");
    expect(team.dedicatedFans).toBe(1);
    setAdvancementMode(team, "advanced-league");
    expect(team.dedicatedFans).toBe(1);
    setAdvancementMode(team, "matched-play");
    expect(team.dedicatedFans).toBe(0);
  });

  it("cost 20,000 each and stop at 5", () => {
    const team = draftTeam(RosterName.HUMAN, "advanced-league");
    for (let i = 0; i < 4; i++) {
      expect(purchase(team, { type: "dedicated-fan" })).toEqual({
        amount: 20000,
      });
    }
    expect(purchase(team, { type: "dedicated-fan" }).amount).toBeNull();
    expect(team.dedicatedFans).toBe(5);
    expect(team.treasury).toBe(2_000_000 - 80_000);
  });

  it("can be bought by an active league team", () => {
    const team = activeTeam();
    expect(purchase(team, { type: "dedicated-fan" })).toEqual({
      amount: 20000,
    });
    expect(team.dedicatedFans).toBe(2);
  });
});

describe("team value", () => {
  it("counts re-rolls and staff at their Sevens prices but not Dedicated Fans", () => {
    const team = draftTeam(RosterName.HUMAN, "advanced-league");
    purchase(team, { type: "reroll" });
    purchase(team, { type: "apothecary" });
    purchase(team, { type: "coach" });
    purchase(team, { type: "cheerleader" });
    purchase(team, { type: "dedicated-fan" });
    expect(calculateTeamValue(team)).toBe(100000 + 80000 + 20000 + 20000);
  });
});

describe("players", () => {
  it("an eligible player is roster price in both draft and active mode", () => {
    expect(priceOf(draftTeam(), { type: "player", cost: 70000 }).amount).toBe(
      70000
    );
    expect(priceOf(activeTeam(), { type: "player", cost: 70000 }).amount).toBe(
      70000
    );
  });
});

describe("Matched Play inducements on the draft list (MP2)", () => {
  const bribe = { type: "inducement", inducement: Inducement.BRIBE } as const;

  it("buys a Bribe from the draft budget onto the draft list", () => {
    const team = draftTeam(RosterName.HUMAN, "matched-play");
    expect(purchase(team, bribe)).toEqual({ amount: 100_000 });
    expect(team.draftInducements).toEqual([
      { inducement: Inducement.BRIBE, quantity: 1 },
    ]);
    expect(team.treasury).toBe(1_900_000);
  });

  it("charges the roster's price and stops at the catalogue limit", () => {
    const team = draftTeam(RosterName.GOBLIN, "matched-play");
    purchase(team, bribe);
    purchase(team, bribe);
    expect(team.treasury).toBe(1_900_000);
    expect(priceOf(team, bribe)).toEqual({
      amount: null,
      reason: "A team may have at most 2 Bribe.",
    });
  });

  it("refuses a league team, which uses petty cash instead", () => {
    const team = draftTeam(RosterName.HUMAN, "advanced-league");
    expect(purchase(team, bribe).amount).toBeNull();
    expect(team.draftInducements).toBeUndefined();
  });

  it("refuses an inducement the roster cannot buy", () => {
    const team = draftTeam(RosterName.HUMAN, "matched-play");
    expect(
      priceOf(team, {
        type: "inducement",
        inducement: Inducement.MORTUARY_ASSISTANT,
      })
    ).toEqual({
      amount: null,
      reason: "Human teams cannot buy Mortuary Assistant.",
    });
  });

  it("does not count toward team value", () => {
    const team = draftTeam(RosterName.HUMAN, "matched-play");
    const before = calculateTeamValue(team);
    purchase(team, bribe);
    expect(calculateTeamValue(team)).toBe(before);
  });
});
