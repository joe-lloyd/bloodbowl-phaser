import { describe, it, expect } from "vitest";
import { isPlayerOnline, LobbyDoc } from "../../src/firebase/lobby";

/** Presence/disconnect detection from the lobby heartbeat. */
describe("isPlayerOnline", () => {
  const lobbyWith = (lastSeen: number | undefined): LobbyDoc =>
    ({
      players: { p1: { uid: "p1", lastSeen } },
    }) as unknown as LobbyDoc;

  const NOW = 100_000;
  const THRESHOLD = 15_000;

  it("is online when the heartbeat is recent", () => {
    expect(isPlayerOnline(lobbyWith(NOW - 5_000), "p1", THRESHOLD, NOW)).toBe(
      true
    );
  });

  it("is offline once the heartbeat is older than the threshold", () => {
    expect(isPlayerOnline(lobbyWith(NOW - 20_000), "p1", THRESHOLD, NOW)).toBe(
      false
    );
  });

  it("treats a player with no heartbeat yet as present (not a false drop)", () => {
    expect(isPlayerOnline(lobbyWith(undefined), "p1", THRESHOLD, NOW)).toBe(
      true
    );
  });
});
