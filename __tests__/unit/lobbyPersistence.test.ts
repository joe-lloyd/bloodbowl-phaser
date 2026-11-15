import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchResume } from "../../src/firebase/lobby";
import type { GameSnapshot } from "../../src/headless/serialization";

const transaction = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
}));
vi.mock("firebase/firestore", async (load) => ({
  ...(await load<typeof import("firebase/firestore")>()),
  doc: vi.fn(() => "lobby-reference"),
  serverTimestamp: vi.fn(() => "server-time"),
  runTransaction: vi.fn(async (_db, work) => work(transaction)),
}));
vi.mock("../../src/firebase/config", () => ({ getDb: () => ({}) }));

import { persistMatch } from "../../src/firebase/lobby";

beforeEach(() => vi.clearAllMocks());

describe("online match persistence", () => {
  it.each([
    { stored: 8, incoming: 5, writes: false },
    { stored: 8, incoming: 8, writes: true },
    { stored: 8, incoming: 9, writes: true },
    { stored: undefined, incoming: 0, writes: true },
  ])(
    "compares command counts before saving: $incoming against $stored",
    async ({ stored, incoming, writes }) => {
      transaction.get.mockResolvedValue({
        data: () =>
          stored === undefined ? {} : { resume: { applied: stored } },
      });
      const snapshot = { phase: "SETUP" } as GameSnapshot;
      const resume = { applied: incoming } as MatchResume;
      await persistMatch("PREGAME", snapshot, resume);
      expect(transaction.get).toHaveBeenCalledWith("lobby-reference");
      if (writes)
        expect(transaction.update).toHaveBeenCalledWith("lobby-reference", {
          snapshot,
          resume,
          snapshotAt: "server-time",
        });
      else expect(transaction.update).not.toHaveBeenCalled();
    }
  );
});
