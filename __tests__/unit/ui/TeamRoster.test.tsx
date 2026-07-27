import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamRoster } from "../../../src/ui/components/TeamBuilder/TeamRoster";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

/**
 * Team Builder readability (overhaul-team-lifecycle-management,
 * team-lifecycle-modes: "Team-builder roster information remains
 * readable"). jsdom has no real layout engine, so this checks the things
 * that are actually verifiable in a component test: no miniature
 * (10px-class) text is rendered for critical roster information, and the
 * table is wrapped for horizontal scrolling rather than assuming every
 * column fits — the narrow-viewport fallback this requirement calls for.
 */
describe("TeamRoster readability", () => {
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
  });

  it("renders roster rows without shrinking critical text to miniature sizes", async () => {
    const team = new TeamTestBuilder().withPlayers(7).build();

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamRoster
            team={team}
            onFirePlayer={() => {}}
            onReorderPlayers={() => {}}
          />
        </MemoryRouter>
      );
    });

    // No element uses an arbitrary sub-body text size (e.g. text-[10px]).
    const miniature = container.querySelectorAll('[class*="text-[10px]"]');
    expect(miniature.length).toBe(0);
    const microscopic = container.querySelectorAll('[class*="text-[9px]"]');
    expect(microscopic.length).toBe(0);

    // Player names render at the normal body scale, not a shrunk one.
    const firstPlayerName = container.querySelector(
      `button[title="View player development page"]`
    );
    expect(firstPlayerName).toBeTruthy();
    expect(firstPlayerName?.closest("td")?.className).toContain("text-base");
  });

  it("wraps the roster table so it scrolls horizontally instead of clipping", async () => {
    const team = new TeamTestBuilder().withPlayers(11).build();

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamRoster
            team={team}
            onFirePlayer={() => {}}
            onReorderPlayers={() => {}}
          />
        </MemoryRouter>
      );
    });

    const scrollWrapper = container.querySelector(".overflow-x-auto");
    expect(scrollWrapper).toBeTruthy();
    expect(scrollWrapper?.querySelector("table")).toBeTruthy();

    // Header and row cell counts share the same column tracks (colgroup).
    const cols = container.querySelectorAll("colgroup col");
    const headerCells = container.querySelectorAll("thead th");
    expect(cols.length).toBe(headerCells.length);
  });
});
