import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../../src/ui/components/pages/OnlineLobby";
import { DEFAULT_SETTINGS, LobbySettings } from "../../src/firebase/lobby";

/**
 * Host-facing match settings panel — covers the "No time limit" turn-timer
 * option added alongside the existing durations (see
 * openspec/changes/add-multiplayer-no-time-limit-option). The synced-clock
 * behavior itself (deadline math) is covered by TurnClock.test.ts.
 *
 * PitchThemePicker renders only <button>s, so the turn-timer <select> is
 * always the first <select> in the panel and the timeout-bank <select> the
 * second.
 */
describe("OnlineLobby SettingsPanel — turn timer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const turnTimerSelect = () =>
    container.querySelectorAll("select")[0] as HTMLSelectElement;

  const render = (settings: LobbySettings, onChange: (s: LobbySettings) => void) =>
    act(() => {
      root.render(
        <SettingsPanel settings={settings} readOnly={false} onChange={onChange} />
      );
    });

  it("offers a 'No time limit' option alongside the existing durations", async () => {
    await render(DEFAULT_SETTINGS, () => {});
    const labels = Array.from(turnTimerSelect().querySelectorAll("option")).map(
      (o) => o.textContent
    );
    expect(labels).toEqual(["1 min", "1.5 min", "2 min", "3 min", "4 min", "No time limit"]);
  });

  it("selecting 'No time limit' reports turnSeconds: 0", async () => {
    let latest: LobbySettings | null = null;
    await render(DEFAULT_SETTINGS, (s) => {
      latest = s;
    });

    const select = turnTimerSelect();
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value"
      )!.set!;
      nativeSetter.call(select, "0");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(latest).not.toBeNull();
    expect((latest as unknown as LobbySettings).turnSeconds).toBe(0);
  });

  it("round-trips turnSeconds: 0 back to the 'No time limit' option being selected", async () => {
    await render({ ...DEFAULT_SETTINGS, turnSeconds: 0 }, () => {});
    expect(turnTimerSelect().value).toBe("0");
  });

  it("still selects a normal duration correctly (no regression)", async () => {
    await render({ ...DEFAULT_SETTINGS, turnSeconds: 90 }, () => {});
    expect(turnTimerSelect().value).toBe("90");
  });
});
