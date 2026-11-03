/**
 * A coach's page closes while they owe a block-dice choice, then comes
 * back. The returning page starts from an older save and the hello catches
 * it up by resync. The coach must still be able to pick the die. In the
 * round 5 two-machine match (3 November 2026) the host's tab closed while
 * its Blitz dice were in the air. On return the engine held the pending
 * choice but could not resolve it, and the match froze for 23 minutes on
 * "Time up".
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

describe("a page reloaded while its coach owes a block die", () => {
  it("lets the coach pick the die after the hello catches it up", async () => {
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
      });
    const host = session(hostGame, hostEnd, "host");
    const guest = session(guestGame, guestEnd, "guest");
    const guestTeam = guestGame.ctx.team2.id;

    // Play until the guest owes a block-dice pick
    let answer = null;
    for (const [index, step] of recording.steps.entries()) {
      if (!(await host.run(step.command)).ok) await guest.run(step.command);
      await settle(host, guest);
      const pending = guestGame.pendingDecision();
      const following = recording.steps[index + 1]?.command;
      if (
        pending?.type === "block-dice" &&
        pending.chooserTeamId === guestTeam &&
        following?.type === "choose-block-result"
      ) {
        answer = following;
        break;
      }
    }
    expect(answer).not.toBeNull();
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));

    // The guest's tab closes and reopens on a page from the start of the match
    guest.close();
    const reloaded = await build();
    const after = new LockstepSession({
      transport: guestEnd,
      game: reloaded,
      selfId: "guest-uid",
      myTeamId: reloaded.ctx.team2.id,
      peerTeamId: reloaded.ctx.team1.id,
      hostTeamId: reloaded.ctx.team1.id,
    });
    await after.sendHello();
    await settle(host, after);
    expect(reloaded.pendingDecision()?.type).toBe("block-dice");

    const picked = await after.run(answer!);
    await settle(host, after);
    expect(picked.reason).toBeUndefined();
    expect(picked.ok).toBe(true);
    expect(reloaded.pendingDecision()?.type).not.toBe("block-dice");
    expect(stateChecksum(hostGame)).toBe(stateChecksum(reloaded));
  }, 120_000);
});
