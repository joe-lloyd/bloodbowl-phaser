/**
 * The "Since your last turn" card and the half time card in an online
 * match, where the HUD reads the game through NetworkedGameService rather
 * than GameService. Both cards once threw on every turn start online,
 * because the networked service had no getTeams.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOnlineMatch,
  OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { NetworkedGameService } from "../../src/network/NetworkedGameService";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { EventBus } from "../../src/services/EventBus";
import { GameService } from "../../src/services/GameService";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GameEventNames } from "../../src/types/events";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { Scenario } from "../../src/types/Scenario";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { LobbyDoc, DEFAULT_SETTINGS } from "../../src/firebase/lobby";
import { HalfTimeCard } from "../../src/ui/components/hud/HalfTimeCard";
import { TurnCatchUpCard } from "../../src/ui/components/hud/TurnCatchUpCard";

vi.mock("../../src/firebase/lobby", async (load) => ({
  ...(await load<typeof import("../../src/firebase/lobby")>()),
  persistMatch: async () => {},
}));

/** The guest's turn, so the host is the waiting coach. */
const guestTurn: Scenario = {
  id: "online-hud-cards",
  name: "Online HUD cards",
  description: "",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
    activeTeam: "team2",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 15, y: 5 },
  },
};

let host: HTMLDivElement;
let root: Root;
let bus: EventBus;
let match: OnlineMatch;
let game: HeadlessGame;

beforeEach(async () => {
  game = new HeadlessGame({ scenario: guestTurn, seed: 3 });
  const { team1, team2 } = game.ctx;
  team1.name = "Reikland Reavers";
  team2.name = "Gouged Eye";
  team1.players.forEach((p) => (p.playerName = `Human ${p.number}`));
  const lobby: LobbyDoc = {
    code: "CARDS",
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
  bus = new EventBus();
  match = createOnlineMatch({
    lobby,
    user: { uid: "host-uid", displayName: "Host", email: null, photoURL: null },
    eventBus: bus,
    transport: createInMemoryTransportPair()[0],
    seed: 3,
  });
  setActiveOnlineMatch(match);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <>
        <HalfTimeCard eventBus={bus} />
        <TurnCatchUpCard eventBus={bus} />
      </>
    )
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  match.close();
  setActiveOnlineMatch(null);
  ServiceContainer.reset();
});

describe("online HUD cards", () => {
  it("the HUD reads the game through the networked service", () => {
    expect(ServiceContainer.getInstance().gameService).toBeInstanceOf(
      NetworkedGameService
    );
  });

  it("shows the waiting coach what the other turn did when their turn starts", async () => {
    const player = ServiceContainer.getInstance().gameService.getPlayerById(
      game.ctx.team1.players[0].id
    )!;
    await act(async () => {
      player.status = PlayerStatus.KO;
      bus.emit(GameEventNames.PlayerStatusChanged, player);
      bus.emit(GameEventNames.TurnStarted, {
        teamId: game.ctx.team1.id,
        turnNumber: 2,
      });
    });
    expect(
      host.querySelector('[aria-label="Since your last turn"]')?.textContent
    ).toContain("Human 1 #1: Knocked out");
  });

  it("shows the half time card when the first half ends", async () => {
    await act(async () => {
      bus.emit(GameEventNames.DriveEnded, {
        reason: "halftime",
        nextKickingTeamId: game.ctx.team2.id,
      });
      bus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.SETUP });
    });
    const card = host.querySelector('[data-testid="half-time-card"]');
    expect(card?.textContent).toContain("Half time");
    expect(card?.textContent).toContain("Reikland Reavers 0 : 0 Gouged Eye");
    expect(card?.textContent).toContain("Gouged Eye kick next");
  });
});

/**
 * GameService methods the networked service does not need: private
 * helpers, and engine-only calls the board never makes through the
 * interface. Anything else GameService offers, the networked service must
 * offer too, or the HUD throws online only.
 */
const ENGINE_ONLY = [
  "addTouchdown",
  "announceFullTime",
  "biteBeforeBallAction",
  "blockPlayer",
  "chargeDeclareAction",
  "commitBlockReplacement",
  "draftListInventory",
  "endHalf",
  "getOrCreateInducementSession",
  "getScore",
  "handleTurnEnding",
  "offerSportsEspionage",
  "onPlayerDowned",
  "passBall",
  "playerAction",
  "resolveBallPlacement",
  "rollMasterChefs",
  "setCoinFlipWinner",
  "sweepChomped",
  "takeUnsatedBloodlust",
  "updateDedicatedFans",
];

it("NetworkedGameService offers every GameService method the HUD can call", () => {
  const networked = new Set(
    Object.getOwnPropertyNames(NetworkedGameService.prototype)
  );
  const missing = Object.getOwnPropertyNames(GameService.prototype).filter(
    (name) => !networked.has(name) && !ENGINE_ONLY.includes(name)
  );
  expect(missing).toEqual([]);
});
