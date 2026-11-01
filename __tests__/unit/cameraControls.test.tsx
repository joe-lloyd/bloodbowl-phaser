import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CameraControls } from "../../src/ui/components/hud/CameraControls";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";

describe("CameraControls", () => {
  let container: HTMLDivElement;
  let root: Root;
  let bus: EventBus;
  let sent: unknown[];

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    bus = new EventBus();
    sent = [];
    bus.on(GameEventNames.UI_CameraSettingsChanged, (s) => sent.push(s));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const mount = () =>
    act(async () => root.render(<CameraControls eventBus={bus} />));
  const button = (name: string) =>
    [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === name || b.textContent === name
    )!;
  const click = (name: string) => act(async () => button(name).click());
  const zoomText = () =>
    container.querySelector('[aria-live="polite"]')!.textContent;

  it("zooms in and out in steps, within the range", async () => {
    await mount();
    expect(zoomText()).toBe("1.00×");
    expect(button("Zoom out").disabled).toBe(true);

    await click("Zoom in");
    await click("Zoom in");
    expect(zoomText()).toBe("1.50×");
    await click("Zoom out");
    expect(zoomText()).toBe("1.25×");
    expect(sent.at(-1)).toEqual({ zoom: 1.25, follow: "close" });

    for (let i = 0; i < 6; i++) await click("Zoom in");
    expect(zoomText()).toBe("2.00×");
    expect(button("Zoom in").disabled).toBe(true);
  });

  it("returns to the whole pitch on Fit pitch", async () => {
    await mount();
    await click("Zoom in");
    await click("Fit pitch");
    expect(zoomText()).toBe("1.00×");
    expect(sent.at(-1)).toEqual({ zoom: 1, follow: "close" });
  });

  it("switches follow between Off, Light and Close", async () => {
    await mount();
    expect(button("Close").getAttribute("aria-pressed")).toBe("true");

    await click("Off");
    expect(button("Off").getAttribute("aria-pressed")).toBe("true");
    expect(button("Close").getAttribute("aria-pressed")).toBe("false");
    expect(container.textContent).toContain(
      "The camera stays where you put it."
    );
    expect(sent.at(-1)).toEqual({ zoom: 1, follow: "off" });
  });

  it("remembers the settings when it opens again", async () => {
    await mount();
    await click("Zoom in");
    await click("Light");
    await act(async () => root.unmount());

    root = createRoot(container);
    await mount();
    expect(zoomText()).toBe("1.25×");
    expect(button("Light").getAttribute("aria-pressed")).toBe("true");
  });
});
