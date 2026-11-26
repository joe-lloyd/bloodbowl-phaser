import { fixtureValue } from "../../src/testing/fixtureValue";
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
  type Transport,
} from "../../src/network/transport";
import { type Envelope } from "../../src/network/envelope";
import { type HeadlessCommand } from "../../src/headless/protocol";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { trackEngineWork } from "../../src/game/core/GameFlowManager";
import { refusalMessage } from "../../src/network/OwnershipGate";

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

async function settle(...sessions: LockstepSession[]) {
  for (let i = 0; i < 3; i++) {
    await tick();
    for (const session of sessions) await session.whenIdle();
  }
}

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
          `diverged at step ${String(index)}: ${step.command.type} by ${side}`
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
    guestGame;
  }, 120_000);

  it("rolls the opening weather on both engines once both coaches are ready", async () => {
    const make = () =>
      new HeadlessGame({
        seed: 8128,
        startingPhase: GamePhase.SETUP,
        startingSubPhase: SubPhase.INTRO,
      });
    const hostGame = make();
    const guestGame = new HeadlessGame({
      seed: 8128,
      startingPhase: GamePhase.SETUP,
      startingSubPhase: SubPhase.INTRO,
      team1: structuredClone(hostGame.ctx.team1),
      team2: structuredClone(hostGame.ctx.team2),
    });
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const ids = {
      hostTeamId: hostGame.ctx.team1.id,
      myTeamId: hostGame.ctx.team1.id,
      peerTeamId: hostGame.ctx.team2.id,
    };
    const desyncs: string[] = [];
    const onDesync = (detail: string) => desyncs.push(detail);
    const host = new LockstepSession({
      ...ids,
      transport: hostEnd,
      game: hostGame,
      selfId: "host-uid",
      onDesync,
    });
    const guest = new LockstepSession({
      ...ids,
      myTeamId: ids.peerTeamId,
      peerTeamId: ids.myTeamId,
      transport: guestEnd,
      game: guestGame,
      selfId: "guest-uid",
      onDesync,
    });
    const rolls: string[] = [];
    hostGame.ctx.eventBus.on(
      GameEventNames.DiceRoll,
      (roll: { rollType: string }) => rolls.push(roll.rollType)
    );

    const [hostEarly, guestReady] = await Promise.all([
      host.run({ type: "ready-weather", teamId: hostGame.ctx.team1.id }),
      guest.run({ type: "ready-weather", teamId: hostGame.ctx.team2.id }),
    ]);
    await settle(host, guest);
    expect(hostEarly).toMatchObject({ ok: false, reason: "not-your-turn" });
    expect(guestReady.ok).toBe(true);

    expect(rolls).toEqual([]);
    expect(hostGame.snapshot().weatherReady).toEqual([hostGame.ctx.team2.id]);
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));

    const forOther = await guest.run({
      type: "ready-weather",
      teamId: hostGame.ctx.team1.id,
    });
    expect(forOther.ok).toBe(false);

    const hostReady = await host.run({
      type: "ready-weather",
      teamId: hostGame.ctx.team1.id,
    });
    await settle(host, guest);

    expect(hostReady.ok).toBe(true);
    expect(desyncs).toEqual([]);
    expect(rolls).toEqual(["Weather"]);
    expect(guestGame.snapshot().weather).toBe(hostGame.snapshot().weather);
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
  });

  it("hands the other coach's move to the watcher before it runs, so the whole path can be drawn", async () => {
    const { recording, guestGame, host, guest, guestEnd } = await pair(4242);
    guest.close();
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
      if (step.command.type === "move" && seen.length > 0) break;
      const response = await host.run(step.command);
      if (!response.ok) await watcher.run(step.command);
      await settle(host, watcher);
    }
    expect(seen.length).toBeGreaterThan(0);
    const [first] = seen;

    expect(fixtureValue(first).from).toBeDefined();
    expect(fixtureValue(first).from).not.toEqual(
      (fixtureValue(first).path as { x: number; y: number }[]).at(-1)
    );
  }, 120_000);
});

describe("lockstep sessions send before they animate", () => {
  it("delivers a command to the other engine while the acting screen is still playing it out", async () => {
    const { recording, hostGame, guestGame, host, guest, resyncs } =
      await pair(4242);

    const realExecute = hostGame.execute.bind(hostGame);
    let stalling = false;
    const releases: (() => void)[] = [];
    hostGame.execute = async (command: unknown) => {
      if (stalling)
        await new Promise<void>((resolve) => releases.push(resolve));
      return realExecute(command);
    };

    let checked = false;
    for (const step of recording.steps) {
      stalling = !checked;
      releases.length = 0;
      const guestBefore = stateChecksum(guestGame);
      const running = host.run(step.command);
      await settle(guest);
      const release = releases[0];
      if (!checked && release) {
        expect(stateChecksum(hostGame)).toBe(guestBefore);
        expect(stateChecksum(guestGame)).not.toBe(guestBefore);
        checked = true;
        stalling = false;
        release();
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
        const offPitch = await host.run({
          ...command,
          path: [{ x: -3, y: -3 }],
        });
        if (offPitch.ok || /not-your|host-only/.test(offPitch.reason ?? "")) {
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

  it("refuses a command as late for the turn when the turn ends while the screen plays out", async () => {
    const { recording, hostGame, guestGame, host, guest, guestEnd, resyncs } =
      await pair(4242);
    const hostTeam = hostGame.ctx.team1.id;
    let late: { ok: boolean; reason?: string } | null = null;
    const sent: string[] = [];
    for (const step of recording.steps) {
      const hostTurn = hostGame.snapshot().activeTeamId === hostTeam;
      if (hostTurn && step.command.type === "declare-action" && step.ok) {
        let finish: () => void = () => {};
        const playing = trackEngineWork(
          new Promise<void>((resolve) => (finish = resolve))
        );
        const click = host.run(step.command);
        await tick();

        await hostGame.execute({ type: "end-turn" });
        await guestGame.execute({ type: "end-turn" });
        const before = stateChecksum(guestGame);
        guestEnd.subscribe((envelope) => sent.push(envelope.kind));
        finish();
        await playing;
        late = await click;
        await settle(host, guest);
        expect(stateChecksum(guestGame)).toBe(before);
        break;
      }
      await play(host, guest, step.command);
      await settle(host, guest);
    }
    expect(late).toMatchObject({ ok: false, reason: "not-your-turn" });
    expect(refusalMessage(fixtureValue(fixtureValue(late).reason))).toBe(
      "Your turn has ended, so that was not played."
    );

    expect(sent).not.toContain("command");
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

describe("a resync during setup", () => {
  it("leaves both engines identical, so every later setup command counts on both", async () => {
    const { recording, hostGame, guestGame, guestEnd, host, guest, resyncs } =
      await pair(4242);
    const setupCommands = new Set([
      "place-player",
      "remove-player",
      "swap-players",
      "apply-formation",
      "confirm-setup",
    ]);

    const realSend = guestEnd.send.bind(guestEnd);
    let dropped: string | null = null;
    guestEnd.send = async (envelope: Envelope) => {
      if (
        !dropped &&
        envelope.kind === "command" &&
        setupCommands.has(envelope.payload.command.type)
      ) {
        dropped = envelope.payload.command.type;
        return;
      }
      await realSend(envelope);
    };
    let afterResync = 0;
    for (const step of recording.steps) {
      const inSetup = hostGame.snapshot().phase === GamePhase.SETUP;
      const before = [host.appliedCommands(), guest.appliedCommands()];
      const { response } = await play(host, guest, step.command);
      await settle(host, guest);
      if (
        resyncs.host > 0 &&
        response.ok &&
        setupCommands.has(step.command.type)
      ) {
        afterResync++;
        expect(host.appliedCommands()).toBe(fixtureValue(before[0]) + 1);
        expect(guest.appliedCommands()).toBe(fixtureValue(before[1]) + 1);
      }
      expect(stateChecksum(hostGame)).toBe(stateChecksum(guestGame));
      if (resyncs.host > 0 && !inSetup) break;
    }
    expect(dropped).not.toBeNull();
    expect(afterResync).toBeGreaterThan(0);
    expect(resyncs).toEqual({ host: 1, guest: 0 });
  }, 120_000);
});
