/**
 * A full-state resync lands while a coach owes a re-roll, a reaction or an
 * inducement choice. The roll path paused on that decision cannot travel in
 * a state, so the owner's answer used to be refused for good and only ending
 * the match by agreement got out. The resync now carries the state from
 * before the decision and the commands since, which rebuild the paused path.
 */
import { describe, expect, it } from "vitest";
import {
  createSimGame,
  grantSimInducements,
  runMatch,
} from "../../src/simulation/runMatch";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { stateChecksum } from "../../src/headless/checksum";
import { LockstepSession } from "../../src/network/LockstepSession";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { HeadlessCommand } from "../../src/headless/protocol";
import { RosterName } from "../../src/types/Team";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle(...sessions: LockstepSession[]) {
  for (let i = 0; i < 5; i++) {
    await tick();
    for (const session of sessions) await session.whenIdle();
  }
}

const SEEDS = [5150, 5151, 5152, 5153];

async function playUntilOwed(decision: string, reply: string) {
  for (const seed of SEEDS) {
    const recording = await runMatch({
      seed,
      rosters: [RosterName.HUMAN, RosterName.ORC],
      coaches: [heuristicCoach, heuristicCoach],
    });
    const stop =
      recording.steps.findIndex(
        (step) => step.ok && step.command.type === reply
      ) - 1;
    if (stop < 0) continue;
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
    return { recording, stop, build };
  }
  throw new Error(`no seed reaches ${decision}`);
}

describe.each([
  ["reroll", "use-reroll"],
  ["reaction", "use-reaction"],
] as const)("a full resync while a %s is open", (decision, reply) => {
  it("lets the coach answer, and the match carries on in step", async () => {
    const { recording, stop, build } = await playUntilOwed(decision, reply);
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
    const play = async (command: HeadlessCommand) => {
      if (!(await host.run(command)).ok) await guest.run(command);
      await settle(host, guest);
    };

    for (const step of recording.steps.slice(0, stop + 1)) {
      await play(step.command);
    }
    expect(hostGame.pendingDecision()?.type).toBe(decision);

    await guest.requestResync();
    await settle(host, guest);
    expect(guestGame.pendingDecision()?.type).toBe(decision);
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
    expect(guest.appliedCommands()).toBe(host.appliedCommands());

    await host.requestResync();
    await settle(host, guest);
    expect(hostGame.pendingDecision()?.type).toBe(decision);

    for (const step of recording.steps.slice(stop + 1, stop + 25)) {
      await play(step.command);
    }
    expect(guest.appliedCommands()).toBe(host.appliedCommands());
    expect(guest.appliedCommands()).toBeGreaterThan(stop + 1);
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
    expect(desyncs).toEqual([]);
  }, 120_000);
});

describe("a full resync while a pre-match inducement choice is open", () => {
  it("leaves the choice answerable when both engines already agree", async () => {
    // Opened as the engine is built, before any command, so no earlier state
    // can rebuild it. Matched Play draft lists start their rolls this way.
    for (let seed = 7000; seed < 7100; seed++) {
      const build = async () => {
        const game = createSimGame(seed, [RosterName.HUMAN, RosterName.ORC], 3);
        await grantSimInducements(game);
        return game;
      };
      const hostGame = await build();
      const pending = hostGame.pendingDecision();
      if (pending?.type !== "inducement-choice" || !pending.optional) continue;
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
      await guest.requestResync();
      await settle(host, guest);

      const owner =
        pending.chooserTeamId === hostGame.ctx.team1.id ? host : guest;
      const answered = await owner.run({ type: "choose-inducement" });
      await settle(host, guest);
      expect(answered.reason).toBeUndefined();
      expect(answered.ok).toBe(true);
      expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
      return;
    }
    throw new Error("no seed opens an optional inducement choice");
  }, 120_000);
});
