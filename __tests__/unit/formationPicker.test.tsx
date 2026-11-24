import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormationManager } from "../../src/game/managers/FormationManager";
import { FormationPicker } from "../../src/ui/components/hud/FormationPicker";
import { fixtureValue } from "../../src/testing/fixtureValue";

describe("FormationPicker", () => {
  let container: HTMLDivElement;
  let root: Root;
  let picked: string[];
  const manager = new FormationManager();

  const options = () => [
    ...document.querySelectorAll<HTMLButtonElement>("[role=option]"),
  ];
  const trigger = () =>
    fixtureValue(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="formation-menu"]'
      )
    );
  const press = (key: string) => { act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true })
      );
    }); };
  const open = (isTeam1: boolean, kicking: boolean) => {
    act(() => {
      root.render(
        <FormationPicker
          formations={manager.listAllFormations("Human:left", isTeam1)}
          selected="Balanced"
          isTeam1={isTeam1}
          kicking={kicking}
          disabled={false}
          onPick={(name) => picked.push(name)}
        />
      );
    });
    act(() => {
      trigger().click();
    });
  };
  const dotXs = (name: string) =>
    [
      ...fixtureValue(
        options().find((option) => option.textContent === name)
      ).querySelectorAll("circle"),
    ].map((dot) => Number(dot.getAttribute("cx")));

  beforeEach(() => {
    localStorage.clear();
    picked = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("lists this role's setups first and the saved ones last", () => {
    manager.saveFormation(
      "Human:left",
      [{ playerId: "0", x: 6, y: 5 }],
      "My Wall"
    );
    open(true, false);
    expect(options().map((option) => option.textContent)).toEqual([
      "Balanced",
      "Spread",
      "Bunker",
      "Receive: Wedge",
      "Receive: Full line",
      "Receive: Flank",
      "Kick: Blitz line",
      "Kick: Press",
      "Kick: Screen",
      "My Wall",
    ]);
    expect(dotXs("My Wall")).toEqual([6.5]);
  });

  it("draws every player on the side that team sets up on", () => {
    open(true, true);
    expect(dotXs("Bunker")).toEqual([6.5, 6.5, 6.5, 5.5, 5.5, 4.5, 2.5]);
    act(() => {
      trigger().click();
    });
    open(false, true);
    expect(dotXs("Bunker")).toEqual([
      13.5, 13.5, 13.5, 14.5, 14.5, 15.5, 17.5,
    ]);
  });

  it("moves with the arrow keys, closes on Escape and picks on a press", () => {
    open(true, true);
    expect(document.activeElement?.textContent).toBe("Balanced");
    press("ArrowRight");
    press("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Kick: Press");
    press("Escape");
    expect(options()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());

    act(() => {
      trigger().click();
    });
    act(() => {
      fixtureValue(
        options().find((option) => option.textContent === "Spread")
      ).click();
    });
    expect(picked).toEqual(["Spread"]);
    expect(options()).toHaveLength(0);
  });

  it.each([
    { panelLeft: 336, screen: 640, left: 16, width: 456 },
    { panelLeft: 976, screen: 1280, left: 496, width: 456 },
    { panelLeft: 120, screen: 400, left: 16, width: 368 },
  ])(
    "stays on a $screen pixel screen, above the HUD",
    ({ panelLeft, screen, left, width }) => {
      vi.stubGlobal("innerWidth", screen);
      vi.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect"
      ).mockReturnValue(new DOMRect(panelLeft, 0, 264, 60));
      open(true, true);
      const grid = fixtureValue(
        document.querySelector<HTMLElement>('[data-testid="formation-grid"]')
      );
      expect(grid.style.left).toBe(`${String(left)}px`);
      expect(grid.style.width).toBe(`${String(width)}px`);
      expect(grid.className).toContain("z-[1001]");
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  );
});
