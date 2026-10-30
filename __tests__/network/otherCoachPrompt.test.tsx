/**
 * A Dodge, Rush or Pick up prompt opens before its command is sent, so the
 * waiting coach used to see nothing while the acting coach decided. The
 * acting side now sends the open prompt on a cosmetic channel, and the
 * waiting coach's decision dock shows it read-only.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOnlineMatch, OnlineMatch } from "../../src/network/OnlineMatch";
import { Envelope } from "../../src/network/envelope";
import {
  createInMemoryTransportPair,
  Transport,
} from "../../src/network/transport";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GameEventNames, StepPrompt } from "../../src/types/events";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { LobbyDoc, DEFAULT_SETTINGS } from "../../src/firebase/lobby";
import { OtherCoachPrompt } from "../../src/ui/components/hud/OtherCoachPrompt";

vi.mock("../../src/firebase/lobby", async (load) => ({
  ...(await load<typeof import("../../src/firebase/lobby")>()),
  persistMatch: async () => {},
}));

const scenario: Scenario = {
  id: "other-coach-prompt",
  name: "Other coach prompt",
  description: "",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 10, y: 5 },
  },
};

let host: HTMLDivElement;
let root: Root;
let bus: EventBus;
let match: OnlineMatch;
let game: HeadlessGame;
/** The guest's end of the wire, played by the test. */
let guestEnd: Transport;
let fromHost: Envelope[];
let guestSeq: number;

beforeEach(async () => {
  game = new HeadlessGame({ scenario, seed: 3 });
  const { team1, team2 } = game.ctx;
  team2.name = "Orc Founders";
  const lobby: LobbyDoc = {
    code: "PROMPT",
    hostUid: "host-uid",
    guestUid: "guest-uid",
    status: "active",
    settings: { ...DEFAULT_SETTINGS },
    snapshot: game.snapshot(),
    players: {
      "host-uid": {
        uid: "host-uid",
        displayName: "Host",
        team: team1,
        ready: true,
      },
      "guest-uid": {
        uid: "guest-uid",
        displayName: "Guest",
        team: team2,
        ready: true,
      },
    },
    createdAt: null,
  };
  const [hostEnd, guest] = createInMemoryTransportPair();
  guestEnd = guest;
  fromHost = [];
  guestSeq = 0;
  guestEnd.subscribe((envelope) => fromHost.push(envelope));
  bus = new EventBus();
  match = createOnlineMatch({
    lobby,
    user: { uid: "host-uid", displayName: "Host", email: null, photoURL: null },
    eventBus: bus,
    transport: hostEnd,
    seed: 3,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<OtherCoachPrompt eventBus={bus} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  match.close();
  ServiceContainer.reset();
});

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

const promptsSent = () =>
  fromHost.flatMap((envelope) =>
    envelope.kind === "prompt" ? [envelope.payload.prompt] : []
  );

const fromGuest = async (prompt: StepPrompt | null) => {
  guestSeq += 1;
  await guestEnd.send({
    kind: "prompt",
    seq: guestSeq,
    from: "guest-uid",
    ts: Date.now(),
    payload: { prompt },
  });
  await flush();
};

const line = () =>
  host.querySelector('[data-testid="other-coach-prompt"]')?.textContent ?? null;

describe("the acting coach's step prompt", () => {
  it("is sent to the other coach while it is open, and cleared when answered", async () => {
    const mover = game.ctx.team1.players[0];
    const step: StepPrompt = {
      playerId: mover.id,
      rolls: [{ type: "dodge", target: 3 }],
      chance: 4 / 6,
    };
    bus.emit(GameEventNames.UI_RequestConfirmation, {
      actionId: "risky-step-1",
      title: "Dodge",
      message: "",
      chooserTeamId: mover.teamId,
      step,
    });
    await flush();
    expect(promptsSent()).toEqual([step]);

    bus.emit(GameEventNames.UI_ConfirmationResult, {
      actionId: "risky-step-1",
      confirmed: true,
    });
    await flush();
    expect(promptsSent()).toEqual([step, null]);
  });

  it("is not sent for a prompt without a step, such as a foul", async () => {
    bus.emit(GameEventNames.UI_RequestConfirmation, {
      actionId: "foul-1",
      title: "Confirm foul",
      message: "",
    });
    await flush();
    expect(promptsSent()).toEqual([]);
  });
});

describe("the waiting coach's decision dock", () => {
  it("shows what the other coach is deciding, read-only, until they answer", async () => {
    const orc = game.ctx.team2.players[0];
    await fromGuest({
      playerId: orc.id,
      rolls: [{ type: "rush", target: 2 }],
      chance: 5 / 6,
    });
    expect(line()).toBe("Orc Founders: Rush 2+ (83%)");
    expect(host.querySelector("button")).toBeNull();

    await fromGuest(null);
    expect(line()).toBeNull();
  });

  it("names both rolls of a Rush and Dodge with their combined chance", async () => {
    const orc = game.ctx.team2.players[0];
    await fromGuest({
      playerId: orc.id,
      rolls: [
        { type: "rush", target: 2 },
        { type: "dodge", target: 3 },
      ],
      chance: (5 / 6) * (4 / 6),
    });
    expect(line()).toBe("Orc Founders: Rush 2+, then Dodge 3+ (56%)");
  });

  it("ignores a prompt that claims a player from the wrong team", async () => {
    const human = game.ctx.team1.players[0];
    await fromGuest({
      playerId: human.id,
      rolls: [{ type: "rush", target: 2 }],
      chance: 5 / 6,
    });
    expect(line()).toBeNull();
  });

  it("clears when the turn passes", async () => {
    const orc = game.ctx.team2.players[0];
    await fromGuest({
      playerId: orc.id,
      rolls: [{ type: "pickup", target: 3 }],
      chance: 4 / 6,
    });
    expect(line()).toContain("Pick up 3+");
    await act(async () =>
      bus.emit(GameEventNames.TurnStarted, {
        teamId: game.ctx.team1.id,
        turnNumber: 2,
      })
    );
    expect(line()).toBeNull();
  });

  it("gives way to the re-roll choice when the roll fails", async () => {
    const orc = game.ctx.team2.players[0];
    await fromGuest({
      playerId: orc.id,
      rolls: [{ type: "dodge", target: 4 }],
      chance: 3 / 6,
    });
    expect(line()).toBe("Orc Founders: Dodge 4+ (50%)");
    await act(async () =>
      bus.emit(GameEventNames.DecisionRequested, {
        type: "reroll",
        playerId: orc.id,
        chooserTeamId: orc.teamId,
        rollKind: "dodge",
        sources: ["team"],
        roll: 2,
        needed: 4,
      })
    );
    expect(line()).toBeNull();
  });

  it("clears once the other coach's move has run here", async () => {
    const orc = game.ctx.team2.players[0];
    await fromGuest({
      playerId: orc.id,
      rolls: [{ type: "dodge", target: 4 }],
      chance: 3 / 6,
    });
    await act(async () =>
      bus.emit(GameEventNames.UI_OtherCoachMoveResolved, { playerId: orc.id })
    );
    expect(line()).toBeNull();
  });
});
