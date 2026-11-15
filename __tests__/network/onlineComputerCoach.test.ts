import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnlineMatch, OnlineMatch } from "../../src/network/OnlineMatch";
import {
  createInMemoryTransportPair,
  Transport,
} from "../../src/network/transport";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { serializeGameState } from "../../src/headless/serialization";
import { HeadlessCommand } from "../../src/headless/protocol";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { DEFAULT_SETTINGS, LobbyDoc } from "../../src/firebase/lobby";
import { drawsFor } from "../../src/game/presentation/screenSettled";
import { whenEngineQuiet } from "../../src/game/core/GameFlowManager";

vi.mock("../../src/firebase/lobby", async (load) => ({
  ...(await load<typeof import("../../src/firebase/lobby")>()),
  persistMatch: async () => {},
}));

const matches: OnlineMatch[] = [];
afterEach(() => {
  matches.splice(0).forEach((match) => match.close());
  ServiceContainer.reset();
});

function matchPosition(
  computer: "host" | "guest" = "host",
  scoring = false
): LobbyDoc {
  const blockers = scoring
    ? [{ playerIndex: 0, x: 17, y: 5 }]
    : [
        { playerIndex: 0, x: 7, y: 5 },
        { playerIndex: 1, x: 7, y: 4 },
        { playerIndex: 2, x: 7, y: 6 },
      ];
  const carrier = [{ playerIndex: 0, x: scoring ? 3 : 8, y: 5 }];
  const game = new HeadlessGame({
    seed: 8,
    scenario: {
      id: "online-computer-block",
      name: "Online computer block",
      description: "The Orcs can block an adjacent ball carrier safely.",
      setup: {
        team1Roster: computer === "host" ? "Orc" : "Human",
        team2Roster: computer === "guest" ? "Orc" : "Human",
        team1Placements: computer === "host" ? blockers : carrier,
        team2Placements: computer === "guest" ? blockers : carrier,
        activeTeam: computer === "host" ? "team1" : "team2",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: scoring ? 17 : 8, y: 5 },
      },
    },
  });
  return {
    code: "BOTBLOCK",
    hostUid: "host",
    guestUid: "guest",
    status: "active",
    settings: { ...DEFAULT_SETTINGS },
    snapshot: game.snapshot(),
    resume: {
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
      applied: 0,
    },
    players: {
      host: {
        uid: "host",
        displayName: "Computer",
        ready: true,
        team: game.ctx.team1,
      },
      guest: {
        uid: "guest",
        displayName: "Human",
        ready: true,
        team: game.ctx.team2,
      },
    },
    createdAt: null,
  };
}

function connect(
  lobby: LobbyDoc,
  uid: string,
  transport: Transport,
  computer = false
) {
  const bus = new EventBus();
  // Stand in for the board finishing a scoring run or bounce animation.
  const acknowledge = ({ presentationId }: { presentationId?: string }) => {
    if (presentationId)
      queueMicrotask(() =>
        bus.emit(GameEventNames.UI_PresentationAcknowledged, {
          id: presentationId,
        })
      );
  };
  bus.on(GameEventNames.PlayerMoved, acknowledge);
  bus.on(GameEventNames.PassFumbled, acknowledge);
  const match = createOnlineMatch({
    lobby: structuredClone(lobby),
    user: {
      uid,
      displayName: uid,
      email: null,
      emailVerified: true,
      photoURL: null,
    },
    eventBus: bus,
    transport,
    seed: 8,
    ...(computer ? { computer: { pace: 0 } } : {}),
  });
  matches.push(match);
  const service = ServiceContainer.getInstance().gameService;
  const snapshot = () =>
    serializeGameState(service.getState(), Object.values(match.teams));
  return { match, bus, snapshot };
}

function recordCommands(transport: Transport): HeadlessCommand[] {
  const commands: HeadlessCommand[] = [];
  const send = transport.send.bind(transport);
  transport.send = async (envelope) => {
    if (envelope.kind === "command") commands.push(envelope.payload.command);
    await send(envelope);
  };
  return commands;
}

describe("the online computer coach", () => {
  it.each(["host", "guest"] as const)(
    "the %s blocks and resolves its dice over the wire",
    async (side) => {
      const lobby = matchPosition(side);
      const [hostEnd, guestEnd] = createInMemoryTransportPair();
      const ownEnd = side === "host" ? hostEnd : guestEnd;
      const peerEnd = side === "host" ? guestEnd : hostEnd;
      const sent = recordCommands(ownEnd);
      const peer = connect(lobby, side === "host" ? "guest" : "host", peerEnd);
      const bot = connect(lobby, side, ownEnd, true);
      bot.bus.emit(GameEventNames.GameStateRestored);

      await vi.waitFor(
        () => {
          expect(sent.map((command) => command.type)).toContain(
            "choose-follow-up"
          );
        },
        { timeout: 3000 }
      );
      bot.match.setClockPaused("timeout");
      await vi.waitFor(() => expect(bot.snapshot()).toEqual(peer.snapshot()));

      expect(sent).toContainEqual(
        expect.objectContaining({ type: "declare-action", action: "block" })
      );
      expect(sent).toContainEqual(expect.objectContaining({ type: "block" }));
      expect(sent).toContainEqual(
        expect.objectContaining({ type: "choose-block-result" })
      );
      expect(sent).toContainEqual(
        expect.objectContaining({ type: "choose-push-direction" })
      );
    }
  );

  it.each(["pause", "close"] as const)(
    "does not send a delayed action after %s",
    async (stop) => {
      const [hostEnd, guestEnd] = createInMemoryTransportPair();
      const sent = recordCommands(hostEnd);
      const lobby = matchPosition();
      connect(lobby, "guest", guestEnd);
      const bot = connect(lobby, "host", hostEnd, true);
      let release = () => {};
      const drawing = new Promise<void>((resolve) => {
        release = resolve;
      });
      let draws = 0;
      const unbind = drawsFor(bot.bus, () => {
        draws++;
        return drawing;
      });
      bot.bus.emit(GameEventNames.GameStateRestored);
      try {
        await vi.waitFor(() => expect(draws).toBeGreaterThan(0));
        if (stop === "pause") bot.match.setClockPaused("timeout");
        else bot.match.close();
        release();
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(sent).toEqual([]);
      } finally {
        release();
        unbind();
      }
    }
  );

  it("leaves an ordinary human-controlled online match idle", async () => {
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const lobby = matchPosition();
    connect(lobby, "guest", guestEnd);
    const host = connect(lobby, "host", hostEnd);
    const before = host.snapshot();
    host.bus.emit(GameEventNames.GameStateRestored);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(host.snapshot()).toEqual(before);
  });

  it("finishes a safe scoring run and sends the same score to the peer", async () => {
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const lobby = matchPosition("host", true);
    const peer = connect(lobby, "guest", guestEnd);
    const bot = connect(lobby, "host", hostEnd, true);
    bot.bus.emit(GameEventNames.GameStateRestored);
    await vi.waitFor(
      () => {
        expect(bot.snapshot().score[bot.match.myTeamId]).toBe(1);
      },
      { timeout: 3000 }
    );
    bot.match.setClockPaused("timeout");
    await whenEngineQuiet();
    await vi.waitFor(() => expect(bot.snapshot()).toEqual(peer.snapshot()));
  }, 15_000);
});
