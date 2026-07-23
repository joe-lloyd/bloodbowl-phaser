import { beforeEach, describe, expect, it, vi } from "vitest";
import { Team } from "../../src/types/Team";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({
    path: path.join("/"),
  })),
  doc: vi.fn((parent: { path: string }, id: string) => ({
    path: `${parent.path}/${id}`,
  })),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
}));

vi.mock("../../src/firebase/config", () => ({
  getDb: vi.fn(() => ({})),
}));

import { deleteDoc, setDoc } from "firebase/firestore";
import {
  publishTeam,
  unpublishTeam,
} from "../../src/firebase/sharedTeamRepository";

const roster = {
  id: "orcs",
  name: "Da Orcs",
  players: [],
} as unknown as Team;

beforeEach(() => vi.clearAllMocks());

describe("shared team snapshots", () => {
  it("publishes and removes only the owner's deterministic document", async () => {
    await publishTeam("coach-1", "Morg", roster);
    expect((vi.mocked(setDoc).mock.calls[0][0] as { path: string }).path).toBe(
      "shared-teams/coach-1_orcs"
    );
    expect(vi.mocked(setDoc).mock.calls[0][1]).toMatchObject({
      ownerUid: "coach-1",
      teamId: "orcs",
      team: { name: "Da Orcs" },
    });

    await unpublishTeam("coach-1", "orcs");
    expect(
      (vi.mocked(deleteDoc).mock.calls[0][0] as { path: string }).path
    ).toBe("shared-teams/coach-1_orcs");
  });
});
