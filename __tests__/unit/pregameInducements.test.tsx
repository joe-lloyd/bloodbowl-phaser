import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pregameGame } from "../utils/pregameGame";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { PregameInducements } from "../../src/ui/components/hud/PregameInducements";
import {
  OnlineMatch,
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
  ServiceContainer.initialize(
    bus,
    game.ctx.team1,
    game.ctx.team2,
    game.ctx.gameService.getState(),
    23,
    () =>
      remote
        ? new NetworkedGameService(
            game.ctx.gameService,
            (command) => game.execute(command),
            () => game.pendingDecision(),
            bus
          )
        : game.ctx.gameService
  );
  if (myTeamId)
    setActiveOnlineMatch({
      myTeamId,
      pendingDecision: () => game.pendingDecision(),
    } as OnlineMatch);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      myTeamId ? (
        <PregameInducements eventBus={bus} />
      ) : (
        <CoinFlipOverlay eventBus={bus} />
      )
    );
  });
  await act(async () =>
    bus.emit(GameEventNames.UI_StartCoinFlip, {
      team1: game.ctx.team1,
      team2: game.ctx.team2,
    })
  );
  return game;
}
const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
    item.textContent?.includes(text)
  )!;
async function click(text: string) {
  const target = button(text);
  expect(target).toBeDefined();
  await act(async () => target.click());
}
/** Both coaches readied up for the weather, which readies the match too. */
async function ready(game: ReturnType<typeof pregameGame>) {
  expect(button("FLIP COIN")).toBeUndefined();
  await act(async () => {
    game.ctx.gameService.readyForWeather("team2");
    game.ctx.gameService.readyForWeather("team1");
  });
}

describe("ready and purchase screens before the coin toss", () => {
  it("walks both local coaches through their purchases in turn before showing the toss", async () => {
    const game = await mount();
    await ready(game);
    // Away has the higher team value, so it buys first
    expect(container.textContent).toContain("Inducements — Away");
    expect(container.textContent).toContain("No petty cash");
    await click("Confirm — no purchases");
    expect(container.textContent).toContain("Inducements — Home");
    const buy = container.querySelector<HTMLButtonElement>(
      '[aria-label="Buy Blitzer\'s Best Kegs"]'
    )!;
    expect(buy.disabled).toBe(false);
    await act(async () => buy.click());
    expect(
      container.querySelector('[aria-label="Blitzer\'s Best Kegs quantity"]')
        ?.textContent
    ).toBe("1");
    expect(button("FLIP COIN")).toBeUndefined();
    await click("Confirm inducements");
    expect(button("FLIP COIN")).toBeDefined();
    expect(game.snapshot().inducements?.inventory[0].quantity).toBe(1);
  });

  it("shows an asynchronous refusal and does not advance or invent a purchase", async () => {
    const game = await mount(true);
    await ready(game);
    await click("Confirm — no purchases");
    const proxy = ServiceContainer.getInstance()
      .gameService as NetworkedGameService;
    // Replace only the network method, preserving real authoritative state and controls.
    proxy.selectInducement = async () => ({
      ok: false,
      errors: ["Connection interrupted. Try again."],
    });
    const buy = container.querySelector<HTMLButtonElement>(
      '[aria-label="Buy Blitzer\'s Best Kegs"]'
    )!;
    await act(async () => buy.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Connection interrupted"
    );
    expect(game.ctx.gameService.getInducementOffer().selections.team1).toEqual(
      []
    );
    expect(button("FLIP COIN")).toBeUndefined();
  });
  it("lets an online coach buy only on their own turn, then shows who is buying", async () => {
    const game = await mount(true, "team2");
    expect(container.textContent).toContain(
      "Waiting for both coaches to ready up"
    );
    await ready(game);
    expect(container.textContent).toContain("Inducements — Away");
    await click("Confirm — no purchases");
    expect(container.textContent).toContain("Home is choosing inducements");
    expect(button("Confirm")).toBeUndefined();
    expect(game.snapshot().pregameInducements?.complete).not.toBe(true);
  });

  it("shows the other coach buying first, with no purchase panel", async () => {
    const game = await mount(true, "team1");
    await ready(game);
    expect(container.textContent).toContain("Away is choosing inducements");
    expect(container.textContent).not.toContain("Inducements — Home");
  });
});
