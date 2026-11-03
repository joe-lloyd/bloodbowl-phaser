/**
 * Both coaches' pages open at the same moment and each says hello. Each
 * answers the other's hello, so neither needs the other's answer, and play
 * must carry on with no desync and no resync.
 */
import { describe, it, expect } from "vitest";
import {
  createSimGame,
  grantSimInducements,
  runMatch,
} from "../../src/simulation/runMatch";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { stateChecksum } from "../../src/headless/checksum";
import { LockstepSession } from "../../src/network/LockstepSession";
import { createInMemoryTransportPair } from "../../src/network/transport";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle(...sessions: LockstepSession[]) {
  for (let i = 0; i < 3; i++) {
    await tick();
    for (const session of sessions) await session.whenIdle();
  }
}

describe("two pages that say hello at once", () => {
  it("play on with no desync", async () => {
    const seed = 5150;
    const recording = await runMatch({
      seed,
      rosters: ["Human", "Orc"],
      coaches: [heuristicCoach, heuristicCoach],
    });
    const build = async () => {
      const game = createSimGame(
        seed,
        recording.rosters,
        recording.rerolls,
        recording.lineup
      );
      await grantSimInducements(game);
      return game;
    };
    const hostGame = await build();
    const guestGame = await build();
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

    await Promise.all([host.sendHello(), guest.sendHello()]);
    for (const step of recording.steps.slice(0, 40)) {
      if (!(await host.run(step.command)).ok) await guest.run(step.command);
      await settle(host, guest);
    }

    expect(desyncs).toEqual([]);
    expect(guest.appliedCommands()).toBe(host.appliedCommands());
    expect(host.appliedCommands()).toBeGreaterThan(30);
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
  }, 120_000);
});
