import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LobbyStatus } from "../../src/firebase/lobby";

const store = vi.hoisted(() => {
  const leaveResult: { status: LobbyStatus | undefined } = { status: "lobby" };
  return {
    leaveResult,
    leaveGuestSeat: vi.fn(() => Promise.resolve(leaveResult.status)),
  };
});

vi.mock("../../src/firebase/houseBot", () => ({ isHouseBotBrowser: () => false }));
vi.mock("../../src/firebase/lobby", () => ({
  getActiveMatchCode: () => Promise.resolve("SEATED"),
  fetchLobby: () =>
    Promise.resolve({ code: "SEATED", hostUid: "host", guestUid: "me", status: "lobby", players: {} }),
  leaveGuestSeat: store.leaveGuestSeat,
  setLobbyListed: vi.fn(),
}));

import { currentLobby } from "../../src/ui/components/pages/lobbyChoices";

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
});
