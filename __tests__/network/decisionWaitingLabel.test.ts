import { afterEach, expect, it } from "vitest";
import { createOnlineMatch } from "../../src/network/OnlineMatch";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { DEFAULT_SETTINGS, LobbyDoc } from "../../src/firebase/lobby";
import { GamePhase, SubPhase } from "../../src/types/GameState";

afterEach(() => ServiceContainer.reset());
it("names the team and decision in plain words for the waiting coach", () => {
  const game = new HeadlessGame({ seed: 1 });
  const { team1, team2 } = game.ctx;
  const snapshot = game.snapshot();
  snapshot.phase = GamePhase.PLAY;
  snapshot.subPhase = SubPhase.TURN_RECEIVING;
  snapshot.activeTeamId = team1.id;
  const lobby: LobbyDoc = {
    code: "DECIDE",
    hostUid: "host",
    guestUid: "guest",
    status: "active",
    settings: DEFAULT_SETTINGS,
    snapshot,
    createdAt: null,
    players: {
      host: { uid: "host", displayName: "Coach A", team: team1, ready: true },
      guest: { uid: "guest", displayName: "Coach B", team: team2, ready: true },
    },
  };
  const [transport] = createInMemoryTransportPair();
  const match = createOnlineMatch({
    lobby,
    user: { uid: "guest", displayName: "Coach B", email: null, photoURL: null },
    eventBus: new EventBus(),
    transport,
    seed: 1,
  });
  try {
    void ServiceContainer.getInstance()
      .gameService.getDecisionService()
      .request({
        type: "reroll",
        playerId: team1.players[0].id,
        chooserTeamId: team1.id,
        rollKind: "dodge",
        sources: ["team"],
        roll: 1,
      });
    expect(match.mayAct()).toBe(false);
    expect(match.waitingLabel()).toBe(`${team1.name} is choosing a re-roll`);
  } finally {
    match.close();
  }
});
