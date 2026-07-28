/**
 * End-to-end journeys for overhaul-team-lifecycle-management, driven at the
 * service layer (the same functions the UI calls) rather than through a
 * browser. The repo has no Playwright/browser-E2E harness yet, so these
 * stand in for tasks 6.3/6.4: incomplete draft repair, legal finalization,
 * first-match activation + active management, and post-match SPP being
 * resolved in Manage Team rather than on the results screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RosterName, createTeam } from "../../src/types/Team";
import { createPlayer, PlayerTemplate } from "../../src/types/Player";
import {
  loadTeams,
  saveTeam,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";
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
const lineman = humanRoster.playerTemplates.find((t) =>
  t.keywords.includes("Lineman" as never)
)! as PlayerTemplate;

function newDraftTeam() {
  return createTeam("Reikland Reavers", RosterName.HUMAN, {
    primary: 0,
    secondary: 0,
  });
}

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
});

describe("draft repair and legal finalization journey", () => {
  it("saves an incomplete draft, then repairs it into a legal roster", () => {
    const team = newDraftTeam();
    // Only 5 players — below the 7-player minimum.
    for (let i = 0; i < 5; i++) {
      team.players.push(createPlayer(lineman, team.id, i + 1));
    }

    // 1.6: an incomplete draft may still be persisted.
    saveTeam(team);
    const persisted = loadTeams().find((t) => t.id === team.id)!;
    expect(getTeamMode(persisted)).toBe("draft");
    const violations = validateRosterLegality(persisted, humanRoster);
    expect(violations.some((v) => v.rule === "roster-size")).toBe(true);

    // Repair: hire two more Linemen to reach 7.
    persisted.players.push(createPlayer(lineman, persisted.id, 6));
    persisted.players.push(createPlayer(lineman, persisted.id, 7));
    saveTeam(persisted);

    const repaired = loadTeams().find((t) => t.id === team.id)!;
    expect(validateRosterLegality(repaired, humanRoster)).toEqual([]);
  });
});

describe("first-match activation and active management journey", () => {
  it("locks roster type and refuses re-roll purchases once a team is active", () => {
    const team = newDraftTeam();
    for (let i = 0; i < 7; i++) {
      team.players.push(createPlayer(lineman, team.id, i + 1));
    }
    saveTeam(team);
    expect(getTeamMode(team)).toBe("draft");
    expect(canEdit(team, { type: "change-roster-type" }).allowed).toBe(true);
    expect(canEdit(team, { type: "buy-reroll" }).allowed).toBe(true);
    expect(priceOf(team, { type: "reroll" }).amount).toBe(
      team.rerollCost * 2
    );

    // The team's first match is confirmed complete.
    stampFirstCompletedMatch(team);
    saveTeam(team);

    const active = loadTeams().find((t) => t.id === team.id)!;
    expect(getTeamMode(active)).toBe("active");
    expect(canEdit(active, { type: "change-roster-type" }).allowed).toBe(
      false
    );
    expect(canEdit(active, { type: "buy-dedicated-fans" }).allowed).toBe(
      false
    );
    expect(canEdit(active, { type: "buy-reroll" }).allowed).toBe(false);
    expect(priceOf(active, { type: "reroll" }).amount).toBeNull();
    // Hiring an eligible player is still legal and still roster price.
    expect(canEdit(active, { type: "hire-player" }).allowed).toBe(true);
  });
});

describe("post-match development resolved in Manage Team journey", () => {
  it("earns SPP in a match, then resolves the advancement later from Manage Team", () => {
    const team = newDraftTeam();
    const player = createPlayer(lineman, team.id, 1);
    team.players.push(player);
    saveTeam(team);

    // Simulate the post-match screen awarding SPP (it no longer offers
    // skill/characteristic assignment itself — see MatchResultsScreen).
    player.spp = 10;
    saveTeam(team);

    const afterMatch = loadTeams().find((t) => t.id === team.id)!;
    const afterPlayer = afterMatch.players[0];
    expect(canAdvance(afterPlayer)).toBe(true);
    expect(afterPlayer.advancements).toHaveLength(0);

    // Later, in Manage Team's player development page: resolve the
    // pending advancement using the normal advancement + team-save
    // services (game/progression/progression.ts, TeamManager.saveTeam),
    // exactly what src/ui/components/hud/PlayerDevelopment.tsx does.
    const [category] = afterPlayer.primary!;
    const [skill] = eligibleSkills(afterPlayer, [category]);
    applyAdvancement(afterPlayer, { kind: "chosen-primary", skill });
    saveTeam(afterMatch);

    const resolved = loadTeams().find((t) => t.id === team.id)!;
    const resolvedPlayer = resolved.players[0];
    expect(resolvedPlayer.advancements).toHaveLength(1);
    expect(resolvedPlayer.skills.some((s) => s.type === skill)).toBe(true);
    expect(resolvedPlayer.spp).toBeLessThan(10);
  });
});
