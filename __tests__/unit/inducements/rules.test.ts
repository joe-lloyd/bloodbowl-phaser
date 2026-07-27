import { describe, expect, it } from "vitest";
import {
  buildSeventsInducementProfile,
  Inducement,
} from "../../../src/types/Inducements";
import {
  calculateInducementBudgets,
  expireDriveInducements,
  toInventoryEntries,
  validateInducementSelection,
} from "../../../src/game/inducements/rules";
import { TeamFactory } from "../../../src/game/TeamFactory";
import { RosterName } from "../../../src/types/Team";

/**
 * Sevens inducement budgeting, catalog limits, and Star Player exclusion —
 * the authoritative rules tasks.md 5.1 asks unit tests for. Pure functions,
 * no engine dependency.
 */

describe("calculateInducementBudgets", () => {
  it("gives the lower-TV team petty cash equal to the gap", () => {
    const cheap = TeamFactory.createTestTeam(
      RosterName.HUMAN,
      "Cheap",
      0xff0000
    );
    const rich = TeamFactory.createTestTeam(RosterName.HUMAN, "Rich", 0x0000ff);
    rich.rerolls = 4; // inflate TV above `cheap`

    const budgets = calculateInducementBudgets(cheap, rich);
    expect(budgets[rich.id]).toBe(0);
    expect(budgets[cheap.id]).toBeGreaterThan(0);
    expect(budgets[cheap.id]).toBe(
      rich.rerolls * rich.rerollCost - cheap.rerolls * cheap.rerollCost
    );
  });

  it("gives neither team a budget at equal team value", () => {
    const a = TeamFactory.createTestTeam(RosterName.HUMAN, "A", 0xff0000);
    const b = TeamFactory.createTestTeam(RosterName.HUMAN, "B", 0x0000ff);
    const budgets = calculateInducementBudgets(a, b);
    expect(budgets[a.id]).toBe(0);
    expect(budgets[b.id]).toBe(0);
  });
});

describe("Sevens Extra Team Training", () => {
  const profile = buildSeventsInducementProfile({ advancedLeague: false });

  it("prices at 150,000 gold", () => {
    expect(profile.extraTeamTraining.price).toBe(150_000);
    const entry = profile.catalog.find(
      (e) => e.inducement === Inducement.EXTRA_TEAM_TRAINING
    );
    expect(entry?.price).toBe(150_000);
  });

  it("eight is legal at exactly 1,200,000 gold", () => {
    const result = validateInducementSelection(profile, 1_200_000, [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 8 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.totalCost).toBe(1_200_000);
  });

  it("nine is rejected for exceeding the Sevens limit even with budget", () => {
    const result = validateInducementSelection(profile, 10_000_000, [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 9 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("quantity-exceeds-limit");
  });

  it("rejects a selection whose cost exceeds the budget", () => {
    const result = validateInducementSelection(profile, 1_000_000, [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 7 }, // 1,050,000
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("budget-exceeded");
  });
});

describe("Star Players in Sevens", () => {
  const profile = buildSeventsInducementProfile({ advancedLeague: false });

  it("the catalog never offers a Star Player", () => {
    expect(
      profile.catalog.some((e) => e.inducement === Inducement.STAR_PLAYER)
    ).toBe(false);
  });

  it("a forged Star Player purchase is rejected regardless of budget", () => {
    const result = validateInducementSelection(profile, 10_000_000, [
      { inducement: Inducement.STAR_PLAYER, quantity: 1 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("star-players-unavailable-in-sevens");
  });
});

describe("Prayers to Nuffle restriction by advancement mode", () => {
  it("restricts 10-13 outside Advanced League", () => {
    const profile = buildSeventsInducementProfile({ advancedLeague: false });
    expect(profile.prayersRerollResults.sort()).toEqual([10, 11, 12, 13]);
  });

  it("keeps 10-13 legal in Advanced League by default", () => {
    const profile = buildSeventsInducementProfile({ advancedLeague: true });
    expect(profile.prayersRerollResults).toEqual([]);
  });

  it("a competition profile may still restrict 10-13 in Advanced League", () => {
    const profile = buildSeventsInducementProfile({
      advancedLeague: true,
      restrictPrayersInAdvancedLeague: true,
    });
    expect(profile.prayersRerollResults.sort()).toEqual([10, 11, 12, 13]);
  });
});

describe("toInventoryEntries / expireDriveInducements", () => {
  const profile = buildSeventsInducementProfile({ advancedLeague: false });

  it("shapes a validated selection into match-scoped inventory", () => {
    const entries = toInventoryEntries(profile, "team-a", [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 2 },
    ]);
    expect(entries).toEqual([
      {
        inducement: Inducement.EXTRA_TEAM_TRAINING,
        ownerTeamId: "team-a",
        quantity: 2,
        remainingUses: 2,
        price: 300_000,
        provenance: "purchased",
        duration: "match",
      },
    ]);
  });

  it("refills drive-scoped uses but leaves match-scoped uses alone", () => {
    const inventory = [
      {
        inducement: Inducement.WANDERING_APOTHECARY,
        ownerTeamId: "team-a",
        quantity: 1,
        remainingUses: 0,
        price: 50_000,
        provenance: "purchased" as const,
        duration: "match" as const,
      },
      {
        inducement: Inducement.EXTRA_TEAM_TRAINING,
        ownerTeamId: "team-a",
        quantity: 3,
        remainingUses: 0,
        price: 450_000,
        provenance: "purchased" as const,
        duration: "drive" as const,
      },
    ];
    const refreshed = expireDriveInducements(inventory);
    expect(refreshed[0].remainingUses).toBe(0); // match-scoped: untouched
    expect(refreshed[1].remainingUses).toBe(3); // drive-scoped: refilled
  });
});
