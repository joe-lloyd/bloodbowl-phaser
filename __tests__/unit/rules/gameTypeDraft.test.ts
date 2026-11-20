import { describe, expect, it } from "vitest";
import {
  RosterName,
  type Team,
  type TeamAdvancementMode,
  calculateTeamValue,
  createTeam,
} from "../../../src/types/Team";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import {
  hirePlayer,
  priceOf,
  purchase,
} from "../../../src/game/rules/teamPricing";
import {
  legalGameTypes,
  validateRosterLegality,
} from "../../../src/game/rules/rosterLegality";
import {
  chooseFirstLinemanAsVeteran,
  chooseVeteran,
} from "../../../src/game/rules/veteran";
import type { GameType } from "../../../src/game/variants/gameTypes";
import { withDraftGameType } from "../../../src/game/rules/gameTypeChange";

const amazon = getRosterByRosterName(RosterName.AMAZON);

function template(positionName: string) {
  const found = amazon.playerTemplates.find(
    (candidate) => candidate.positionName === positionName
  );
  if (!found) throw new Error(`${positionName} is not an Amazon position.`);
  return found;
}

function draftTeam(
  gameType: GameType,
  budget: number,
  advancementMode?: TeamAdvancementMode
): Team {
  const team = createTeam(
    "Test",
    RosterName.AMAZON,
    { primary: 0, secondary: 0 },
    amazon.rerollCost,
    budget,
    advancementMode
  );
  if (gameType !== "sevens") team.gameType = gameType;
  return team;
}

function hire(team: Team, positions: Record<string, number>): void {
  for (const [positionName, count] of Object.entries(positions)) {
    for (let i = 0; i < count; i++) {
      const hired = hirePlayer(team, template(positionName));
      if (hired.amount == null) throw new Error(hired.reason);
    }
  }
}

describe("team re-roll prices per game type", () => {
  it.each([
    ["sevens", 100_000],
    ["street-bowl", 120_000],
    ["beach-bowl", 120_000],
    ["gutter-bowl", 100_000],
  ] as const)(
    "%s charges %d for an Amazon re-roll (SB-D2, BB-D2, GB-D2)",
    (gameType, price) => {
      const team = draftTeam(gameType, 600_000);
      expect(purchase(team, { type: "reroll" })).toEqual({ amount: price });
      expect(team.treasury).toBe(600_000 - price);
      expect(calculateTeamValue(team)).toBe(price);
    }
  );
});

describe("sideline staff per game type", () => {
  it("Street Bowl refuses every Sideline Staff and doubles Dedicated Fans (SB-D3)", () => {
    const team = draftTeam("street-bowl", 600_000);
    expect(priceOf(team, { type: "apothecary" })).toEqual({
      amount: null,
      reason: "Street Bowl teams cannot have an Apothecary.",
    });
    expect(priceOf(team, { type: "coach" })).toEqual({
      amount: null,
      reason: "Street Bowl teams cannot have Assistant Coaches.",
    });
    expect(priceOf(team, { type: "cheerleader" })).toEqual({
      amount: null,
      reason: "Street Bowl teams cannot have Cheerleaders.",
    });
    expect(purchase(team, { type: "dedicated-fan" })).toEqual({
      amount: 40_000,
    });
  });

  it("Beach Bowl allows coaches and cheerleaders but no Apothecary (BB-D3)", () => {
    const team = draftTeam("beach-bowl", 600_000);
    expect(purchase(team, { type: "coach" })).toEqual({ amount: 20_000 });
    expect(purchase(team, { type: "cheerleader" })).toEqual({
      amount: 20_000,
    });
    expect(priceOf(team, { type: "apothecary" }).reason).toBe(
      "Beach Bowl teams cannot have an Apothecary."
    );
  });

  it("Beach Bowl sells Dedicated Fans only to league teams (BB-D3)", () => {
    expect(
      priceOf(draftTeam("beach-bowl", 600_000, "matched-play"), {
        type: "dedicated-fan",
      })
    ).toEqual({
      amount: null,
      reason: "Beach Bowl teams buy Dedicated Fans only in a league.",
    });
    expect(
      priceOf(draftTeam("beach-bowl", 600_000, "advanced-league"), {
        type: "dedicated-fan",
      })
    ).toEqual({ amount: 20_000 });
  });

  it("Gutter Bowl has no Sideline Staff (GB-D3)", () => {
    const team = draftTeam("gutter-bowl", 750_000);
    expect(priceOf(team, { type: "apothecary" }).amount).toBeNull();
    expect(priceOf(team, { type: "coach" }).amount).toBeNull();
    expect(priceOf(team, { type: "cheerleader" }).amount).toBeNull();
  });

  it("flags staff a game type does not allow when checking legality", () => {
    const team = draftTeam("sevens", 600_000);
    hire(team, { "Eagle Warrior": 7 });
    chooseFirstLinemanAsVeteran(team);
    purchase(team, { type: "apothecary" });
    expect(
      validateRosterLegality(team, amazon, "beach-bowl").map((v) => v.detail)
    ).toEqual(["Beach Bowl teams cannot have an Apothecary."]);
  });
});

describe("the Veteran per game type", () => {
  it.each(["street-bowl", "beach-bowl", "gutter-bowl"] as const)(
    "%s refuses a Veteran (SB-D4, BB-D4, GB-D4)",
    (gameType) => {
      const team = draftTeam(gameType, 750_000);
      hire(team, { "Eagle Warrior": 7 });
      const first = team.players[0];
      if (!first) throw new Error("No player hired.");
      expect(chooseVeteran(team, first.id).allowed).toBe(false);
      chooseFirstLinemanAsVeteran(team);
      expect(team.players.filter((player) => player.veteran)).toEqual([]);
      expect(validateRosterLegality(team, amazon)).toEqual([]);
    }
  );

  it("Sevens still requires one", () => {
    const team = draftTeam("sevens", 600_000);
    hire(team, { "Eagle Warrior": 7 });
    expect(validateRosterLegality(team, amazon).map((v) => v.rule)).toEqual([
      "veteran",
    ]);
  });
});

describe("legalGameTypes", () => {
  it("lets a Street Bowl draft play Beach Bowl and Gutter Bowl but not Sevens", () => {
    const team = draftTeam("street-bowl", 600_000);
    hire(team, {
      "Python Warrior": 2,
      "Piranha Warrior": 1,
      "Eagle Warrior": 4,
    });
    purchase(team, { type: "reroll" });
    expect(team.treasury).toBe(30_000);
    expect(legalGameTypes(team, amazon)).toEqual([
      "gutter-bowl",
      "street-bowl",
      "beach-bowl",
    ]);
  });

  it("keeps a fifth positional player to Gutter Bowl (GB-D1)", () => {
    const team = draftTeam("gutter-bowl", 750_000);
    hire(team, {
      "Python Warrior": 2,
      "Piranha Warrior": 2,
      "Jaguar Warrior": 1,
      "Eagle Warrior": 2,
    });
    expect(legalGameTypes(team, amazon)).toEqual(["gutter-bowl"]);
    expect(
      validateRosterLegality(team, amazon, "street-bowl").map((v) => v.rule)
    ).toEqual(["lineman-limit"]);
  });

  it("prices a draft at the other game type's re-roll cost", () => {
    const team = draftTeam("gutter-bowl", 750_000);
    hire(team, {
      "Python Warrior": 2,
      "Piranha Warrior": 2,
      "Eagle Warrior": 3,
    });
    purchase(team, { type: "reroll" });
    expect(legalGameTypes(team, amazon)).toEqual(["gutter-bowl"]);
    expect(
      validateRosterLegality(team, amazon, "street-bowl").map((v) => v.detail)
    ).toEqual([
      "the draft costs 610,000 at Street Bowl prices (budget 600,000)",
    ]);
  });

  it("lets a Sevens team bring its Veteran to the other game types", () => {
    const team = draftTeam("sevens", 600_000);
    hire(team, { "Eagle Warrior": 7 });
    chooseFirstLinemanAsVeteran(team);
    expect(legalGameTypes(team, amazon)).toEqual([
      "sevens",
      "gutter-bowl",
      "street-bowl",
      "beach-bowl",
    ]);
  });
});

describe("changing a draft's game type", () => {
  it("moves a Sevens draft to Street Bowl prices and staff", () => {
    const team = draftTeam("sevens", 600_000);
    hire(team, { "Eagle Warrior": 7 });
    chooseFirstLinemanAsVeteran(team);
    purchase(team, { type: "reroll" });
    purchase(team, { type: "apothecary" });
    purchase(team, { type: "coach" });
    expect(team.treasury).toBe(50_000);

    const street = withDraftGameType(team, "street-bowl");

    expect(street.gameType).toBe("street-bowl");
    expect(street.rerolls).toBe(1);
    expect(street.apothecary).toBe(false);
    expect(street.coaches).toBe(0);
    expect(street.treasury).toBe(130_000);
    expect(street.players.filter((player) => player.veteran)).toEqual([]);
    expect(team.gameType).toBeUndefined();
  });

  it("raises the budget to 750,000 for Gutter Bowl and back", () => {
    const team = draftTeam("sevens", 600_000);
    hire(team, { "Eagle Warrior": 7 });
    const gutter = withDraftGameType(team, "gutter-bowl");
    expect(gutter.startingTreasury).toBe(750_000);
    expect(gutter.treasury).toBe(400_000);
    const sevens = withDraftGameType(gutter, "sevens");
    expect(sevens.gameType).toBeUndefined();
    expect(sevens.treasury).toBe(250_000);
    expect(sevens.players.filter((player) => player.veteran)).toHaveLength(1);
  });
});
