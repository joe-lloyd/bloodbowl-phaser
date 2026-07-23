import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeagueDoc } from "../../src/competition/types";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import {
  getCompetition,
  listCompetitions,
  saveCompetition,
} from "../../src/competition/repository";

function league(): LeagueDoc {
  return {
    id: "local-league",
    type: "league",
    name: "Local League",
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants: [],
    fixtures: [],
    standings: [],
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 2,
  };
}

beforeEach(() => localStorage.clear());

describe("local competition persistence", () => {
  it("resumes a saved season after a reload", async () => {
    await saveCompetition(league());
    expect(await getCompetition("league", "local-league")).toMatchObject({
      name: "Local League",
      status: "active",
    });
    expect(await listCompetitions("league", null)).toHaveLength(1);
  });
});
