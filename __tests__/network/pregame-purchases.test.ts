import { describe, expect, it } from "vitest";
import { pregameGame } from "../utils/pregameGame";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { LockstepSession } from "../../src/network/LockstepSession";
import {
  createInMemoryTransportPair,
  type Transport,
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
function session(
  game: HeadlessGame,
  transport: Transport,
  host: boolean,
  onDesync?: (detail: string) => void
) {
  return new LockstepSession({
    game,
    transport,
    selfId: host ? "host" : "guest",
    myTeamId: host ? "team1" : "team2",
    peerTeamId: host ? "team2" : "team1",
    hostTeamId: "team1",
    ...(onDesync === undefined ? {} : { onDesync: onDesync }),
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
        (await guest.run({ type: "ready-weather", teamId: "team1" })).ok
      ).toBe(false);
      expect(
        (await guest.run({ type: "ready-weather", teamId: "team2" })).ok
      ).toBe(true);
      await settle(host, guest);
      expect(
        (await host.run({ type: "ready-weather", teamId: "team1" })).ok
      ).toBe(true);
      await settle(host, guest);

      expect(
        (await host.run({ type: "confirm-inducements", teamId: "team1" }))
          .reason
      ).toBe("not-your-turn");
      expect(
        (await guest.run({ type: "confirm-inducements", teamId: "team2" })).ok
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
        away.snapshot().pregameInducements?.offer?.selections["team1"]
      ).toEqual([{ inducement: Inducement.BLITZERS_BEST_KEGS, quantity: 1 }]);

      const restored = new HeadlessGame({
        team1: structuredClone(away.ctx.team1),
        team2: structuredClone(away.ctx.team2),
        initialState: deserializeGameState(away.snapshot()),
        seed: 23,
      });
      expect(restored.ctx.gameService.getInducementOffer()).toEqual(
        home.ctx.gameService.getInducementOffer()
      );
      await host.run({ type: "confirm-inducements", teamId: "team1" });
      await settle(host, guest);
      expect(home.snapshot().pregameInducements?.complete).toBe(true);
      expect(stateChecksum(home)).toBe(stateChecksum(away));
      expect(away.snapshot().inducements?.inventory).toHaveLength(1);
    } finally {
      host.close();
      guest.close();
    }
  });

  it("stays in step when both coaches ready up and buy at the same moment", async () => {
    const home = pregameGame();
    const away = pregameGame();
    const [a, b] = createInMemoryTransportPair();
    const desyncs: string[] = [];
    const onDesync = (detail: string) => desyncs.push(detail);
    const host = session(home, a, true, onDesync);
    const guest = session(away, b, false, onDesync);
    const both = (
      hostCommand: Parameters<LockstepSession["run"]>[0],
      guestCommand: Parameters<LockstepSession["run"]>[0]
    ) => Promise.all([host.run(hostCommand), guest.run(guestCommand)]);
    try {
      const [early] = await both(
        { type: "ready-weather", teamId: "team1" },
        { type: "ready-weather", teamId: "team2" }
      );
      await settle(host, guest);
      expect(early.ok).toBe(false);
      await host.run({ type: "ready-weather", teamId: "team1" });
      await settle(host, guest);

      const [hostBuy, guestBuy] = await both(
        {
          type: "select-inducement",
          teamId: "team1",
          inducement: Inducement.BLITZERS_BEST_KEGS,
          quantity: 1,
        },
        { type: "confirm-inducements", teamId: "team2" }
      );
      await settle(host, guest);
      expect([hostBuy.ok, guestBuy.ok]).toEqual([false, true]);

      const [hostConfirm, guestLate] = await both(
        { type: "confirm-inducements", teamId: "team1" },
        { type: "confirm-inducements", teamId: "team2" }
      );
      await settle(host, guest);
      expect([hostConfirm.ok, guestLate.ok]).toEqual([true, false]);

      expect(desyncs).toEqual([]);
      expect(home.snapshot().pregameInducements?.complete).toBe(true);
      expect(stateChecksum(home)).toBe(stateChecksum(away));
    } finally {
      host.close();
      guest.close();
    }
  });
});
