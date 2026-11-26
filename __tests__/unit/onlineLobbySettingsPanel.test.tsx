import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../../src/ui/components/pages/OnlineLobby";
import { DEFAULT_SETTINGS, type LobbySettings } from "../../src/firebase/lobby";

describe("OnlineLobby SettingsPanel — turn timer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  const turnTimerSelect = () => fixtureValue(container.querySelector("select"));

  const render = (
    settings: LobbySettings,
    onChange: (s: LobbySettings) => void
  ) => {
    act(() => {
      root.render(
        <SettingsPanel
          settings={settings}
          readOnly={false}
          onChange={onChange}
        />
      );
    });
  };

  it("offers a 'No time limit' option alongside the existing durations", async () => {
    await render(DEFAULT_SETTINGS, () => {});
    const labels = Array.from(turnTimerSelect().querySelectorAll("option")).map(
      (o) => o.textContent
    );
    expect(labels).toEqual([
      "1 min",
      "1.5 min",
      "2 min",
      "3 min",
      "4 min",
      "No time limit",
    ]);
  });

  it("selecting 'No time limit' reports turnSeconds: 0", async () => {
    let latest: LobbySettings | null = null;
    await render(DEFAULT_SETTINGS, (s) => {
      latest = s;
    });

    const select = turnTimerSelect();
    await act(async () => {
      const nativeSetter = fixtureValue(fixtureValue(Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value"
      )).set);
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

  it("offers no match style choice, even for a lobby that saved Neon", async () => {
    const legacy = { ...DEFAULT_SETTINGS, pitchThemeId: "neon" };
    await render(legacy, () => {});
    expect(container.querySelector('[aria-label="Match style"]')).toBeNull();
    expect(container.textContent).not.toMatch(/neon/i);
    expect(DEFAULT_SETTINGS).not.toHaveProperty("pitchThemeId");
  });

  it("keeps the team value range when the host changes the game type", () => {
    const onChange = vi.fn();
    render({ ...DEFAULT_SETTINGS, teamValue: { min: 450_000, max: 500_000 } }, onChange);
    const street = fixtureValue(
      [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((card) =>
        card.textContent.includes("Street Bowl")
      )
    );
    act(() => {
      street.click();
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ gameType: "street-bowl", teamValue: { min: 450_000, max: 500_000 } })
    );
  });
});
