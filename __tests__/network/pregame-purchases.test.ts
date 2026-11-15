import { describe, expect, it } from "vitest";
import { pregameGame } from "../utils/pregameGame";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { LockstepSession } from "../../src/network/LockstepSession";
import {
  createInMemoryTransportPair,
  Transport,
} from "../../src/network/transport";
import { stateChecksum } from "../../src/headless/checksum";
import { Inducement } from "../../src/types/Inducements";
import { deserializeGameState } from "../../src/headless/serialization";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle(...sessions: LockstepSession[]) {
  for (let i = 0; i < 3; i++) {
    await tick();
    for (const session of sessions) await session.whenIdle();
  }
}
function session(game: HeadlessGame, transport: Transport, host: boolean) {
  return new LockstepSession({
    game,
    transport,
    selfId: host ? "host" : "guest",
    myTeamId: host ? "team1" : "team2",
    peerTeamId: host ? "team2" : "team1",
    hostTeamId: "team1",
  });
}

describe("pregame lockstep purchases", () => {
  it("keeps ready, quantities, confirmations and committed inventory identical on both peers", async () => {
    const home = pregameGame();
    const away = pregameGame();
    const [a, b] = createInMemoryTransportPair();
    const host = session(home, a, true);
    const guest = session(away, b, false);
    try {
      expect(
        (await guest.run({ type: "ready-inducements", teamId: "team1" })).ok
      ).toBe(false);
      expect(
        (await host.run({ type: "ready-inducements", teamId: "team1" })).ok
      ).toBe(true);
      await settle(host, guest);
      expect(
        (await guest.run({ type: "ready-inducements", teamId: "team2" })).ok
      ).toBe(true);
      await settle(host, guest);
      expect(
        (
          await host.run({
            type: "select-inducement",
            teamId: "team1",
            inducement: Inducement.BLITZERS_BEST_KEGS,
            quantity: 1,
          })
        ).ok
      ).toBe(true);
      await settle(host, guest);
      expect(home.ctx.gameService.getInducementOffer()).toEqual(
        away.ctx.gameService.getInducementOffer()
      );
      expect(
        away.snapshot().pregameInducements?.offer?.selections.team1
      ).toEqual([{ inducement: Inducement.BLITZERS_BEST_KEGS, quantity: 1 }]);
      await host.run({ type: "confirm-inducements", teamId: "team1" });
      await settle(host, guest);
      // A reloaded guest resumes the accepted negotiation rather than an empty cached session.
      const restored = new HeadlessGame({
        team1: structuredClone(away.ctx.team1),
        team2: structuredClone(away.ctx.team2),
        initialState: deserializeGameState(away.snapshot()),
        seed: 23,
      });
      expect(restored.ctx.gameService.getInducementOffer()).toEqual(
        home.ctx.gameService.getInducementOffer()
      );
      await guest.run({ type: "confirm-inducements", teamId: "team2" });
      await settle(host, guest);
      expect(home.snapshot().pregameInducements?.complete).toBe(true);
      expect(stateChecksum(home)).toBe(stateChecksum(away));
      expect(away.snapshot().inducements?.inventory).toHaveLength(1);
    } finally {
      host.close();
      guest.close();
    }
  });
});
