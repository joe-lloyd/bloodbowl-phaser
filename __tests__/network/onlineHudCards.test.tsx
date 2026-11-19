import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOnlineMatch,
  type OnlineMatch,
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
import { type Scenario } from "../../src/types/Scenario";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type LobbyDoc, DEFAULT_SETTINGS } from "../../src/firebase/lobby";
import { HalfTimeCard } from "../../src/ui/components/hud/HalfTimeCard";
import { TurnCatchUpCard } from "../../src/ui/components/hud/TurnCatchUpCard";

vi.mock("../../src/firebase/lobby", async (load) => ({
  ...(await load<typeof import("../../src/firebase/lobby")>()),
  persistMatch: async () => {},
}));

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
  team1.players.forEach((p) => (p.playerName = `Human ${String(p.number)}`));
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
    user: {
      uid: "host-uid",
      displayName: "Host",
      email: null,
      emailVerified: false,
      photoURL: null,
    },
    eventBus: bus,
    transport: createInMemoryTransportPair()[0],
    seed: 3,
  });
  setActiveOnlineMatch(match);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <>
        <HalfTimeCard eventBus={bus} />
        <TurnCatchUpCard eventBus={bus} />
      </>
    );
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
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
    const player = fixtureValue(
      ServiceContainer.getInstance().gameService.getPlayerById(
        fixtureValue(game.ctx.team1.players[0]).id
      )
    );
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

const ENGINE_ONLY = [
  "addTouchdown",
  "announceFullTime",
  "awaitingSecondAction",
  "biteBeforeBallAction",
  "blockPlayer",
  "castSportsWizards",
  "chargeDeclareAction",
  "commitBlockReplacement",
  "couldScoreWithoutDice",
  "draftListInventory",
  "endHalf",
  "getOrCreateInducementSession",
  "getScore",
  "handleTurnEnding",
  "holdForSecondAction",
  "offerSportsEspionage",
  "onPlayerDowned",
  "passBall",
  "playerAction",
  "resolveBallPlacement",
  "rollFanFactors",
  "rollMasterChefs",
  "setCoinFlipWinner",
  "sweepChomped",
  "takeStalling",
  "takeUnsatedBloodlust",
  "updateDedicatedFans",
  "whenSettled",
];

it("NetworkedGameService offers every GameService method the HUD can call", () => {
  const networked = new Set([
    ...Object.getOwnPropertyNames(NetworkedGameService.prototype),
    ...Object.getOwnPropertyNames(ServiceContainer.getInstance().gameService),
  ]);
  const missing = Object.getOwnPropertyNames(GameService.prototype).filter(
    (name) => !networked.has(name) && !ENGINE_ONLY.includes(name)
  );
  expect(missing).toEqual([]);
});
