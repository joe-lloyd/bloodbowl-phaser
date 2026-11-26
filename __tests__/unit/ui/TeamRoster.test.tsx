import { fixtureValue } from "../../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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

describe("TeamRoster readability", () => {
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

    const miniature = container.querySelectorAll('[class*="text-[10px]"]');
    expect(miniature.length).toBe(0);
    const microscopic = container.querySelectorAll('[class*="text-[9px]"]');
    expect(microscopic.length).toBe(0);

    const firstPlayerName = container.querySelector(
      `button[title="View player development page"]`
    );
    expect(firstPlayerName).toBeTruthy();
    expect(firstPlayerName?.closest("td")?.className).toContain("text-hud-base");
  });

  it("shows a retained player wearing a number above 11", async () => {
    const team = new TeamTestBuilder().withPlayers(7).build();
    fixtureValue(team.players[6]).number = 12;
    fixtureValue(team.players[6]).playerName = "Late Journeyman";

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

    const row = container.querySelector('[data-testid="roster-row-12"]');
    expect(row?.textContent).toContain("Late Journeyman");
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

    const cols = container.querySelectorAll(":scope colgroup col");
    const headerCells = container.querySelectorAll(":scope thead th");
    expect(cols.length).toBe(headerCells.length);
  });
});

describe("TeamRoster career-stat columns", () => {
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
  });

  it("renders GP/TD/CMP/CAS/Kills/MVP headers and a player's career totals", async () => {
    const team = new TeamTestBuilder().withPlayers(2).build();
    fixtureValue(team.players[0]).careerStats = {
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

    const headerLabels = [...container.querySelectorAll(":scope thead th")].map(
      (th) => th.textContent
    );
    expect(headerLabels).toEqual(
      expect.arrayContaining(["GP", "TD", "CMP", "CAS", "Kills", "MVP"])
    );

    const firstRow = container.querySelector(":scope tbody tr");
    const cellTexts = [...(firstRow?.querySelectorAll("td") ?? [])].map(
      (td) => td.textContent
    );
    expect(cellTexts).toEqual(
      expect.arrayContaining(["5", "2", "4", "3", "1", "1"])
    );
  });

  it("shows zero for a player who has never played a match", async () => {
    const team = new TeamTestBuilder().withPlayers(1).build();
    delete fixtureValue(team.players[0]).careerStats;

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

    const firstRow = container.querySelector(":scope tbody tr");
    const cellTexts = [...(firstRow?.querySelectorAll("td") ?? [])].map(
      (td) => td.textContent
    );

    const zeroCells = cellTexts.filter((text) => text === "0");
    expect(zeroCells.length).toBe(7);
  });
});

describe("TeamRoster skill tooltips", () => {
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

    const tooltipPanels = [...document.querySelectorAll('[role="tooltip"]')].map((panel) => panel.textContent);

    expect(tooltipPanels).toContain(blockText);
    expect(tooltipPanels).toContain(dodgeText);

    expect(tooltipPanels.includes(`${blockText} ${dodgeText}`)).toBe(
      false
    );
  });

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

    const triggers = [...container.querySelectorAll('span[tabindex="0"]')];
    expect(triggers.length).toBe(2);

    for (const trigger of triggers) {
      const describedBy = trigger.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const panel = document.getElementById(fixtureValue(describedBy));
      expect(panel).toBeTruthy();
      expect(panel?.getAttribute("role")).toBe("tooltip");

      act(() => {
        (trigger as HTMLElement).focus();
      });
      expect(document.activeElement).toBe(trigger);

      expect(panel?.className).toContain("block");
      expect(panel?.className).not.toContain("hidden");
      act(() => {
        (trigger as HTMLElement).blur();
      });
      expect(panel?.className).toContain("hidden");
    }
  });
});

describe("TeamRoster row click and drag handle", () => {
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
                  {...(overrides.onChooseVeteran
                    ? { onChooseVeteran: overrides.onChooseVeteran }
                    : {})}
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
      ':scope [data-testid="roster-row-2"] td'
    )[2];
    click(fixtureValue(positionCell));
    const page = container.querySelector('[data-testid="player-page"]');
    const player = fixtureValue(team.players.find((p) => p.number === 2));
    expect(page?.textContent).toBe(player.id);
  });

  it("does not open the player when the handle or Fire button is clicked", async () => {
    const fired: string[] = [];
    const team = await renderRoster({ onFirePlayer: (id) => { fired.push(id); } });
    const row = fixtureValue(container.querySelector('[data-testid="roster-row-1"]'));
    click(fixtureValue(row.querySelector('[data-testid="drag-handle"]')));
    click(fixtureValue(row.querySelector('button[title="Fire Player"]')));
    expect(container.querySelector('[data-testid="player-page"]')).toBeNull();
    expect(fired).toEqual([fixtureValue(team.players.find((p) => p.number === 1)).id]);
  });

  it("reorders when the handle is dragged onto another row, including an empty slot", async () => {
    const moves: [number, number][] = [];
    await renderRoster({
      onReorderPlayers: (source, target) => {
        moves.push([source, target]);
      },
    });
    const data = new Map<string, string>();
    const handle = fixtureValue(container.querySelector(
      ':scope [data-testid="roster-row-1"] [data-testid="drag-handle"]'
    ));
    act(() => {
      handle.dispatchEvent(dragEvent("dragstart", data));
    });
    const emptyRow = fixtureValue(container.querySelector('[data-testid="roster-row-9"]'));
    act(() => {
      emptyRow.dispatchEvent(dragEvent("drop", data));
    });
    expect(moves).toEqual([[1, 9]]);
  });
});

describe("TeamRoster SPP and value", () => {
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
  });

  async function renderLeagueTeam() {
    const team = new TeamTestBuilder().withPlayers(3).withRerolls(1).build();
    team.advancementMode = "advanced-league";
    const [skilled, injured, fresh] = team.players;
    fixtureValue(skilled).cost = 85_000;
    fixtureValue(skilled).teamValue = 20_000;
    fixtureValue(skilled).spp = 4;
    fixtureValue(injured).cost = 50_000;
    fixtureValue(injured).teamValue = 0;
    fixtureValue(injured).spp = 7;
    fixtureValue(injured).injuries = [InjuryType.MISS_NEXT_GAME];
    fixtureValue(fresh).cost = 50_000;
    fixtureValue(fresh).teamValue = 0;
    fixtureValue(fresh).spp = 0;

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
      `[data-testid="roster-row-${String(slot)}"] [data-testid="${testId}"]`
    );

  it("has SPP and Value columns and no Cost column", async () => {
    await renderLeagueTeam();
    const headerLabels = [...container.querySelectorAll(":scope thead th")].map(
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
    const value = fixtureValue(cell(2, "player-value"));
    expect(value.querySelector("s")?.textContent).toBe("50k");
    expect(value.textContent).toContain("Not in TV");
    expect(value.querySelector("[title]")?.getAttribute("title")).toBe(
      "Misses the next game: not counted in team value"
    );
  });

  it("totals the counted player values to the team value", async () => {
    const team = await renderLeagueTeam();
    const total = container.querySelector('[data-testid="roster-value-total"]');

    expect(calculateTeamValue(team)).toBe(255_000);
    expect(total?.textContent).toBe(
      "Players 155k + re-rolls & staff 100k = TV 255k"
    );
  });
});
