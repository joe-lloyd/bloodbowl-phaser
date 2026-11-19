import { describe, expect, it } from "vitest";
import { createSimGame } from "../../src/simulation/runMatch";
import { stateChecksum } from "../../src/headless/checksum";
import { LockstepSession } from "../../src/network/LockstepSession";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { RosterName } from "../../src/types/Team";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a full resync onto an engine with flags the peer lacks", () => {
  it("clears Charge!, Knockout and pays-winnings flags", async () => {
    const build = () =>
      createSimGame(5150, [RosterName.HUMAN, RosterName.ORC], 3);
    const hostGame = build();
    const guestGame = build();
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const desyncs: string[] = [];
    const session = (
      game: typeof hostGame,
      end: typeof hostEnd,
      side: string
    ) =>
      new LockstepSession({
        transport: end,
        game,
        selfId: `${side}-uid`,
        myTeamId: side === "host" ? game.ctx.team1.id : game.ctx.team2.id,
        peerTeamId: side === "host" ? game.ctx.team2.id : game.ctx.team1.id,
        hostTeamId: game.ctx.team1.id,
        onDesync: (detail) => desyncs.push(`${side}: ${detail}`),
      });
    const host = session(hostGame, hostEnd, "host");
    const guest = session(guestGame, guestEnd, "guest");
    const honest = stateChecksum(hostGame);

    const stale = guestGame.ctx.gameService.getState();
    stale.chargeTeamId = guestGame.ctx.team1.id;
    stale.knockout = true;
    stale.paysWinnings = true;
    expect(stateChecksum(guestGame)).not.toBe(honest);

    await guest.requestResync();
    for (let i = 0; i < 5; i++) {
      await tick();
      await host.whenIdle();
      await guest.whenIdle();
    }

    const state = guestGame.ctx.gameService.getState();
    expect(state.chargeTeamId).toBeUndefined();
    expect(state.knockout).toBeUndefined();
    expect(state.paysWinnings).toBeUndefined();
    expect(stateChecksum(guestGame)).toBe(honest);
    expect(desyncs).toEqual([]);
  });
});
