import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamBuilder } from "../../../src/ui/components/pages/TeamBuilder";
import {
  loadTeams,
  saveTeams,
  setTeamRepository,
} from "../../../src/game/managers/TeamManager";
import { Team } from "../../../src/types/Team";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

/**
 * team-management-layout: "Detail page shows the stats grid" — TeamBuilder
 * (the /build-team/:teamId detail page) renders TeamStatsOverview near its
 * existing TV: badge, now that the overview card no longer shows it.
 */
describe("TeamBuilder detail page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it("renders the Team Value/Treasury/Roster/Record stats grid for the loaded team", async () => {
    const team = new TeamTestBuilder()
      .withId("detail-team-1")
      .withName("The Detail Dwarfs")
      .withPlayers(4)
      .withTreasury(90000)
      .withStats(2, 0, 1)
      .build();
    saveTeams([team]);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/build-team/${team.id}`]}>
          <Routes>
            <Route path="/build-team/:teamId" element={<TeamBuilder />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain("Team Value");
    expect(container.textContent).toContain("Roster");
    expect(container.textContent).toContain("4/11");
    expect(container.textContent).toContain("2-1-0");
  });
});

/**
 * The player page reads the team from storage, so opening a player from
 * the roster must not lose unsaved edits made on this page.
 */
describe("TeamBuilder opening a player", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    setTeamRepository(null);
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  function PlayerRouteProbe() {
    const { playerId } = useParams();
    return <div data-testid="player-page">{playerId}</div>;
  }

  async function renderSavedTeam() {
    const team = new TeamTestBuilder()
      .withId("open-player-team")
      .withPlayers(3)
      .build();
    saveTeams([team]);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/build-team/${team.id}`]}>
          <Routes>
            <Route path="/build-team/:teamId" element={<TeamBuilder />} />
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

  function clickRow(slot: number) {
    const cell = container.querySelectorAll(
      `[data-testid="roster-row-${slot}"] td`
    )[2];
    act(() => {
      cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function moveSlot(from: number, to: number) {
    const data = new Map<string, string>();
    const handle = container.querySelector(
      `[data-testid="roster-row-${from}"] [data-testid="drag-handle"]`
    )!;
    act(() => {
      handle.dispatchEvent(dragEvent("dragstart", data));
    });
    act(() => {
      container
        .querySelector(`[data-testid="roster-row-${to}"]`)!
        .dispatchEvent(dragEvent("drop", data));
    });
  }

  it("opens a player of an unchanged saved team without asking", async () => {
    const team = await renderSavedTeam();
    const confirmSpy = vi.spyOn(window, "confirm");
    clickRow(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="player-page"]')?.textContent
    ).toBe(team.players.find((p) => p.number === 1)!.id);
  });

  it("saves unsaved edits before opening the player when the coach agrees", async () => {
    const team = await renderSavedTeam();
    const moved = team.players.find((p) => p.number === 1)!;
    moveSlot(1, 9);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    clickRow(9);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector('[data-testid="player-page"]')?.textContent
    ).toBe(moved.id);
    const stored = loadTeams().find((t) => t.id === team.id)!;
    expect(stored.players.find((p) => p.id === moved.id)?.number).toBe(9);
  });

  it("stays on the team and says so when the save does not stick", async () => {
    const team = await renderSavedTeam();
    moveSlot(1, 9);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    // A full localStorage: the repository logs the failed write and carries on
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    clickRow(9);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="player-page"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="roster-row-9"]')?.textContent
    ).not.toContain("Empty slot");
    vi.mocked(Storage.prototype.setItem).mockRestore();
    const stored = loadTeams().find((t) => t.id === team.id)!;
    expect(stored.players.some((p) => p.number === 9)).toBe(false);
  });

  it("stays on the team with edits intact when the coach declines to save", async () => {
    const team = await renderSavedTeam();
    moveSlot(1, 9);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    clickRow(9);
    expect(container.querySelector('[data-testid="player-page"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="roster-row-9"]')?.textContent
    ).not.toContain("Empty slot");
    const stored = loadTeams().find((t) => t.id === team.id)!;
    expect(stored.players.some((p) => p.number === 9)).toBe(false);
  });

  it("saves edits first even when the repository hands out its cached team (signed in)", async () => {
    // Like the cloud repository: reads return the cached team objects, so
    // edits on this page change the cache itself
    const team = new TeamTestBuilder()
      .withId("cloud-team")
      .withPlayers(3)
      .withTreasury(1_000_000)
      .build();
    const cache: Team[] = [team];
    const saves: Team[][] = [];
    setTeamRepository({
      loadTeams: () => [...cache],
      saveTeams: (teams) => {
        saves.push(teams);
        cache.splice(0, cache.length, ...teams);
      },
      deleteTeam: () => {},
    });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/build-team/${team.id}`]}>
          <Routes>
            <Route path="/build-team/:teamId" element={<TeamBuilder />} />
            <Route
              path="/build-team/:teamId/player/:playerId"
              element={<PlayerRouteProbe />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
    // Hiring adds the player to the cached team object in place
    const hire = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "HIRE" && !button.disabled
    )!;
    act(() => {
      hire.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="roster-row-4"]')?.textContent
    ).not.toContain("Empty slot");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    clickRow(4);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(saves).toHaveLength(1);
    expect(container.querySelector('[data-testid="player-page"]')).toBeTruthy();
  });

  it("leaves a chosen mode changeable when the save before opening fails", async () => {
    const team = new TeamTestBuilder()
      .withId("mode-team")
      .withPlayers(3)
      .build();
    team.advancementMode = "advanced-league";
    delete team.advancementModeLocked;
    saveTeams([team]);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/build-team/${team.id}`]}>
          <Routes>
            <Route path="/build-team/:teamId" element={<TeamBuilder />} />
          </Routes>
        </MemoryRouter>
      );
    });
    const modeButtons = () =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          '[aria-label="Advancement Mode"] button'
        )
      );
    expect(modeButtons().length).toBeGreaterThan(0);
    expect(modeButtons().every((button) => !button.disabled)).toBe(true);

    moveSlot(1, 9);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    clickRow(9);
    // Any later change re-renders from the same team object
    moveSlot(2, 8);

    expect(modeButtons().every((button) => !button.disabled)).toBe(true);
  });
});
