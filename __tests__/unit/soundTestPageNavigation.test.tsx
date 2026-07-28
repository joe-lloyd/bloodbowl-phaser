import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";

/**
 * Covers the sound debug dashboard's "Back to Main Menu" fix: it used to
 * emit `GameEventNames.UI_SceneChange`, an event nothing in the app ever
 * subscribed to (a dead click, per NOTES_FOR_AI.md). It now navigates via
 * react-router's `useNavigate()`, the same mechanism every other page uses
 * (see GameHUD's own "Return to Main Menu").
 */

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { SoundTest } from "../../src/ui/components/pages/SoundTest";

describe("SoundTest page — Back to Main Menu", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    eventBus = new EventBus();
    navigateMock.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("navigates to the main menu route instead of emitting a dead event", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SoundTest eventBus={eventBus} />
        </MemoryRouter>
      );
    });

    const backButton = Array.from(
      container.querySelectorAll("button")
    ).find((button) => button.textContent?.includes("Back to Main Menu"));
    expect(backButton).toBeTruthy();

    await act(async () => {
      backButton!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    expect(navigateMock).toHaveBeenCalledWith("/");
  });
});
