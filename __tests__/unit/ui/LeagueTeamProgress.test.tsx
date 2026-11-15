/**
 * A coach finds their own league teams on the league page and opens each
 * one's progression with the league as the way back.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { createCompetition } from "../../../src/competition/create";
import { createComputerTeam } from "../../../src/competition/computerTeams";
import { createRosterRuleProfile } from "../../../src/competition/rosterRules";
import { CompetitionDoc } from "../../../src/competition/types";
import {
  saveTeam,
  saveTeams,
  setTeamRepository,
} from "../../../src/game/managers/TeamManager";
import { queueExpensiveMistakes } from "../../../src/game/rules/expensiveMistakes";
import { RosterName, Team } from "../../../src/types/Team";
import { CompetitionView } from "../../../src/ui/components/pages/CompetitionView";
import {
  leagueTeamProgressRows,
  progressTeamPath,
} from "../../../src/ui/components/pages/LeagueTeamProgress";
import { TeamBuilder } from "../../../src/ui/components/pages/TeamBuilder";
import { createReadyMadeTeam } from "../../../src/simulation/lineups";

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
  localStorage.clear();
});

/** A legal team for league entry, in this coach's library. */
function coachTeam(roster: RosterName, name: string): Team {
  const team = createReadyMadeTeam(roster, name, 0xaa2222);
  team.advancementMode = "advanced-league";
  return team;
}

/** Where the router is, shown on the stand-in pages. */
function Here({ label }: { label: string }) {
  const { pathname, search } = useLocation();
  return (
    <p data-testid="here">
      {label} {pathname}
      {search}
    </p>
  );
}

const here = () =>
  container.querySelector('[data-testid="here"]')?.textContent ?? "";
const button = (name: string) =>
  [...container.querySelectorAll("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name ||
      candidate.textContent === name
  );

async function showLeague(league: CompetitionDoc) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/leagues/${league.id}`]}>
        <Routes>
          <Route
            path="/leagues/:id"
            element={<CompetitionView type="league" />}
          />
          <Route path="/build-team/:teamId" element={<TeamBuilder />} />
          <Route path="/build-team" element={<Here label="Teams" />} />
        </Routes>
      </MemoryRouter>
    );
  });
}

describe("the league page's Your teams section", () => {
  let first: Team;
  let second: Team;
  let rival: Team;
  let league: CompetitionDoc;

  beforeEach(async () => {
    first = coachTeam(RosterName.HUMAN, "Nuln Hammers");
    second = coachTeam(RosterName.DWARF, "Reikland Reavers");
    rival = createComputerTeam(
      RosterName.ORC,
      "Orc XI",
      0x224488,
      "advanced-league"
    );
    saveTeams([first, second]);
    saveTeam(rival);
    league = await createCompetition({
      type: "league",
      name: "Season 1",
      organizerUid: null,
      entrants: [first, second, rival].map((team) => ({
        team,
        ownerUid: null,
      })),
      profile: createRosterRuleProfile({ advancementMode: "advanced-league" }),
    });
    // After a game: one team has development to finish, and one player on
    // the other has the SPP for a random primary skill, not more
    first.treasury = 150_000;
    queueExpensiveMistakes(first, "league:f1");
    second.players[0].spp = 3;
    saveTeams([first, second, rival]);
  });

  it("lists each of the coach's teams with where its development stands", async () => {
    await showLeague(league);
    const section = container.querySelector(
      '[data-testid="league-your-teams"]'
    );
    expect(section).not.toBeNull();
    const rows = [...section!.querySelectorAll("li")].map(
      (row) => row.textContent
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("Nuln Hammers");
    expect(rows[0]).toContain("Development to finish");
    expect(rows[0]).toContain("Finish it before this team's next league game.");
    expect(rows[1]).toContain("Reikland Reavers");
    expect(rows[1]).toContain("1 player can advance");
    expect(rows[2]).toContain("Orc XI");
    expect(rows[2]).toContain(
      "The computer makes this team's development choices."
    );
    // A Progress team action for each team a person coaches, named for it
    expect(button("Progress team: Nuln Hammers")).toBeDefined();
    expect(button("Progress team: Reikland Reavers")).toBeDefined();
    expect(button("Progress team: Orc XI")).toBeUndefined();
  });

  it("opens the chosen team's page and comes back to the league", async () => {
    await showLeague(league);
    await act(async () => button("Progress team: Reikland Reavers")!.click());
    // The second team's page, not the first's
    const page = container.textContent!.toLowerCase();
    expect(page).toContain("reikland reavers");
    expect(page).not.toContain("nuln hammers");
    expect(button("Cancel")).toBeUndefined();
    await act(async () => button("Back to the league")!.click());
    expect(
      container.querySelector('[data-testid="league-your-teams"]')
    ).not.toBeNull();
  });

  it("returns to the league after saving the team", async () => {
    await showLeague(league);
    await act(async () => button("Progress team: Reikland Reavers")!.click());
    const save = [...container.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.startsWith("Save Team")
    )!;
    await act(async () => save.click());
    expect(
      container.querySelector('[data-testid="league-your-teams"]')
    ).not.toBeNull();
  });

  it("leaves out withdrawn teams and teams that are not the coach's", () => {
    league.entrants[0].withdrawn = true;
    const rows = leagueTeamProgressRows(league, (teamId) =>
      teamId === second.id ? second : undefined
    );
    expect(rows.map((row) => row.team.name)).toEqual(["Reikland Reavers"]);
  });

  it("does not say pending development blocks the next game when the league allows it", () => {
    league.rosterProfile = {
      ...league.rosterProfile!,
      requireDevelopmentComplete: false,
    };
    const [row] = leagueTeamProgressRows(league, (teamId) =>
      teamId === first.id ? first : undefined
    );
    expect(row.status).toEqual({ kind: "development", blocksNextGame: false });
  });

  it("calls a team with nothing waiting up to date", () => {
    const [row] = leagueTeamProgressRows(league, (teamId) =>
      teamId === rival.id
        ? { ...first, id: rival.id, pendingDevelopment: [] }
        : undefined
    );
    expect(row.status).toEqual({ kind: "computer" });
    const [mine] = leagueTeamProgressRows(
      {
        ...league,
        entrants: [{ ...league.entrants[0], computerCoached: undefined }],
      },
      () => ({ ...first, pendingDevelopment: [] })
    );
    expect(mine.status).toEqual({ kind: "up-to-date" });
  });
});

it("shows no Your teams section when none of the league's teams are the coach's", async () => {
  const a = coachTeam(RosterName.HUMAN, "Away Side");
  const b = coachTeam(RosterName.ORC, "Other Side");
  saveTeams([a, b]);
  const league = await createCompetition({
    type: "league",
    name: "Their league",
    organizerUid: null,
    entrants: [a, b].map((team) => ({ team, ownerUid: null })),
  });
  saveTeams([]);
  await showLeague(league);
  expect(container.textContent).toContain("Their league");
  expect(
    container.querySelector('[data-testid="league-your-teams"]')
  ).toBeNull();
});

it("links a team's page with the league to return to", () => {
  expect(progressTeamPath("team 1", "season-1")).toBe(
    "/build-team/team%201?returnTo=%2Fleagues%2Fseason-1"
  );
});

it("keeps Back to Teams when a team's page was opened from Teams", async () => {
  const team = coachTeam(RosterName.HUMAN, "Solo Side");
  saveTeams([team]);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/build-team/${team.id}`]}>
        <Routes>
          <Route path="/build-team/:teamId" element={<TeamBuilder />} />
          <Route path="/build-team" element={<Here label="Teams" />} />
        </Routes>
      </MemoryRouter>
    );
  });
  expect(button("Back to the league")).toBeUndefined();
  await act(async () => button("Cancel")!.click());
  expect(here()).toBe("Teams /build-team");
});
