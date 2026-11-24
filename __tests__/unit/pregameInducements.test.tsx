import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pregameGame } from "../utils/pregameGame";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { PregameInducements } from "../../src/ui/components/hud/PregameInducements";
import {
  type OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { CoinFlipOverlay } from "../../src/ui/components/hud/CoinFlipOverlay";
import { GameEventNames } from "../../src/types/events";
import { EventBus } from "../../src/services/EventBus";
import { NetworkedGameService } from "../../src/network/NetworkedGameService";
vi.mock("../../src/ui/dice/diceScene", () => ({
  coinFaceImage: () => "data:image/png;base64,",
}));

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  setActiveOnlineMatch(null);
  ServiceContainer.reset();
});
async function mount(remote = false, myTeamId?: string) {
  const game = pregameGame();
  const bus = game.ctx.eventBus as EventBus;
  ServiceContainer.initialize({ eventBus: bus, team1: game.ctx.team1, team2: game.ctx.team2, initialState: game.ctx.gameService.getState(), seed: 23, gameServiceFactory: () =>
      remote
        ? new NetworkedGameService({ inner: game.ctx.gameService, dispatch: (command) => game.execute(command), pendingDecision: () => game.pendingDecision(), eventBus: bus })
        : game.ctx.gameService });
  if (myTeamId)
    setActiveOnlineMatch({
      myTeamId,
      pendingDecision: () => game.pendingDecision(),
    } as OnlineMatch);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    fixtureValue(root).render(
      myTeamId ? (
        <PregameInducements eventBus={bus} />
      ) : (
        <CoinFlipOverlay eventBus={bus} />
      )
    );
  });
  await act(async () => {
    bus.emit(GameEventNames.UI_StartCoinFlip, {
      team1: game.ctx.team1,
      team2: game.ctx.team2,
    });
  });
  return game;
}
const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
    item.textContent?.includes(text)
  );
async function click(text: string) {
  const target = fixtureValue(button(text));
  expect(target).toBeDefined();
  await act(async () => {
    target.click();
  });
}

async function ready(game: ReturnType<typeof pregameGame>) {
  expect(button("FLIP COIN")).toBeUndefined();
  await act(async () => {
    game.ctx.gameService.readyForWeather("team2");
    game.ctx.gameService.readyForWeather("team1");
  });
}

describe("ready and purchase screens before the coin toss", () => {
  it("shows the purchases only to the coach who can afford one, then the toss", async () => {
    const game = await mount();
    await ready(game);

    expect(container.textContent).not.toContain("Away");
    expect(container.textContent).toContain("Inducements — Home");
    const buy = fixtureValue(container.querySelector<HTMLButtonElement>(
      '[aria-label="Buy Blitzer\'s Best Kegs"]'
    ));
    expect(buy.disabled).toBe(false);
    await act(async () => {
      buy.click();
    });
    expect(
      container.querySelector('[aria-label="Blitzer\'s Best Kegs quantity"]')
        ?.textContent
    ).toBe("1");
    expect(button("FLIP COIN")).toBeUndefined();
    await click("Confirm inducements");
    expect(button("FLIP COIN")).toBeDefined();
    expect(fixtureValue(game.snapshot().inducements?.inventory[0]).quantity).toBe(1);
  });

  it("shows an asynchronous refusal and does not advance or invent a purchase", async () => {
    const game = await mount(true);
    await ready(game);
    const proxy = ServiceContainer.getInstance()
      .gameService as NetworkedGameService;

    proxy.selectInducement = async () => ({
      ok: false,
      errors: ["Connection interrupted. Try again."],
    });
    const buy = fixtureValue(container.querySelector<HTMLButtonElement>(
      '[aria-label="Buy Blitzer\'s Best Kegs"]'
    ));
    await act(async () => {
      buy.click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Connection interrupted"
    );
    expect(
      game.ctx.gameService.getInducementOffer().selections["team1"]
    ).toEqual([]);
    expect(button("FLIP COIN")).toBeUndefined();
  });
  it("goes straight to the toss when neither coach can afford an inducement", async () => {
    const game = await mount();
    game.ctx.team1.rerolls += 3;
    await ready(game);
    expect(container.textContent).not.toMatch(/inducement/i);
    expect(button("FLIP COIN")).toBeDefined();
    expect(game.snapshot().pregameInducements?.complete).toBe(true);
  });

  it("confirms for a broke coach in an older save, with no inducement screen", async () => {
    const game = await mount(true, "team2");
    await ready(game);
    const state = game.ctx.gameService.getState();
    const offer = fixtureValue(state.pregameInducements?.offer);
    offer.confirmed["team2"] = false;
    const shown: string[] = [];
    const watch = new MutationObserver(() => {
      shown.push(container.textContent);
    });
    watch.observe(container, { childList: true, subtree: true });
    await act(async () => {
      game.ctx.eventBus.emit(GameEventNames.UI_SyncBoard, undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    watch.disconnect();
    expect(state.pregameInducements?.offer?.confirmed["team2"]).toBe(true);
    expect(shown.join()).not.toMatch(/inducement/i);
    expect(container.textContent).toContain("Waiting for Home");
  });

  it("never shows inducements to an online coach who cannot afford one", async () => {
    const game = await mount(true, "team2");
    expect(container.textContent).toContain(
      "Waiting for both coaches to ready up"
    );
    await ready(game);
    expect(container.textContent).toContain("Waiting for Home");
    expect(container.textContent).not.toMatch(/inducement/i);
    expect(button("Confirm")).toBeUndefined();
    expect(game.snapshot().pregameInducements?.complete).not.toBe(true);
  });

  it("offers the online coach who can afford one the purchase panel", async () => {
    const game = await mount(true, "team1");
    await ready(game);
    expect(container.textContent).toContain("Inducements — Home");
  });
});
