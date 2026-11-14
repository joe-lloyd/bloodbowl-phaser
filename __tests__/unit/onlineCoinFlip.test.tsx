import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { OnlineCoinFlip } from "../../src/ui/pages/OnlineCoinFlip";
import type { LobbyDoc } from "../../src/firebase/lobby";
import type { OnlineMatch } from "../../src/network/OnlineMatch";

// A coin that lands when the test says so, and the side it was thrown on
const coins = vi.hoisted(
  () => [] as { side: number; land: () => void; stop: () => void }[]
);
vi.mock("../../src/ui/dice/diceScene", () => ({
  playRoll: (_host: HTMLElement, roll: { side: number }) => {
    let land = () => {};
    const landed = new Promise<number[]>(
      (resolve) => (land = () => resolve([roll.side]))
    );
    const stop = vi.fn();
    coins.push({ side: roll.side, land, stop });
    return { landed, mark: vi.fn(), hurry: vi.fn(), onPick: vi.fn(), stop };
  },
}));

// A short wait for a coin that never lands
vi.mock("../../src/game/presentation/diceWatch", async (original) => ({
  ...(await original<object>()),
  DIE_LANDING_TIMEOUT_MS: 300,
}));

vi.mock("../../src/firebase/lobby", () => ({
  setCoinFlipReady: vi.fn(),
  setCoinFlipWinner: vi.fn(),
  setCoinFlipChoice: vi.fn(),
}));

vi.mock("../../src/services/ServiceContainer", () => {
  const teams = [
    {
      id: "home",
      name: "Reikland Reavers",
      rosterName: "Human",
      colors: { primary: 0xaa2222, secondary: 0xffffff },
      players: [],
    },
    {
      id: "away",
      name: "Gouged Eye",
      rosterName: "Orc",
      colors: { primary: 0x2244aa, secondary: 0xffffff },
      players: [],
    },
  ];
  const gameService = {
    getActiveTeamId: () => "home",
    getTeam: (id: string) => teams.find((team) => team.id === id),
    getTeams: () => teams,
    getSubPhase: () => "INTRO",
  };
  return {
    ServiceContainer: {
      isInitialized: () => true,
      getInstance: () => ({ gameService }),
    },
  };
});

const match = {
  role: "guest",
  myTeamId: "away",
  opponentName: "Coach-HOST",
  teams: {
    team1: { id: "home", name: "Reikland Reavers" },
    team2: { id: "away", name: "Gouged Eye" },
  },
} as unknown as OnlineMatch;

const lobby = (coinFlip: LobbyDoc["coinFlip"]) =>
  ({ coinFlip }) as unknown as LobbyDoc;

const mount = async (first: LobbyDoc) => {
  coins.length = 0;
  const bus = new EventBus();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (next: LobbyDoc) =>
    act(async () =>
      root.render(
        <OnlineCoinFlip
          code="ABC123"
          lobby={next}
          match={match}
          eventBus={bus}
        />
      )
    );
  await render(first);
  return {
    render,
    text: () => container.textContent ?? "",
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

const tick = (ms: number) =>
  act(() => new Promise((resolve) => setTimeout(resolve, ms)));

describe("online coin toss", () => {
  it("flips the coin onto the winner on both screens before the choice", async () => {
    const card = await mount(lobby({ hostReady: true, guestReady: true }));
    expect(card.text()).toContain("Flipping");

    // The host's result arrives from the lobby
    await card.render(
      lobby({ hostReady: true, guestReady: true, winnerTeamId: "home" })
    );
    await tick(20);
    expect(coins.map((coin) => coin.side)).toEqual([1]);
    expect(card.text()).not.toContain("wins the toss");

    await act(async () => coins[0].land());
    await tick(800);
    expect(card.text()).toContain("Reikland Reavers wins the toss!");
    expect(card.text()).toContain("Coach-HOST is choosing to kick or receive");
    await card.unmount();
  });

  it("names a winner from before a reload without flipping again", async () => {
    const card = await mount(
      lobby({ hostReady: true, guestReady: true, winnerTeamId: "away" })
    );
    await tick(20);
    expect(coins).toEqual([]);
    expect(card.text()).toContain("Gouged Eye wins the toss!");
    expect(card.text()).toContain("KICK");
    await card.unmount();
  });

  it("names the winner and offers the choice when the coin never lands", async () => {
    const card = await mount(lobby({ hostReady: true, guestReady: true }));
    // The guest wins, and their tab stops drawing frames mid-flip
    await card.render(
      lobby({ hostReady: true, guestReady: true, winnerTeamId: "away" })
    );
    await tick(20);
    expect(coins.length).toBe(1);

    await tick(1100);
    expect(coins[0].stop).toHaveBeenCalled();
    expect(card.text()).toContain("Gouged Eye wins the toss!");
    expect(card.text()).toContain("KICK");
    expect(card.text()).toContain("RECEIVE");
    await card.unmount();
  });
});
