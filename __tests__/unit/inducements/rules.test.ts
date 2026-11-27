import { describe, expect, it } from "vitest";
import { Inducement } from "../../../src/types/Inducements";
import {
  calculateInducementBudgets,
  toInventoryEntries,
  validateInducementSelection,
} from "../../../src/game/inducements/rules";
import { sevensInducementCatalog } from "../../../src/game/inducements/catalog";
import { TeamFactory } from "../../../src/game/TeamFactory";
import { RosterName, type Team } from "../../../src/types/Team";
import { InjuryType } from "../../../src/types/Player";
import { SetupManager } from "../../../src/game/managers/SetupManager";

function leagueTeams(): { missing: Team; full: Team; value: number } {
  const missing = TeamFactory.createTestTeam(RosterName.HUMAN, "M", 0xff0000);
  const full = TeamFactory.createTestTeam(RosterName.HUMAN, "F", 0x0000ff);
  for (const team of [missing, full]) team.advancementMode = "advanced-league";
  const [absentee] = missing.players;
  if (!absentee) throw new Error("the test team has no players");
  absentee.injuries = [InjuryType.MISS_NEXT_GAME];
  return { missing, full, value: absentee.cost };
}

describe("calculateInducementBudgets", () => {
  it("gives the lower-TV team petty cash equal to the gap", () => {
    const cheap = TeamFactory.createTestTeam(
      RosterName.HUMAN,
      "Cheap",
      0xff0000
    );
    const rich = TeamFactory.createTestTeam(RosterName.HUMAN, "Rich", 0x0000ff);
    rich.rerolls = cheap.rerolls + 4;

    const budgets = calculateInducementBudgets(cheap, rich);
    expect(budgets[rich.id]).toBe(0);
    expect(budgets[cheap.id]).toBe(400_000);
  });

  it("gives neither team a budget at equal team value", () => {
    const a = TeamFactory.createTestTeam(RosterName.HUMAN, "A", 0xff0000);
    const b = TeamFactory.createTestTeam(RosterName.HUMAN, "B", 0x0000ff);
    const budgets = calculateInducementBudgets(a, b);
    expect(budgets[a.id]).toBe(0);
    expect(budgets[b.id]).toBe(0);
  });

  it("gives a Matched Play team no petty cash (MP2)", () => {
    const cheap = TeamFactory.createTestTeam(RosterName.HUMAN, "C", 0xff0000);
    cheap.advancementMode = "matched-play";
    const rich = TeamFactory.createTestTeam(RosterName.HUMAN, "R", 0x0000ff);
    rich.advancementMode = "matched-play";
    rich.rerolls = cheap.rerolls + 4;

    const budgets = calculateInducementBudgets(cheap, rich);
    expect(budgets).toEqual({ [cheap.id]: 0, [rich.id]: 0 });
  });

  describe("with a league player due to miss the next game", () => {
    it("prices a friendly with that player, who takes the pitch", () => {
      const { missing, full } = leagueTeams();
      SetupManager.sanitizeTeam(missing, { competition: false });
      SetupManager.sanitizeTeam(full, { competition: false });

      const budgets = calculateInducementBudgets(missing, full);
      expect(budgets).toEqual({ [missing.id]: 0, [full.id]: 0 });
    });

    it("prices a competition game without that player, who sits out", () => {
      const { missing, full, value } = leagueTeams();
      SetupManager.sanitizeTeam(missing, { competition: true });
      SetupManager.sanitizeTeam(full, { competition: true });

      const budgets = calculateInducementBudgets(missing, full);
      expect(budgets).toEqual({ [missing.id]: value, [full.id]: 0 });
    });
  });
});

function catalogFor(rosterName: RosterName) {
  return sevensInducementCatalog({ rosterName });
}

function table(rosterName: RosterName) {
  return catalogFor(rosterName).map(
    (e) => `${String(e.maxCount)} ${e.inducement} ${String(e.price)}`
  );
}

describe("the Sevens inducement catalogue (L3)", () => {
  it("offers a Human team exactly the Sevens list", () => {
    expect(table(RosterName.HUMAN)).toEqual([
      "2 Temp Agency Cheerleader 15000",
      "2 Part-time Assistant Coach 15000",
      "2 Blitzer's Best Kegs 50000",
      "2 Prayers to Nuffle 5000",
      "6 Extra Team Training 125000",
      "2 Bribe 100000",
      "1 Wandering Apothecary 100000",
      "1 Halfling Master Chef 300000",
      "5 Desperate Measures 50000",
    ]);
  });

  it("halves Bribes for Bribery and Corruption teams", () => {
    const bribe = catalogFor(RosterName.GOBLIN).find(
      (e) => e.inducement === Inducement.BRIBE
    );
    expect(bribe).toEqual({
      inducement: Inducement.BRIBE,
      maxCount: 2,
      price: 50_000,
    });
  });

  it("sells the Halfling Master Chef to Halfling teams at 100,000", () => {
    const chef = catalogFor(RosterName.HALFLING).find(
      (e) => e.inducement === Inducement.HALFLING_MASTER_CHEF
    );
    expect(chef?.price).toBe(100_000);
  });

  it("offers a Mortuary Assistant, not a Wandering Apothecary, to Masters of Undeath", () => {
    const names = catalogFor(RosterName.SHAMBLING_UNDEAD).map(
      (e) => e.inducement
    );
    expect(names).toContain(Inducement.MORTUARY_ASSISTANT);
    expect(names).not.toContain(Inducement.WANDERING_APOTHECARY);
    expect(names).not.toContain(Inducement.PLAGUE_DOCTOR);
  });

  it("offers a Plague Doctor to Favoured of Nurgle teams only", () => {
    expect(catalogFor(RosterName.NURGLE).map((e) => e.inducement)).toContain(
      Inducement.PLAGUE_DOCTOR
    );
    expect(catalogFor(RosterName.HUMAN).map((e) => e.inducement)).not.toContain(
      Inducement.PLAGUE_DOCTOR
    );
  });

  it("never offers a Star Player or Riotous Rookies", () => {
    const names = catalogFor(RosterName.SNOTLING).map((e) => e.inducement);
    expect(names).not.toContain(Inducement.STAR_PLAYER);
    expect(names).not.toContain(Inducement.RIOTOUS_ROOKIES);
  });
});

describe("validateInducementSelection", () => {
  const catalog = catalogFor(RosterName.HUMAN);

  it("six Extra Team Training is legal at exactly 750,000 gold", () => {
    const result = validateInducementSelection(catalog, 750_000, [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 6 },
    ]);
    expect(result).toEqual({ valid: true, errors: [], totalCost: 750_000 });
  });

  it("rejects a seventh Extra Team Training even with budget", () => {
    const result = validateInducementSelection(catalog, 10_000_000, [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 7 },
    ]);
    expect(result.errors).toEqual([
      "quantity-exceeds-limit:Extra Team Training:7>6",
    ]);
  });

  it("rejects a selection whose cost exceeds the budget", () => {
    const result = validateInducementSelection(catalog, 100_000, [
      { inducement: Inducement.BRIBE, quantity: 1 },
      { inducement: Inducement.PRAYERS_TO_NUFFLE, quantity: 1 },
    ]);
    expect(result.errors).toEqual(["budget-exceeded:105000>100000"]);
  });

  it("rejects a forged Star Player regardless of budget", () => {
    const result = validateInducementSelection(catalog, 10_000_000, [
      { inducement: Inducement.STAR_PLAYER, quantity: 1 },
    ]);
    expect(result.errors).toEqual(["star-players-unavailable-in-sevens"]);
  });

  it("rejects an inducement outside the team's catalogue", () => {
    const result = validateInducementSelection(catalog, 10_000_000, [
      { inducement: Inducement.MORTUARY_ASSISTANT, quantity: 1 },
    ]);
    expect(result.errors).toEqual([
      "inducement-not-offered:Mortuary Assistant",
    ]);
  });
});

describe("toInventoryEntries", () => {
  it("shapes a validated selection into match-scoped inventory", () => {
    const entries = toInventoryEntries(catalogFor(RosterName.HUMAN), "team-a", [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 2 },
    ]);
    expect(entries).toEqual([
      {
        inducement: Inducement.EXTRA_TEAM_TRAINING,
        ownerTeamId: "team-a",
        quantity: 2,
        remainingUses: 2,
        price: 250_000,
        provenance: "purchased",
      },
    ]);
  });
});
