import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { OnlineCoinFlip } from "../../src/ui/pages/OnlineCoinFlip";
import type { LobbyDoc } from "../../src/firebase/lobby";
import type { OnlineMatch } from "../../src/network/OnlineMatch";

const coins = vi.hoisted(
  () => new Array<{ side: number; land: () => void; stop: () => void }>()
);
vi.mock("../../src/ui/dice/diceScene", () => ({
  playRoll: (_host: HTMLElement, roll: { side: number }) => {
    let land = () => {};
    const landed = new Promise<number[]>(
      (resolve) =>
        (land = () => {
          resolve([roll.side]);
        })
    );
    const stop = vi.fn();
    coins.push({ side: roll.side, land, stop });
    return { landed, mark: vi.fn(), hurry: vi.fn(), onPick: vi.fn(), stop };
  },
}));

vi.mock("../../src/game/presentation/diceWatch", async (original) => ({
  ...(await original<object>()),
  DIE_LANDING_TIMEOUT_MS: 300,
}));

vi.mock("../../src/firebase/lobby", () => ({
  setCoinFlipReady: vi.fn(),
  setCoinFlipWinner: vi.fn(),
  setCoinFlipChoice: vi.fn(),
}));

const engine = vi.hoisted(() => ({
  state: { weather: "Nice", weatherReady: new Array<string>() },
  readied: new Array<string>(),
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
    getDecisionService: () => ({ pending: () => null }),
    getFlowContext: () => ({
      flowManager: { whenIdle: () => Promise.resolve() },
    }),
    getActiveTeamId: () => "home",
    getTeam: (id: string) => teams.find((team) => team.id === id),
    getTeams: () => teams,
    getSubPhase: () => "INTRO",
    getState: () => engine.state,
    readyForWeather: (teamId: string) => {
      engine.readied.push(teamId);
      return true;
    },
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

const mount = async (first: LobbyDoc, side: OnlineMatch = match) => {
  coins.length = 0;
  const bus = new EventBus();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (next: LobbyDoc) =>
    act(async () => {
      root.render(
        <OnlineCoinFlip
          code="ABC123"
          lobby={next}
          match={side}
          eventBus={bus}
        />
      );
    });
  await render(first);
  return {
    render,
    text: () => container.textContent ?? "",
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
};

const tick = (ms: number) =>
  act(() => new Promise((resolve) => setTimeout(resolve, ms)));

const mountWeather = async (coach: OnlineMatch) => {
  engine.state = { weather: "Nice", weatherReady: [] };
  engine.readied = [];
  coins.length = 0;
  const bus = new EventBus();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <OnlineCoinFlip
        code="ABC123"
        lobby={lobby({})}
        match={coach}
        eventBus={bus}
      />
    );
  });
  return {
    bus,
    text: () => container.textContent ?? "",
    button: (name: string) =>
      [...container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes(name)
      ),
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
};

const host = {
  ...match,
  role: "host",
  myTeamId: "home",
  opponentName: "Coach-GUEST",
} as unknown as OnlineMatch;

describe("online weather", () => {
  it("holds a host's ready until the guest's has arrived", async () => {
    const dialog = await mountWeather(host);
    await act(async () => {
      fixtureValue(dialog.button("READY — ROLL WEATHER")).click();
    });

    expect(engine.readied).toEqual([]);
    expect(dialog.text()).toContain("Waiting for Coach-GUEST to ready up");

    engine.state = { weather: "Nice", weatherReady: ["away"] };
    await act(async () => {
      dialog.bus.emit(GameEventNames.WeatherReady, { teamIds: ["away"] });
    });
    expect(engine.readied).toEqual(["home"]);
    await dialog.unmount();
  });

  it("gives a refused ready back, so the coach can try again", async () => {
    const dialog = await mountWeather(match);
    await act(async () => {
      fixtureValue(dialog.button("READY — ROLL WEATHER")).click();
    });
    expect(engine.readied).toEqual(["away"]);
    expect(dialog.button("READY — ROLL WEATHER")).toBeUndefined();

    await act(async () => {
      dialog.bus.emit(GameEventNames.NetworkCommandRejected, {
        commandType: "ready-weather",
        reason: "not-your-turn",
      });
    });
    await act(async () => {
      fixtureValue(dialog.button("READY — ROLL WEATHER")).click();
    });
    expect(engine.readied).toEqual(["away", "away"]);
    await dialog.unmount();
  });

  it("shows a weather a resync brings in, with no dice event", async () => {
    const dialog = await mountWeather(match);
    expect(dialog.button("READY — ROLL WEATHER")).toBeDefined();

    engine.state = { weather: "Blizzard", weatherReady: ["away", "home"] };
    await act(async () => {
      dialog.bus.emit(GameEventNames.GameStateRestored, engine.state as never);
    });

    expect(dialog.text()).toContain("Blizzard");
    expect(dialog.button("READY — ROLL WEATHER")).toBeUndefined();
    await act(async () => {
      fixtureValue(dialog.button("ON TO THE COIN TOSS")).click();
    });
    expect(dialog.text()).toContain("COIN TOSS");
    await dialog.unmount();
  });

  it("rolls once both coaches are ready, then each reads it before the toss", async () => {
    engine.state = { weather: "Nice", weatherReady: [] };
    engine.readied = [];
    const bus = new EventBus();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    coins.length = 0;
    await act(async () => {
      root.render(
        <OnlineCoinFlip
          code="ABC123"
          lobby={lobby({})}
          match={match}
          eventBus={bus}
        />
      );
    });
    const text = () => container.textContent ?? "";
    const button = (name: string) =>
      [...container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes(name)
      );
    expect(text()).toContain("WEATHER");
    expect(text()).not.toContain("COIN TOSS");

    await act(async () => {
      fixtureValue(button("READY — ROLL WEATHER")).click();
    });
    expect(engine.readied).toEqual(["away"]);
    await act(async () => {
      bus.emit(GameEventNames.WeatherReady, { teamIds: ["away"] });
    });
    expect(text()).toContain("Waiting for Coach-HOST to ready up");

    engine.state = { weather: "Pouring Rain", weatherReady: ["away", "home"] };
    await act(async () => {
      bus.emit(GameEventNames.WeatherReady, { teamIds: ["away", "home"] });
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Weather",
        diceType: "2d6",
        value: [5, 6],
        total: 11,
        description: "Weather: 5 + 6 = 11",
      });
    });
    await tick(20);
    expect(coins.length).toBe(1);
    expect(text()).not.toContain("Rolled 11");
    await act(async () => {
      fixtureValue(coins[0]).land();
    });
    await tick(800);
    expect(text()).toContain("Pouring Rain");
    expect(text()).toContain("Rolled 11");
    expect(container.querySelector("[data-current]")?.textContent).toContain(
      "Pouring Rain"
    );

    await act(async () => {
      fixtureValue(button("ON TO THE COIN TOSS")).click();
    });
    expect(text()).toContain("COIN TOSS");
    expect(button("READY — FLIP COIN")).toBeDefined();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe("online coin toss", () => {
  it("flips the coin onto the winner on both screens before the choice", async () => {
    const card = await mount(lobby({ hostReady: true, guestReady: true }));
    expect(card.text()).toContain("Flipping");

    await card.render(
      lobby({ hostReady: true, guestReady: true, winnerTeamId: "home" })
    );
    await tick(20);
    expect(coins.map((coin) => coin.side)).toEqual([1]);
    expect(card.text()).not.toContain("wins the toss");

    await act(async () => {
      fixtureValue(coins[0]).land();
    });
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

    await card.render(
      lobby({ hostReady: true, guestReady: true, winnerTeamId: "away" })
    );
    await tick(20);
    expect(coins.length).toBe(1);

    await tick(1100);
    expect(fixtureValue(coins[0]).stop).toHaveBeenCalled();
    expect(card.text()).toContain("Gouged Eye wins the toss!");
    expect(card.text()).toContain("KICK");
    expect(card.text()).toContain("RECEIVE");
    await card.unmount();
  });
  it("readies both coaches for the toss after the inducements, before the host writes a winner", async () => {
    engine.state = {
      score: { home: 0, away: 0 },
      weather: "Nice",
      weatherReady: ["away", "home"],
      pregameInducements: { ready: { home: true, away: true }, complete: true },
    };
    const { setCoinFlipReady, setCoinFlipWinner } =
      await import("../../src/firebase/lobby");
    vi.mocked(setCoinFlipWinner).mockClear();
    const view = await mount({ coinFlip: {} } as LobbyDoc, {
      ...match,
      role: "host",
      myTeamId: "home",
    });
    try {
      await tick(20);

      expect(view.text()).toContain("ON TO THE COIN TOSS");
      const on = fixtureValue([...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("ON TO THE COIN TOSS")
      ));
      await act(async () => {
        on.click();
      });
      await tick(20);

      expect(view.text()).toContain("READY — FLIP COIN");
      expect(setCoinFlipWinner).not.toHaveBeenCalled();
      const ready = fixtureValue([...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("READY — FLIP COIN")
      ));
      await act(async () => {
        ready.click();
      });
      expect(setCoinFlipReady).toHaveBeenCalledWith("ABC123", true);

      await view.render({
        coinFlip: { hostReady: true, guestReady: true },
      } as LobbyDoc);
      await tick(20);
      expect(setCoinFlipWinner).toHaveBeenCalledTimes(1);
    } finally {
      await view.unmount();
      engine.state = { weather: "Nice", weatherReady: [] };
    }
  });

  it("does not toss while the new purchase stage is incomplete even if legacy lobby flags are ready", async () => {
    engine.state = {
      score: { home: 0, away: 0 },
      pregameInducements: { ready: { home: true } },
    };
    const view = await mount(
      { coinFlip: { hostReady: true, guestReady: true } } as LobbyDoc,
      { ...match, role: "host" }
    );
    try {
      expect(view.text()).toContain("Waiting for both coaches to ready up");
      const { setCoinFlipWinner } = await import("../../src/firebase/lobby");
      expect(setCoinFlipWinner).not.toHaveBeenCalled();
    } finally {
      await view.unmount();
      engine.state = { weather: "Nice", weatherReady: [] };
    }
  });
});
