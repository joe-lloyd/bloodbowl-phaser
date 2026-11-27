import { fixtureValue } from "../../src/testing/fixtureValue";
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
import { type HeadlessCommand } from "../../src/headless/protocol";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle(...sessions: LockstepSession[]) {
  for (let i = 0; i < 3; i++) {
    await tick();
    for (const session of sessions) await session.whenIdle();
  }
}

async function runWithGuestFallback(
  host: LockstepSession,
  guest: LockstepSession,
  command: HeadlessCommand
) {
  const hostResult = await host.run(command);
  return hostResult.ok ? { ok: true } : guest.run(command);
}

describe("a page reloaded mid-move", () => {
  it("lets the coach take the player's next step after the hello catches it up", async () => {
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
        myTeamId: side === "host" ? game.ctx.teams[0].id : game.ctx.teams[1].id,
        peerTeamId: side === "host" ? game.ctx.teams[1].id : game.ctx.teams[0].id,
        hostTeamId: game.ctx.teams[0].id,
      });
    const host = session(hostGame, hostEnd, "host");
    const guest = session(guestGame, guestEnd, "guest");
    const guestTeam = guestGame.ctx.teams[1].id;
    const isGuestMove = (command: HeadlessCommand) =>
      command.type === "move" &&
      guestGame.ctx.gameService.getPlayerById(command.playerId)?.teamId ===
        guestTeam;

    let next: HeadlessCommand | null = null;
    for (const [index, step] of recording.steps.entries()) {
      const following = recording.steps[index + 1]?.command;
      const mine = isGuestMove(step.command);
      const response = await (mine || step.command.type !== "move"
        ? runWithGuestFallback(host, guest, step.command)
        : host.run(step.command));
      response;
      await settle(host, guest);
      if (
        mine &&
        following?.type === "move" &&
        step.command.type === "move" &&
        following.playerId === step.command.playerId
      ) {
        next = following;
        break;
      }
    }
    expect(next).not.toBeNull();
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));

    guest.close();
    const reloaded = await build();
    const after = new LockstepSession({
      transport: guestEnd,
      game: reloaded,
      selfId: "guest-uid",
      myTeamId: reloaded.ctx.teams[1].id,
      peerTeamId: reloaded.ctx.teams[0].id,
      hostTeamId: reloaded.ctx.teams[0].id,
    });
    await after.sendHello();
    await settle(host, after);
    expect(stateChecksum(reloaded)).toBe(stateChecksum(hostGame));

    const stepped = await after.run(fixtureValue(next));
    await settle(host, after);
    expect(stepped.reason).toBeUndefined();
    expect(stepped.ok).toBe(true);
    expect(stateChecksum(hostGame)).toBe(stateChecksum(reloaded));
  }, 120_000);
});
