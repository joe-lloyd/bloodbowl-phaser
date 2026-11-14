import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamBuilder } from "../../../src/ui/components/pages/TeamBuilder";
import {
  loadTeams,
  getTeamById,
  saveTeams,
  setTeamRepository,
} from "../../../src/game/managers/TeamManager";
import { Team } from "../../../src/types/Team";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";
import { queueExpensiveMistakes } from "../../../src/game/rules/expensiveMistakes";
import { PlayerPage } from "../../../src/ui/components/pages/PlayerPage";
import { RNGService } from "../../../src/services/rng/RNGService";

describe("post-match team management", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    setTeamRepository(null);
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function renderPostMatch(treasury = 150_000, nextTeam = false) {
    const team = new TeamTestBuilder()
      .withId("post-match")
      .withName("Post-match Humans")
      .withPlayers(7)
      .withTreasury(treasury)
      .withStats(1, 0, 0)
      .build();
    team.advancementMode = "advanced-league";
    queueExpensiveMistakes(team, "league:f1");
    const next = new TeamTestBuilder()
      .withId("post-match-next")
      .withName("Next coach's team")
      .withPlayers(7)
      .withTreasury(30_000)
      .withStats(1, 0, 0)
      .build();
    next.advancementMode = "advanced-league";
    saveTeams(nextTeam ? [team, next] : [team]);
    await act(async () => {
      root.render(
        <MemoryRouter
          initialEntries={[
            "/build-team/post-match?postMatch=1&returnTo=%2Fleagues%2Fseason-1&winnings-post-match=60000" +
              (nextTeam
                ? "&nextTeam=post-match-next&winnings-post-match-next=50000"
                : ""),
          ]}
        >
          <Routes>
            <Route path="/build-team/:teamId" element={<TeamBuilder />} />
            <Route
              path="/build-team/:teamId/player/:playerId"
              element={<PlayerPage />}
            />
            <Route path="/leagues/:id" element={<p>The league page</p>} />
          </Routes>
        </MemoryRouter>
      );
    });
    return team;
  }

  async function click(label: RegExp) {
    const button = [...container.querySelectorAll("button")].find((b) =>
      label.test(b.textContent ?? "")
    );
    expect(button, `Missing button ${label}`).toBeDefined();
    await act(async () => button!.click());
  }

  it("shows winnings, keeps purchases on the team, and skips the roll after spending", async () => {
    const team = await renderPostMatch();
    expect(container.textContent).toContain("Post-match team management");
    expect(container.textContent).toContain("60,000 gp");
    const staff = [...container.querySelectorAll("section")].find((s) =>
      s.textContent?.includes("Sideline staff")
    )!;
    const rerolls = [...staff.querySelectorAll("div")].find(
      (d) => d.textContent?.includes("Re-Rolls") && d.querySelector("button")
    )!;
    await act(async () => rerolls.querySelector("button")!.click());
    await click(/Finish post-match/);
    expect(container.textContent).toBe("The league page");
    expect(getTeamById(team.id)).toMatchObject({
      treasury: 50_000,
      rerolls: team.rerolls + 1,
      pendingDevelopment: [],
    });
  });

  it("rolls once when finishing above the threshold and shows the result before returning", async () => {
    const team = await renderPostMatch();
    vi.spyOn(RNGService.prototype, "rollDie").mockReturnValue(1);
    expect(
      container.querySelector('[data-testid="expensive-mistakes"]')
    ).toBeNull();
    await click(/Finish post-match/);
    expect(container.textContent).toContain("Rolled 1");
    expect(getTeamById(team.id)).toMatchObject({
      treasury: 140_000,
      pendingDevelopment: [],
    });
    await click(/Back to the league/);
    expect(container.textContent).toBe("The league page");
    expect(getTeamById(team.id)?.treasury).toBe(140_000);
  });

  it("keeps the post-match destination when visiting a player", async () => {
    await renderPostMatch(30_000);
    const cell = container.querySelectorAll(
      '[data-testid="roster-row-1"] td'
    )[2];
    await act(async () =>
      cell.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    expect(container.textContent).toContain("SPP & career statistics");
    await click(/Back to Manage Team/);
    expect(container.textContent).toContain("Post-match team management");
    await click(/Finish post-match/);
    expect(container.textContent).toBe("The league page");
  });

  it("manages both human teams before returning to the league", async () => {
    await renderPostMatch(30_000, true);
    await click(/Finish post-match/);
    expect(
      container
        .querySelector('input[placeholder="Enter Team Name"]')
        ?.getAttribute("value")
    ).toBe("Next coach's team");
    expect(container.textContent).toContain("50,000 gp");
    await click(/Finish post-match/);
    expect(container.textContent).toBe("The league page");
    expect(getTeamById("post-match-next")?.treasury).toBe(30_000);
  });

  it("waits for the cloud to acknowledge a finish instead of trusting its cache", async () => {
    await renderPostMatch(30_000);
    let cache = loadTeams();
    let acknowledge!: () => void;
    const written = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    setTeamRepository({
      loadTeams: () => cache,
      saveTeams: (teams) => {
        cache = teams;
        return written;
      },
      deleteTeam: () => {},
    });
    await click(/Finish post-match/);
    expect(container.textContent).toContain("Post-match team management");
    expect(
      [...container.querySelectorAll("button")].find((b) =>
        /Saving/.test(b.textContent ?? "")
      )?.disabled
    ).toBe(true);
    await act(async () => acknowledge());
    expect(container.textContent).toBe("The league page");
  });

  it("retries a rejected finish without rolling Expensive Mistakes again", async () => {
    await renderPostMatch();
    let cache = loadTeams();
    let fail = true;
    setTeamRepository({
      loadTeams: () => cache,
      saveTeams: (teams) => {
        cache = teams;
        return fail
          ? Promise.reject(new Error("Cloud offline"))
          : Promise.resolve();
      },
      deleteTeam: () => {},
    });
    vi.spyOn(RNGService.prototype, "rollDie").mockReturnValue(1);
    await click(/Finish post-match/);
    expect(container.textContent).toContain("Cloud offline");
    expect(container.textContent).toContain("Rolled 1");
    fail = false;
    await click(/Retry saving team/);
    expect(container.textContent).toBe("The league page");
    expect(getTeamById("post-match")).toMatchObject({
      treasury: 140_000,
      pendingDevelopment: [],
    });
  });
});

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

  async function clickRow(slot: number) {
    const cell = container.querySelectorAll(
      `[data-testid="roster-row-${slot}"] td`
    )[2];
    await act(async () => {
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
    await clickRow(1);
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
    await clickRow(9);
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
    await clickRow(9);
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
    await clickRow(9);
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
    await clickRow(4);
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
    await clickRow(9);
    // Any later change re-renders from the same team object
    moveSlot(2, 8);

    expect(modeButtons().every((button) => !button.disabled)).toBe(true);
  });
});
