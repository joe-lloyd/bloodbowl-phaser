/**
 * What happens to an online match when one coach's page reloads, or when
 * the message log hands two envelopes over in the wrong order.
 *
 * Every page load builds a fresh Host/GuestSession under the same uid, so
 * the other side sees a sender whose seq numbers start again at 1. And
 * Firestore orders the message log by `ts`, breaking ties by random doc id,
 * so two envelopes stamped in the same millisecond can arrive swapped.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { CommandResponse } from "../../src/headless/protocol";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { HostSession } from "../../src/network/HostSession";
import { GuestSession } from "../../src/network/GuestSession";
import {
  createInMemoryTransportPair,
  Transport,
} from "../../src/network/transport";
import { Envelope } from "../../src/network/envelope";

const guestToMove: Scenario = {
  id: "online-session-recovery",
  name: "Guest's turn",
  description: "",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 8, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
    activeTeam: "team2",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 15, y: 5 },
  },
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A hung promise fails the test instead of hitting vitest's timeout. */
function within<T>(promise: Promise<T>, ms = 500): Promise<T | "timed-out"> {
  return Promise.race([
    promise,
    new Promise<"timed-out">((resolve) =>
      setTimeout(() => resolve("timed-out"), ms)
    ),
  ]);
}

function host(transport: Transport, game: HeadlessGame) {
  return new HostSession({
    transport,
    game,
    hostTeamId: game.ctx.team1.id,
    guestTeamId: game.ctx.team2.id,
    selfId: "host-uid",
  });
}

afterEach(() => vi.restoreAllMocks());

describe("online session recovery", () => {
  it("a guest that reloads mid-match can still play", async () => {
    const game = new HeadlessGame({ scenario: guestToMove, seed: 5 });
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const hostSession = host(hostEnd, game);

    const before = new GuestSession({
      transport: guestEnd,
      selfId: "guest-uid",
    });
    await before.sendHello();
    await before.sendChat("one", "Guest");
    await before.sendChat("two", "Guest");
    await settle();
    before.close();

    // The reloaded page: same coach, fresh session, seq starts at 1 again
    const resyncs: unknown[] = [];
    const after = new GuestSession({
      transport: guestEnd,
      selfId: "guest-uid",
      onResync: (payload) => resyncs.push(payload),
    });
    await after.sendHello();
    const response = await within(after.sendCommand({ type: "end-turn" }));

    expect(response).not.toBe("timed-out");
    expect((response as CommandResponse).ok).toBe(true);
    expect(game.ctx.gameService.getState().activeTeamId).toBe(
      game.ctx.team1.id
    );
    expect(resyncs).toHaveLength(1);
    hostSession.close();
    after.close();
  });

  it("a guest keeps playing after the host's page reloads", async () => {
    const game = new HeadlessGame({ scenario: guestToMove, seed: 5 });
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const resyncs: unknown[] = [];
    const guest = new GuestSession({
      transport: guestEnd,
      selfId: "guest-uid",
      onResync: (payload) => resyncs.push(payload),
    });

    const before = host(hostEnd, game);
    await before.sendHello();
    await before.sendChat("one", "Host");
    await before.sendChat("two", "Host");
    await settle();
    before.close();
    const resyncsBefore = resyncs.length;

    const after = host(hostEnd, game);
    await after.sendHello();
    await settle();
    // The guest asked the new host for its state rather than trusting
    // whatever it last saw from the old one
    expect(resyncs).toHaveLength(resyncsBefore + 1);

    const response = await within(guest.sendCommand({ type: "end-turn" }));
    expect(response).not.toBe("timed-out");
    expect((response as CommandResponse).ok).toBe(true);
    after.close();
    guest.close();
  });

  it("a guest command the old host never answered is released when the host comes back", async () => {
    const game = new HeadlessGame({ scenario: guestToMove, seed: 5 });
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const guest = new GuestSession({
      transport: guestEnd,
      selfId: "guest-uid",
    });

    // No host is listening: the command is written and never answered
    const orphan = guest.sendCommand({ type: "end-turn" });
    await settle();

    const restarted = host(hostEnd, game);
    await restarted.sendHello();
    const response = await within(orphan);

    expect(response).not.toBe("timed-out");
    expect((response as CommandResponse).ok).toBe(false);
    restarted.close();
    guest.close();
  });

  it("two envelopes stamped in the same millisecond still arrive in send order", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const sent: Envelope[] = [];
    const wire: Transport = {
      async send(envelope) {
        sent.push(envelope);
      },
      subscribe: () => () => {},
      close() {},
    };
    const guest = new GuestSession({ transport: wire, selfId: "guest-uid" });

    await guest.sendChat("first", "Guest");
    await guest.sendChat("second", "Guest");
    void guest.sendCommand({ type: "end-turn" });

    // Firestore orders by ts, then by random doc id: equal stamps can swap
    const stamps = sent.map((envelope) => envelope.ts);
    expect(new Set(stamps).size).toBe(stamps.length);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
    guest.close();
  });

  it("frees the host's event stream as soon as its own command has run, not after the network send", async () => {
    const game = new HeadlessGame({ scenario: guestToMove, seed: 5 });
    let delivered = () => {};
    const slowWire: Transport = {
      // A write to Firestore that has not come back yet
      send: () => new Promise((resolve) => (delivered = resolve)),
      subscribe: () => () => {},
      close() {},
    };
    const calls: string[] = [];
    const session = new HostSession({
      transport: slowWire,
      game,
      hostTeamId: game.ctx.team1.id,
      guestTeamId: game.ctx.team2.id,
      selfId: "host-uid",
      onExecuteStart: () => calls.push("start"),
      onExecuteEnd: () => calls.push("end"),
    });

    const done = session.executeLocal({ type: "state" });
    await settle();
    // Anything the engine emits while the send is in flight must still be
    // broadcast, so the pause has to be over by now
    expect(calls).toEqual(["start", "end"]);
    delivered();
    await done;
    session.close();
  });
});
