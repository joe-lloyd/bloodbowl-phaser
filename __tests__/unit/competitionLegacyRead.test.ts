import { fixtureValue } from "../../src/testing/fixtureValue";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import {
  getCompetition,
  saveCompetition,
} from "../../src/competition/repository";
import {
  type LeagueDoc,
  type TournamentDoc,
} from "../../src/competition/types";

beforeEach(() => {
  localStorage.clear();
});

function legacyLeagueDoc(): LeagueDoc {
  return {
    id: "legacy-league",
    type: "league",
    name: "Legacy League",
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants: [
      {
        id: "e1",
        teamId: "home",
        name: "Home",
        rosterName: "Human",
        seed: 1,
        source: "local",

        team: { id: "home", name: "Home", players: [{ id: "p1" }] },
      } as unknown as LeagueDoc["entrants"][number],
    ],
    fixtures: [],
    standings: [],
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
}

function legacyTournamentDoc(): TournamentDoc {
  return {
    id: "legacy-cup",
    type: "tournament",
    name: "Legacy Cup",
    organizerUid: null,
    participantUids: [],
    status: "active",
    format: "single-elimination",
    entrants: [
      {
        id: "e1",
        teamId: "home",
        name: "Home",
        rosterName: "Human",
        seed: 1,
        source: "local",
        team: { id: "home", name: "Home", players: [{ id: "p1" }] },
      } as unknown as TournamentDoc["entrants"][number],
    ],
    fixtures: [],
    standings: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("reading a legacy embedded-roster competition document", () => {
  it("converts a league's entrants, dropping the embedded roster", async () => {
    localStorage.setItem(
      "bloodbowl_competitions",
      JSON.stringify({ "league:legacy-league": legacyLeagueDoc() })
    );

    const loaded = await getCompetition("league", "legacy-league");
    expect(loaded).not.toBeNull();
    expect(fixtureValue(loaded).entrants[0]).not.toHaveProperty("team");
    expect(fixtureValue(fixtureValue(loaded).entrants[0]).ownerUid).toBeNull();
    expect(fixtureValue(fixtureValue(loaded).entrants[0]).teamId).toBe("home");
  });

  it("writes the converted shape back on the next save", async () => {
    localStorage.setItem(
      "bloodbowl_competitions",
      JSON.stringify({ "league:legacy-league": legacyLeagueDoc() })
    );
    const loaded = await getCompetition("league", "legacy-league");
    await saveCompetition(fixtureValue(loaded));

    const raw = JSON.parse(fixtureValue(localStorage.getItem("bloodbowl_competitions")));
    expect(raw["league:legacy-league"].entrants[0]).not.toHaveProperty("team");
  });

  it("converts a tournament's entrants the same way", async () => {
    localStorage.setItem(
      "bloodbowl_competitions",
      JSON.stringify({ "tournament:legacy-cup": legacyTournamentDoc() })
    );

    const loaded = await getCompetition("tournament", "legacy-cup");
    expect(fixtureValue(loaded).entrants[0]).not.toHaveProperty("team");
    expect(fixtureValue(fixtureValue(loaded).entrants[0]).ownerUid).toBeNull();
  });
});
