import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LobbyStatus } from "../../src/firebase/lobby";

const store = vi.hoisted(() => {
  const leaveResult: { status: LobbyStatus | undefined } = { status: "lobby" };
  return {
    leaveResult,
    leaveGuestSeat: vi.fn(() => Promise.resolve(leaveResult.status)),
  };
});

vi.mock("../../src/firebase/lobby", () => ({
  getActiveMatchCode: () => Promise.resolve("SEATED"),
  fetchLobby: () =>
    Promise.resolve({ code: "SEATED", hostUid: "host", guestUid: "me", status: "lobby", players: {} }),
  leaveGuestSeat: store.leaveGuestSeat,
  setLobbyListed: vi.fn(),
}));

import { currentLobby, vacateWhenGuestLeaves } from "../../src/ui/components/pages/lobbyChoices";

describe("Host Game while seated as someone's guest", () => {
  beforeEach(() => {
    store.leaveGuestSeat.mockClear();
  });

  it("gives up the seat and lets a new lobby open", async () => {
    store.leaveResult.status = "lobby";
    expect(await currentLobby("me", undefined)).toBeNull();
    expect(store.leaveGuestSeat).toHaveBeenCalledWith("SEATED", "me");
  });

  it("goes to the match when the host started it between the read and the release", async () => {
    store.leaveResult.status = "active";
    expect(await currentLobby("me", undefined)).toEqual({ code: "SEATED", playing: true });
  });

  it("tells Leave when the seat could not be given up, so it stays in the lobby", async () => {
    store.leaveGuestSeat.mockRejectedValueOnce(new Error("offline"));
    const seated = { code: "SEATED", hostUid: "host", guestUid: "me", status: "lobby" as const, players: {}, settings: { turnSeconds: 0, timeoutBankMs: 0, progressionEnabled: false }, createdAt: null };
    await expect(vacateWhenGuestLeaves(seated, "me")).rejects.toThrow("offline");
  });
});
