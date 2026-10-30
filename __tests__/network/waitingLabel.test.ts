/**
 * The waiting coach's banner says what the other coach is doing. During
 * setup it said "<coach>'s turn", as if a turn had started.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnlineMatch } from "../../src/network/OnlineMatch";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { LobbyDoc, DEFAULT_SETTINGS } from "../../src/firebase/lobby";
import { Scenario } from "../../src/types/Scenario";

vi.mock("../../src/firebase/lobby", async (load) => ({
  ...(await load<typeof import("../../src/firebase/lobby")>()),
  persistMatch: async () => {},
}));

const guestSettingUp: Scenario = {
  id: "online-guest-setup",
  name: "Guest sets up",
  description: "",
  setup: {
    team1Placements: [],
    team2Placements: [],
    activeTeam: "team2",
    phase: GamePhase.SETUP,
    subPhase: SubPhase.SETUP_KICKING,
  },
};

afterEach(() => ServiceContainer.reset());

describe("online waiting label", () => {
  it("says the other coach is setting up during setup", () => {
    const game = new HeadlessGame({ scenario: guestSettingUp, seed: 2 });
    const { team1, team2 } = game.ctx;
    const lobby: LobbyDoc = {
      code: "SETUP",
      hostUid: "host-uid",
      guestUid: "guest-uid",
      status: "active",
      settings: { ...DEFAULT_SETTINGS },
      snapshot: game.snapshot(),
      players: {
        "host-uid": {
          uid: "host-uid",
          displayName: "Host",
          team: team1,
          ready: true,
        },
        "guest-uid": {
          uid: "guest-uid",
          displayName: "Guest",
          team: team2,
          ready: true,
        },
      },
      createdAt: null,
    };
    const [hostEnd] = createInMemoryTransportPair();
    const match = createOnlineMatch({
      lobby,
      user: { uid: "host-uid", displayName: "Host", email: null, photoURL: null },
      eventBus: new EventBus(),
      transport: hostEnd,
      seed: 2,
    });

    expect(match.mayAct()).toBe(false);
    expect(match.waitingLabel()).toBe("Waiting for Guest to set up…");
    match.close();
  });
});
