/**
 * Two lockstep sessions over the in-memory transport, each with its own
 * engine: a whole match played by whichever coach may act, a dropped
 * message healed by resync, a reloaded page caught up, and an engine that
 * drifted caught by the checksum.
 */
import { describe, it, expect } from "vitest";
import {
  createSimGame,
  grantSimInducements,
  runMatch,
} from "../../src/simulation/runMatch";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stateChecksum } from "../../src/headless/checksum";
import { LockstepSession } from "../../src/network/LockstepSession";
import {
  createInMemoryTransportPair,
  Transport,
} from "../../src/network/transport";
import { Envelope } from "../../src/network/envelope";
import { HeadlessCommand } from "../../src/headless/protocol";
import { GamePhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function pair(seed: number) {
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
  const [hostGame, guestGame] = [await build(), await build()];
  const [hostEnd, guestEnd] = createInMemoryTransportPair();
  const resyncs = { host: 0, guest: 0 };
  const session = (
    game: HeadlessGame,
    transport: Transport,
    side: "host" | "guest"
  ) =>
    new LockstepSession({
      transport,
      game,
      selfId: `${side}-uid`,
      myTeamId: side === "host" ? game.ctx.team1.id : game.ctx.team2.id,
      peerTeamId: side === "host" ? game.ctx.team2.id : game.ctx.team1.id,
      hostTeamId: game.ctx.team1.id,
      onResynced: () => resyncs[side]++,
    });
  return {
    recording,
    hostGame,
    guestGame,
    hostEnd,
    guestEnd,
    host: session(hostGame, hostEnd, "host"),
    guest: session(guestGame, guestEnd, "guest"),
    resyncs,
  };
}

/** Until both sessions have delivered and run everything queued. */
async function settle(...sessions: LockstepSession[]) {
  for (let i = 0; i < 3; i++) {
    await tick();
    for (const session of sessions) await session.whenIdle();
  }
}

/** The coach who may act runs it; the other side is tried only if refused. */
async function play(
  host: LockstepSession,
  guest: LockstepSession,
  command: HeadlessCommand
) {
  const byHost = await host.run(command);
  if (byHost.ok || !/not-your|host-only/.test(byHost.reason ?? ""))
    return { side: "host", response: byHost };
  return { side: "guest", response: await guest.run(command) };
}

describe("lockstep sessions", () => {
  it("play a whole match with each command run by its coach and replayed by the other", async () => {
    const { recording, hostGame, guestGame, host, guest, resyncs } =
      await pair(4242);
    const sides = { host: 0, guest: 0 };

    for (const [index, step] of recording.steps.entries()) {
      const { side, response } = await play(host, guest, step.command);
      await settle(host, guest);
      if (stateChecksum(hostGame) !== stateChecksum(guestGame))
        throw new Error(
          `diverged at step ${index}: ${step.command.type} by ${side}`
        );
      expect(response.ok).toBe(step.ok);
      if (response.ok) sides[side as "host" | "guest"]++;
    }

    expect(hostGame.snapshot().phase).toBe(recording.final.phase);
    expect(sides.host).toBeGreaterThan(50);
    expect(sides.guest).toBeGreaterThan(50);
    expect(resyncs).toEqual({ host: 0, guest: 0 });
  }, 120_000);

  it("heals a dropped command with a resync from the side that is ahead", async () => {
    const { recording, hostGame, guestGame, hostEnd, host, guest, resyncs } =
      await pair(77);
    const steps = recording.steps.slice(0, 120);
    const dropAt = 60;
    const realSend = hostEnd.send.bind(hostEnd);

    for (const [index, step] of steps.entries()) {
      // One host message is lost on the way
      hostEnd.send =
        index === dropAt
          ? async (envelope: Envelope) => {
              if (envelope.kind !== "command") await realSend(envelope);
            }
          : realSend;
      await play(host, guest, step.command);
      await settle(host, guest);
    }
    hostEnd.send = realSend;
    await settle(host, guest);

    expect(resyncs.guest + resyncs.host).toBeGreaterThan(0);
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
  }, 120_000);

  it("catches a drifted engine by its checksum and rebuilds it", async () => {
    const { recording, hostGame, guestGame, host, guest, resyncs } =
      await pair(91);
    const steps = recording.steps.slice(0, 80);
    for (const [index, step] of steps.entries()) {
      // Something on the guest's machine changes its dice state
      if (index === 40) guestGame.ctx.rng.rollDie(6);
      await play(host, guest, step.command);
      await settle(host, guest);
    }
    expect(resyncs.guest + resyncs.host).toBeGreaterThan(0);
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
  }, 120_000);

  it("a reloaded page with an older save is caught up by the hello", async () => {
    const { recording, hostGame, guestGame, guestEnd, host, guest, resyncs } =
      await pair(5150);
    for (const step of recording.steps.slice(0, 50)) {
      await play(host, guest, step.command);
      await settle(host, guest);
    }
    guest.close();
    // The reloaded guest page: its own engine, at the very start
    const reloaded = createSimGame(
      5150,
      recording.rosters,
      recording.rerolls,
      recording.lineup
    );
    await grantSimInducements(reloaded);
    const after = new LockstepSession({
      transport: guestEnd,
      game: reloaded,
      selfId: "guest-uid",
      myTeamId: reloaded.ctx.team2.id,
      peerTeamId: reloaded.ctx.team1.id,
      hostTeamId: reloaded.ctx.team1.id,
      onResynced: () => resyncs.guest++,
    });
    await after.sendHello();
    await settle(host, after);

    expect(resyncs.guest).toBe(1);
    expect(stateChecksum(reloaded)).toBe(stateChecksum(hostGame));
    expect(after.appliedCommands()).toBe(host.appliedCommands());
    void guestGame;
  }, 120_000);

  it("rolls the opening weather on both engines with the start of setup", async () => {
    const make = () =>
      new HeadlessGame({ seed: 8128, startingPhase: GamePhase.SETUP });
    const hostGame = make();
    const guestGame = new HeadlessGame({
      seed: 8128,
      startingPhase: GamePhase.SETUP,
      team1: structuredClone(hostGame.ctx.team1),
      team2: structuredClone(hostGame.ctx.team2),
    });
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const ids = {
      hostTeamId: hostGame.ctx.team1.id,
      myTeamId: hostGame.ctx.team1.id,
      peerTeamId: hostGame.ctx.team2.id,
    };
    const host = new LockstepSession({
      ...ids,
      transport: hostEnd,
      game: hostGame,
      selfId: "host-uid",
    });
    const guest = new LockstepSession({
      ...ids,
      myTeamId: ids.peerTeamId,
      peerTeamId: ids.myTeamId,
      transport: guestEnd,
      game: guestGame,
      selfId: "guest-uid",
    });
    const rolls: string[] = [];
    hostGame.ctx.eventBus.on(
      GameEventNames.DiceRoll,
      (roll: { rollType: string }) => rolls.push(roll.rollType)
    );

    const started = await host.run({
      type: "start-setup",
      kickingTeamId: hostGame.ctx.team1.id,
      rollWeather: true,
    });
    await settle(host, guest);

    expect(started.ok).toBe(true);
    expect(rolls.some((type) => /weather/i.test(type))).toBe(true);
    expect(guestGame.snapshot().weather).toBe(hostGame.snapshot().weather);
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
  });

  it("hands the other coach's move to the watcher before it runs, so the whole path can be drawn", async () => {
    const { recording, guestGame, host, guest, guestEnd } = await pair(4242);
    guest.close(); // the watcher below takes its place
    const seen: { from?: unknown; path: unknown }[] = [];
    const watcher = new LockstepSession({
      transport: guestEnd,
      game: guestGame,
      selfId: "guest-uid",
      myTeamId: guestGame.ctx.team2.id,
      peerTeamId: guestGame.ctx.team1.id,
      hostTeamId: guestGame.ctx.team1.id,
      onPeerCommand: (command) => {
        if (command.type !== "move") return;
        const player = guestGame.ctx.gameService.getPlayerById(
          command.playerId
        );
        seen.push({
          from: player?.gridPosition && { ...player.gridPosition },
          path: command.path,
        });
      },
    });
    for (const step of recording.steps) {
      if (step.command.type === "move" && seen.length) break;
      const response = await host.run(step.command);
      if (!response.ok) await watcher.run(step.command);
      await settle(host, watcher);
    }
    expect(seen.length).toBeGreaterThan(0);
    const [first] = seen;
    // Before the run: the player still stands where the path starts from
    expect(first.from).toBeDefined();
    expect(first.from).not.toEqual(
      (first.path as { x: number; y: number }[]).at(-1)
    );
  }, 120_000);
});

describe("lockstep sessions send before they animate", () => {
  it("delivers a command to the other engine while the acting screen is still playing it out", async () => {
    const { recording, hostGame, guestGame, host, guest, resyncs } =
      await pair(4242);
    // The host's screen takes as long as it likes to play a command out;
    // `release` ends the stall.
    const realExecute = hostGame.execute.bind(hostGame);
    let stalling = false;
    let release: (() => void) | null = null;
    hostGame.execute = async (command: unknown) => {
      if (stalling) await new Promise<void>((resolve) => (release = resolve));
      return realExecute(command);
    };

    let checked = false;
    for (const step of recording.steps) {
      stalling = !checked;
      release = null;
      const guestBefore = stateChecksum(guestGame);
      const running = host.run(step.command);
      await settle(guest);
      if (!checked && release) {
        // The host's engine has not run it yet, but the guest's already has
        expect(stateChecksum(hostGame)).toBe(guestBefore);
        expect(stateChecksum(guestGame)).not.toBe(guestBefore);
        checked = true;
        stalling = false;
        (release as () => void)();
      }
      const response = await running;
      if (!response.ok && /not-your|host-only/.test(response.reason ?? ""))
        await guest.run(step.command);
      await settle(host, guest);
      expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
      if (checked) break;
    }
    expect(checked).toBe(true);
    expect(resyncs).toEqual({ host: 0, guest: 0 });
  }, 120_000);

  it("keeps both engines level when the acting engine refuses a command it already sent", async () => {
    const { recording, hostGame, guestGame, host, guest, resyncs } =
      await pair(4242);
    let refused: { ok: boolean; reason?: string } | null = null;
    for (const step of recording.steps) {
      const command = step.command;
      if (command.type === "move" && step.ok && !refused) {
        // The coach owns the player and the turn, so the gate lets it out.
        // The engine refuses a path off the pitch, on both screens.
        const offPitch = await host.run({
          ...command,
          path: [{ x: -3, y: -3 }],
        });
        if (offPitch.ok || /not-your|host-only/.test(offPitch.reason ?? "")) {
          // The guest's move: try the same on that side
          refused = null;
        } else {
          refused = offPitch;
        }
        await settle(host, guest);
        expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
      }
      await play(host, guest, command);
      await settle(host, guest);
      expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
      if (refused) break;
    }
    expect(refused?.ok).toBe(false);
    expect(resyncs).toEqual({ host: 0, guest: 0 });
  }, 120_000);

  it("heals a lost settled message with a resync, as any lost message", async () => {
    const { recording, hostGame, guestGame, hostEnd, host, guest, resyncs } =
      await pair(77);
    const realSend = hostEnd.send.bind(hostEnd);
    let dropped = false;
    hostEnd.send = async (envelope: Envelope) => {
      if (!dropped && envelope.kind === "settled") {
        dropped = true;
        return;
      }
      await realSend(envelope);
    };
    for (const step of recording.steps.slice(0, 80)) {
      await play(host, guest, step.command);
      await settle(host, guest);
    }
    hostEnd.send = realSend;
    await settle(host, guest);
    expect(dropped).toBe(true);
    expect(resyncs.guest + resyncs.host).toBeGreaterThan(0);
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
  }, 120_000);
});
