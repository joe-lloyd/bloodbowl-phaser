import { describe, it, expect } from "vitest";
import {
  describeOpponentConnection,
  LobbyDoc,
  OPPONENT_ABANDON_MS,
  OPPONENT_DISCONNECT_MS,
} from "../../src/firebase/lobby";

/**
 * Single source of truth for the online options menu's connection-status
 * row and force-abandon gating (see src/ui/components/hud/computeMatchOptionsMenu.ts).
 * Mirrors the presence thresholds previously duplicated in
 * OnlinePlayPage's DisconnectBanner.
 */
describe("describeOpponentConnection", () => {
  const lobbyWith = (lastSeen: number | undefined): LobbyDoc =>
    ({
      players: { opponent: { uid: "opponent", lastSeen } },
    }) as unknown as LobbyDoc;

  const NOW = 1_000_000;

  it("is online with a recent heartbeat", () => {
    expect(
      describeOpponentConnection(lobbyWith(NOW - 1000), "opponent", NOW)
    ).toBe("online");
  });

  it("is reconnecting once stale past the disconnect grace but within the abandon grace", () => {
    expect(
      describeOpponentConnection(
        lobbyWith(NOW - OPPONENT_DISCONNECT_MS - 1),
        "opponent",
        NOW
      )
    ).toBe("reconnecting");
  });

  it("is abandonable once stale past the abandon grace", () => {
    expect(
      describeOpponentConnection(
        lobbyWith(NOW - OPPONENT_ABANDON_MS - 1),
        "opponent",
        NOW
      )
    ).toBe("abandonable");
  });

  it("treats a player with no heartbeat yet as online (not a false drop)", () => {
    expect(describeOpponentConnection(lobbyWith(undefined), "opponent", NOW)).toBe(
      "online"
    );
  });
});
