import { beforeEach, describe, expect, it, vi } from "vitest";
import { Team } from "../../src/types/Team";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock("../../src/firebase/config", () => ({
  getDb: vi.fn(() => ({})),
}));

import { setDoc } from "firebase/firestore";
import { createLobby } from "../../src/firebase/lobby";

const setDocMock = vi.mocked(setDoc);
const team = (id: string) => ({ id, name: id, players: [] }) as unknown as Team;

beforeEach(() => vi.clearAllMocks());

describe("hosted competition fixtures", () => {
  it("stores fixture context and locks both roster snapshots on the lobby", async () => {
    const context = {
      competitionType: "tournament" as const,
      competitionId: "cup",
      fixtureId: "round-1-match-1",
    };
    const created = await createLobby("host", "Coach", {
      context,
      homeTeam: team("home"),
      awayTeam: team("away"),
    });

    expect(created.competitionContext).toEqual(context);
    expect(created.players.host.team?.id).toBe("home");
    expect(created.fixtureTeams?.away.id).toBe("away");
    expect(created.settings.pitchThemeId).toBe("classic");
    expect(setDocMock.mock.calls[0][1]).toMatchObject({
      settings: { pitchThemeId: "classic" },
      competitionContext: context,
      fixtureTeams: {
        home: { id: "home" },
        away: { id: "away" },
      },
    });
  });
});
