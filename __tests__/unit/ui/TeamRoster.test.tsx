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

/**
 * team-management-layout: "Per-player career statistics are shown on the
 * team detail page, not the overview" — the roster table on the team
 * detail page carries each player's career stats as trailing columns.
 */
describe("TeamRoster career-stat columns", () => {
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

  it("renders GP/TD/CMP/CAS/Kills/MVP headers and a player's career totals", async () => {
    const team = new TeamTestBuilder().withPlayers(2).build();
    team.players[0].careerStats = {
      matches: 5,
      completions: 4,
      interceptions: 1,
      casualties: 3,
      touchdowns: 2,
      mvps: 1,
      kills: 1,
      squaresMoved: 40,
      passesAttempted: 6,
      sppEarned: 12,
    };

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

    const headerLabels = Array.from(
      container.querySelectorAll("thead th")
    ).map((th) => th.textContent);
    expect(headerLabels).toEqual(
      expect.arrayContaining(["GP", "TD", "CMP", "CAS", "Kills", "MVP"])
    );

    const firstRow = container.querySelector("tbody tr");
    const cellTexts = Array.from(firstRow?.querySelectorAll("td") ?? []).map(
      (td) => td.textContent
    );
    expect(cellTexts).toEqual(
      expect.arrayContaining(["5", "2", "4", "3", "1", "1"])
    );
  });

  it("shows zero for a player who has never played a match", async () => {
    const team = new TeamTestBuilder().withPlayers(1).build();
    team.players[0].careerStats = undefined;

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

    const firstRow = container.querySelector("tbody tr");
    const cellTexts = Array.from(firstRow?.querySelectorAll("td") ?? []).map(
      (td) => td.textContent
    );
    // Cost column ("0k") plus six zeroed career-stat columns for a
    // never-played player.
    const zeroCells = cellTexts.filter((text) => text === "0");
    expect(zeroCells.length).toBe(6);
  });
});
