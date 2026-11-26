import { fixtureValue } from "../../src/testing/fixtureValue";
import { shoppingTeamId } from "../../src/game/inducements/pregame";
import { pregameGame } from "../utils/pregameGame";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOnlineMatch,
  type OnlineMatch,
} from "../../src/network/OnlineMatch";
import {
  createInMemoryTransportPair,
  type Transport,
} from "../../src/network/transport";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { serializeGameState } from "../../src/headless/serialization";
import { type HeadlessCommand } from "../../src/headless/protocol";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import {
  DEFAULT_SETTINGS,
  type LobbyDoc,
  persistMatch,
} from "../../src/firebase/lobby";
import { drawsFor } from "../../src/game/presentation/screenSettled";
import { whenEngineQuiet } from "../../src/game/core/GameFlowManager";

vi.mock("../../src/firebase/lobby", async (load) => ({
  ...(await load<typeof import("../../src/firebase/lobby")>()),
  persistMatch: vi.fn(async () => {}),
}));

const matches: OnlineMatch[] = [];
afterEach(() => {
  for (const match of matches.splice(0)) {
    match.close();
  }
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

  const acknowledge = ({ presentationId }: { presentationId?: string }) => {
    if (presentationId)
      queueMicrotask(() => {
        bus.emit(GameEventNames.UI_PresentationAcknowledged, {
          id: presentationId,
        });
      });
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
    ...(computer && { computer: { pace: 0 } }),
  });
  matches.push(match);
  const service = ServiceContainer.getInstance().gameService;
  const snapshot = () =>
    serializeGameState(service.getState(), Object.values(match.teams));
  const restore = () => {
    bus.emit(GameEventNames.GameStateRestored, service.getState());
  };
  return { match, bus, snapshot, restore };
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
  it("refuses a manual save while pregame choices are unresolved", () => {
    const [end] = createInMemoryTransportPair();
    const { match } = connect(matchPosition(), "host", end);
    const state = ServiceContainer.getInstance().gameService.getState();
    state.pregameInducements = {
      ready: { team1: true, team2: true },
      complete: true,
      resolving: true,
    };
    vi.mocked(persistMatch).mockClear();
    expect(() => {
      match.saveState();
    }).toThrow("Finish pregame choices");
    expect(persistMatch).not.toHaveBeenCalled();
    state.pregameInducements.resolving = false;
    match.saveState();
    expect(persistMatch).toHaveBeenCalledOnce();
  });

  it.each(["host", "guest"] as const)(
    "the %s readies and confirms its own pregame purchases over the wire",
    async (side) => {
      const opening = pregameGame();
      const lobby = matchPosition(side);
      fixtureValue(lobby.players["host"]).team = opening.ctx.team1;
      fixtureValue(lobby.players["guest"]).team = opening.ctx.team2;
      lobby.snapshot = opening.snapshot();
      lobby.resume = {
        rng: opening.ctx.rng.captureState(),
        matchStats: opening.ctx.matchStats.captureState(),
        applied: 0,
      };
      const [hostEnd, guestEnd] = createInMemoryTransportPair();
      const ownEnd = side === "host" ? hostEnd : guestEnd;
      const peerEnd = side === "host" ? guestEnd : hostEnd;
      const sent = recordCommands(ownEnd);
      const human = connect(lobby, side === "host" ? "guest" : "host", peerEnd);
      const bot = connect(lobby, side, ownEnd, true);
      bot.restore();
      const botReady = () =>
        vi.waitFor(() => {
          expect(
            human.snapshot().pregameInducements?.ready[bot.match.myTeamId]
          ).toBe(true);
        });
      const humanReady = async () => {
        expect(
          (
            await human.match.run({
              type: "ready-weather",
              teamId: human.match.myTeamId,
            })
          ).ok
        ).toBe(true);
      };

      if (side === "guest") {
        await botReady();
        await humanReady();
      } else {
        await humanReady();
        await botReady();
      }
      if (side === "guest")
        expect(bot.snapshot().inducements).toBeUndefined();

      if (
        shoppingTeamId(human.snapshot().pregameInducements, [
          "team1",
          "team2",
        ]) === human.match.myTeamId
      )
        await human.match.run({
          type: "confirm-inducements",
          teamId: human.match.myTeamId,
        });
      await vi.waitFor(() => {
        expect(bot.snapshot().pregameInducements?.complete).toBe(true);
      });
      await vi.waitFor(() => {
        expect(bot.snapshot()).toEqual(human.snapshot());
      });
      expect(sent.map((command) => command.type)).toContain("ready-weather");
      expect(
        sent
          .map((command) => command.type)
          .filter((type) => type.endsWith("inducements") || type.endsWith("inducement"))
          .sort((left, right) => left.localeCompare(right))
          .slice(0, 1)
      ).toEqual(side === "host" ? ["confirm-inducements"] : []);
      if (side === "host")
        expect(sent.map((command) => command.type)).toContain(
          "select-inducement"
        );
    }
  );

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
      bot.restore();

      await vi.waitFor(
        () => {
          expect(sent.map((command) => command.type)).toContain(
            "choose-follow-up"
          );
        },
        { timeout: 3000 }
      );
      bot.match.setClockPaused("timeout");
      await vi.waitFor(() => {
        expect(bot.snapshot()).toEqual(peer.snapshot());
      });

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
      bot.restore();
      try {
        await vi.waitFor(() => {
          expect(draws).toBeGreaterThan(0);
        });
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
    host.restore();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(host.snapshot()).toEqual(before);
  });

  it("finishes a safe scoring run and sends the same score to the peer", async () => {
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const lobby = matchPosition("host", true);
    const peer = connect(lobby, "guest", guestEnd);
    const bot = connect(lobby, "host", hostEnd, true);

    const peerNextDrive = new Promise<void>((resolve) => {
      const onPhase = ({ phase }: { phase: GamePhase }) => {
        if (phase !== GamePhase.SETUP) return;
        peer.bus.off(GameEventNames.PhaseChanged, onPhase);
        resolve();
      };
      peer.bus.on(GameEventNames.PhaseChanged, onPhase);
    });
    bot.restore();
    await vi.waitFor(
      () => {
        expect(bot.snapshot().score[bot.match.myTeamId]).toBe(1);
      },
      { timeout: 3000 }
    );
    bot.match.setClockPaused("timeout");
    await peerNextDrive;
    await whenEngineQuiet();
    expect(bot.snapshot().phase).toBe(GamePhase.SETUP);
    await vi.waitFor(() => {
      expect(bot.snapshot()).toEqual(peer.snapshot());
    });
  }, 15_000);
});
