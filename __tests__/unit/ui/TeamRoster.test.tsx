import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamRoster } from "../../../src/ui/components/TeamBuilder/TeamRoster";
import {
  TeamBuilder as TeamTestBuilder,
  PlayerBuilder,
} from "../../utils/test-builders";
import {
  SkillType,
  SKILL_DEFINITIONS,
  getSkill,
} from "../../../src/types/Skills";
import { InjuryType } from "../../../src/types/Player";
import { calculateTeamValue } from "../../../src/types/Team";

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

    const headerLabels = Array.from(container.querySelectorAll("thead th")).map(
      (th) => th.textContent
    );
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
    // SPP column plus six zeroed career-stat columns for a never-played
    // player. The value column reads "0k", not "0".
    const zeroCells = cellTexts.filter((text) => text === "0");
    expect(zeroCells.length).toBe(7);
  });
});

/**
 * team-builder-rule-tooltips: "Hovering a rostered player's skill shows its
 * description" / "Multiple skills are each independently hoverable" — each
 * skill on a drafted player is its own hover target carrying only that
 * skill's own description.
 */
describe("TeamRoster skill tooltips", () => {
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

  it("renders each rostered player's skill as its own tooltip trigger with the skill's description", async () => {
    const player = new PlayerBuilder().withNumber(1).build();
    player.skills = [getSkill(SkillType.BLOCK), getSkill(SkillType.DODGE)];
    const team = new TeamTestBuilder().withCustomPlayers([player]).build();

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

    const blockText = SKILL_DEFINITIONS[SkillType.BLOCK].description;
    const dodgeText = SKILL_DEFINITIONS[SkillType.DODGE].description;

    const tooltipPanels = Array.from(
      document.querySelectorAll('[role="tooltip"]')
    ).map((panel) => panel.textContent);

    expect(tooltipPanels).toContain(blockText);
    expect(tooltipPanels).toContain(dodgeText);
    // Independent per-skill tooltips, not a single combined joined string.
    expect(tooltipPanels.some((t) => t === `${blockText} ${dodgeText}`)).toBe(
      false
    );
  });

  /**
   * team-builder-rule-tooltips: "Tabbing to a skill reveals its description"
   * — the tooltip is keyboard-reachable, not mouse-only.
   */
  it("makes each skill's tooltip reachable and revealed by keyboard focus, not just mouse hover", async () => {
    const player = new PlayerBuilder().withNumber(1).build();
    player.skills = [getSkill(SkillType.BLOCK), getSkill(SkillType.DODGE)];
    const team = new TeamTestBuilder().withCustomPlayers([player]).build();

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

    const triggers = Array.from(
      container.querySelectorAll('span[tabindex="0"]')
    );
    expect(triggers.length).toBe(2);

    triggers.forEach((trigger) => {
      // Each trigger owns an aria-describedby pointing at its own
      // role="tooltip" panel, so screen readers announce the right rule.
      const describedBy = trigger.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const panel = document.getElementById(describedBy!);
      expect(panel).toBeTruthy();
      expect(panel?.getAttribute("role")).toBe("tooltip");

      act(() => {
        (trigger as HTMLElement).focus();
      });
      expect(document.activeElement).toBe(trigger);
      // Focus, not just hover, reveals the panel
      expect(panel?.className).toContain("block");
      expect(panel?.className).not.toContain("hidden");
      act(() => {
        (trigger as HTMLElement).blur();
      });
      expect(panel?.className).toContain("hidden");
    });
  });
});

/**
 * Player rows open on click; reordering starts only from the ≡ handle.
 * A whole-row `draggable` swallowed clicks, so coaches could not open a
 * player to see their stats or advance them.
 */
describe("TeamRoster row click and drag handle", () => {
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

  async function renderRoster(
    overrides: {
      onFirePlayer?: (id: string) => void;
      onReorderPlayers?: (source: number, target: number) => void;
      onChooseVeteran?: (id: string) => void;
    } = {}
  ) {
    const team = new TeamTestBuilder().withPlayers(3).build();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/build-team/${team.id}`]}>
          <Routes>
            <Route
              path="/build-team/:teamId"
              element={
                <TeamRoster
                  team={team}
                  onFirePlayer={overrides.onFirePlayer ?? (() => {})}
                  onReorderPlayers={overrides.onReorderPlayers ?? (() => {})}
                  onChooseVeteran={overrides.onChooseVeteran}
                />
              }
            />
            <Route
              path="/build-team/:teamId/player/:playerId"
              element={<PlayerRouteProbe />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
    return team;
  }

  function PlayerRouteProbe() {
    const { playerId } = useParams();
    return <div data-testid="player-page">{playerId}</div>;
  }

  function click(element: Element) {
    act(() => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function dragEvent(type: string, data: Map<string, string>) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        setData: (format: string, value: string) => data.set(format, value),
        getData: (format: string) => data.get(format) ?? "",
        setDragImage: () => {},
        effectAllowed: "",
        dropEffect: "",
      },
    });
    return event;
  }

  it("does not make the whole row draggable, only the ≡ handle", async () => {
    await renderRoster();
    const row = container.querySelector('[data-testid="roster-row-1"]');
    expect(row?.getAttribute("draggable")).toBeNull();
    const handle = row?.querySelector('[data-testid="drag-handle"]');
    expect(handle?.getAttribute("draggable")).toBe("true");
  });

  it("opens the player's page when the row is clicked", async () => {
    const team = await renderRoster();
    const positionCell = container.querySelectorAll(
      '[data-testid="roster-row-2"] td'
    )[2];
    click(positionCell);
    const page = container.querySelector('[data-testid="player-page"]');
    const player = team.players.find((p) => p.number === 2)!;
    expect(page?.textContent).toBe(player.id);
  });

  it("does not open the player when the handle or Fire button is clicked", async () => {
    const fired: string[] = [];
    const team = await renderRoster({ onFirePlayer: (id) => fired.push(id) });
    const row = container.querySelector('[data-testid="roster-row-1"]')!;
    click(row.querySelector('[data-testid="drag-handle"]')!);
    click(row.querySelector('button[title="Fire Player"]')!);
    expect(container.querySelector('[data-testid="player-page"]')).toBeNull();
    expect(fired).toEqual([team.players.find((p) => p.number === 1)!.id]);
  });

  it("reorders when the handle is dragged onto another row, including an empty slot", async () => {
    const moves: [number, number][] = [];
    await renderRoster({
      onReorderPlayers: (source, target) => moves.push([source, target]),
    });
    const data = new Map<string, string>();
    const handle = container.querySelector(
      '[data-testid="roster-row-1"] [data-testid="drag-handle"]'
    )!;
    act(() => {
      handle.dispatchEvent(dragEvent("dragstart", data));
    });
    const emptyRow = container.querySelector('[data-testid="roster-row-9"]')!;
    act(() => {
      emptyRow.dispatchEvent(dragEvent("drop", data));
    });
    expect(moves).toEqual([[1, 9]]);
  });
});

/**
 * Manage Team shows each player's SPP and current value, never their hire
 * cost. Value is cost plus value gained since (playerValue); a player who
 * misses the next game is left out of team value (playsNextGame), and the
 * total row agrees with calculateTeamValue.
 */
describe("TeamRoster SPP and value", () => {
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

  async function renderLeagueTeam() {
    const team = new TeamTestBuilder().withPlayers(3).withRerolls(1).build();
    team.advancementMode = "advanced-league";
    const [skilled, injured, fresh] = team.players;
    skilled.cost = 85_000;
    skilled.teamValue = 20_000; // one Primary skill advancement
    skilled.spp = 4;
    injured.cost = 50_000;
    injured.teamValue = 0;
    injured.spp = 7;
    injured.injuries = [InjuryType.MISS_NEXT_GAME];
    fresh.cost = 50_000;
    fresh.teamValue = 0;
    fresh.spp = 0;

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
    return team;
  }

  const cell = (slot: number, testId: string) =>
    container.querySelector(
      `[data-testid="roster-row-${slot}"] [data-testid="${testId}"]`
    );

  it("has SPP and Value columns and no Cost column", async () => {
    await renderLeagueTeam();
    const headerLabels = Array.from(container.querySelectorAll("thead th")).map(
      (th) => th.textContent
    );
    expect(headerLabels).toEqual(expect.arrayContaining(["SPP", "Value"]));
    expect(headerLabels).not.toContain("Cost");
  });

  it("shows each player's star player points", async () => {
    await renderLeagueTeam();
    expect(cell(1, "player-spp")?.textContent).toBe("4");
    expect(cell(2, "player-spp")?.textContent).toBe("7");
    expect(cell(3, "player-spp")?.textContent).toBe("0");
  });

  it("shows a skilled player's value above their hire cost", async () => {
    await renderLeagueTeam();
    expect(cell(1, "player-value")?.textContent).toBe("105k");
    expect(cell(3, "player-value")?.textContent).toBe("50k");
  });

  it("marks a player who misses the next game as not counted in team value", async () => {
    await renderLeagueTeam();
    const value = cell(2, "player-value")!;
    expect(value.querySelector("s")?.textContent).toBe("50k");
    expect(value.textContent).toContain("Not in TV");
    expect(value.querySelector("[title]")?.getAttribute("title")).toBe(
      "Misses the next game: not counted in team value"
    );
  });

  it("totals the counted player values to the team value", async () => {
    const team = await renderLeagueTeam();
    const total = container.querySelector('[data-testid="roster-value-total"]');
    // 105k + 50k (the injured player is left out) + one 100k re-roll.
    expect(calculateTeamValue(team)).toBe(255_000);
    expect(total?.textContent).toBe(
      "Players 155k + re-rolls & staff 100k = TV 255k"
    );
  });
});
