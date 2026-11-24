import { fixtureValue } from "../../src/testing/fixtureValue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RosterName, createTeam } from "../../src/types/Team";
import { createPlayer, type PlayerTemplate } from "../../src/types/Player";
import {
  loadTeams,
  saveTeam,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";
import { chooseVeteran } from "../../src/game/rules/veteran";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import {
  getTeamMode,
  stampFirstCompletedMatch,
} from "../../src/game/rules/teamLifecycle";
import { canEdit } from "../../src/game/rules/teamEditLegality";
import { priceOf } from "../../src/game/rules/teamPricing";
import {
  canAdvance,
  applyAdvancement,
  eligibleSkills,
} from "../../src/game/progression/progression";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

const humanRoster = getRosterByRosterName(RosterName.HUMAN);
const lineman: PlayerTemplate = fixtureValue(
  humanRoster.playerTemplates.find((t) => t.keywords.includes("Lineman"))
);

function newDraftTeam() {
  return createTeam(
    "Reikland Reavers",
    RosterName.HUMAN,
    { primary: 0, secondary: 0 },
    getRosterByRosterName(RosterName.HUMAN).rerollCost
  );
}

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
});

describe("draft repair and legal finalization journey", () => {
  it("saves an incomplete draft, then repairs it into a legal roster", () => {
    const team = newDraftTeam();

    for (let i = 0; i < 5; i++) {
      team.players.push(createPlayer(lineman, team.id, i + 1));
    }

    saveTeam(team);
    const persisted = fixtureValue(loadTeams().find((t) => t.id === team.id));
    expect(getTeamMode(persisted)).toBe("draft");
    const violations = validateRosterLegality(persisted, humanRoster);
    expect(violations.some((v) => v.rule === "roster-size")).toBe(true);

    persisted.players.push(createPlayer(lineman, persisted.id, 6));
    persisted.players.push(createPlayer(lineman, persisted.id, 7));
    expect(
      validateRosterLegality(persisted, humanRoster).map((v) => v.rule)
    ).toEqual(["veteran"]);
    chooseVeteran(persisted, fixtureValue(persisted.players[0]).id);
    saveTeam(persisted);

    const repaired = fixtureValue(loadTeams().find((t) => t.id === team.id));
    expect(validateRosterLegality(repaired, humanRoster)).toEqual([]);
  });
});

describe("first-match activation and active management journey", () => {
  it("locks roster type, re-rolls and Dedicated Fans once a team is active", () => {
    const team = newDraftTeam();
    for (let i = 0; i < 7; i++) {
      team.players.push(createPlayer(lineman, team.id, i + 1));
    }
    saveTeam(team);
    expect(getTeamMode(team)).toBe("draft");
    expect(canEdit(team, { type: "change-roster-type" }).allowed).toBe(true);
    expect(priceOf(team, { type: "reroll" }).amount).toBe(100000);

    stampFirstCompletedMatch(team);
    saveTeam(team);

    const active = fixtureValue(loadTeams().find((t) => t.id === team.id));
    expect(getTeamMode(active)).toBe("active");
    expect(canEdit(active, { type: "change-roster-type" }).allowed).toBe(false);
    expect(priceOf(active, { type: "reroll" }).amount).toBeNull();
    expect(priceOf(active, { type: "dedicated-fan" }).amount).toBeNull();

    expect(canEdit(active, { type: "hire-player" }).allowed).toBe(true);
  });

  it("refuses a draft copy with bought staff over a team that has played", async () => {
    const team = newDraftTeam();
    await saveTeam(team);
    const stale = structuredClone(team);
    stampFirstCompletedMatch(team);
    await saveTeam(team);

    stale.treasury -= 100_000;
    stale.rerolls += 1;
    await expect(saveTeam(stale)).rejects.toThrow("has played its first match");
    const kept = fixtureValue(loadTeams().find((t) => t.id === team.id));
    expect(kept.rerolls).toBe(0);
    expect(getTeamMode(kept)).toBe("active");
  });
});

describe("post-match development resolved in Manage Team journey", () => {
  it("earns SPP in a match, then resolves the advancement later from Manage Team", () => {
    const team = newDraftTeam();
    const player = createPlayer(lineman, team.id, 1);
    team.players.push(player);
    saveTeam(team);

    player.spp = 10;
    saveTeam(team);

    const afterMatch = fixtureValue(loadTeams().find((t) => t.id === team.id));
    const afterPlayer = afterMatch.players[0];
    expect(canAdvance(fixtureValue(afterPlayer))).toBe(true);
    expect(fixtureValue(afterPlayer).advancements).toHaveLength(0);

    const [category] = fixtureValue(fixtureValue(afterPlayer).primary);
    const [skill] = eligibleSkills(fixtureValue(afterPlayer), [
      fixtureValue(category),
    ]);
    applyAdvancement(fixtureValue(afterPlayer), {
      kind: "chosen-primary",
      skill: fixtureValue(skill),
    });
    saveTeam(afterMatch);

    const resolved = fixtureValue(loadTeams().find((t) => t.id === team.id));
    const resolvedPlayer = resolved.players[0];
    expect(fixtureValue(resolvedPlayer).advancements).toHaveLength(1);
    expect(
      fixtureValue(resolvedPlayer).skills.some((s) => s.type === skill)
    ).toBe(true);
    expect(fixtureValue(resolvedPlayer).spp).toBeLessThan(10);
  });
});
