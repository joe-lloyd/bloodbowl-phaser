import { describe, it, expect } from "vitest";
import { isPlayerOnline, type LobbyDoc } from "../../src/firebase/lobby";

describe("isPlayerOnline", () => {
  const lobbyWith = (lastSeen: number | undefined): LobbyDoc =>
    ({
      players: { p1: { uid: "p1", lastSeen } },
    }) as unknown as LobbyDoc;

  const NOW = 100_000;
  const THRESHOLD = 15_000;

  it("is online when the heartbeat is recent", () => {
    expect(isPlayerOnline({ lobby: lobbyWith(NOW-5000),uid: "p1",thresholdMs: THRESHOLD,now: NOW })).toBe(
      true
    );
  });

  it("is offline once the heartbeat is older than the threshold", () => {
    expect(isPlayerOnline({ lobby: lobbyWith(NOW-20000),uid: "p1",thresholdMs: THRESHOLD,now: NOW })).toBe(
      false
    );
  });

  it("treats a player with no heartbeat yet as present (not a false drop)", () => {
    expect(isPlayerOnline({ lobby: lobbyWith(undefined),uid: "p1",thresholdMs: THRESHOLD,now: NOW })).toBe(
      true
    );
  });
});
