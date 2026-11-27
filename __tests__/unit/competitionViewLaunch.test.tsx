import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeStandings,
  generateRoundRobin,
} from "../../src/competition/logic";
import { saveCompetition } from "../../src/competition/repository";
import {
  type CompetitionEntrant,
  type LeagueDoc,
} from "../../src/competition/types";
import { getTeamById, saveTeams } from "../../src/game/managers/TeamManager";
import { CompetitionView } from "../../src/ui/components/pages/CompetitionView";
import { TeamBuilder } from "../utils/test-builders";
import { RosterName, type Team } from "../../src/types/Team";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { clubWorth, foundClub } from "../../src/game/rules/club";
import type { GameType } from "../../src/game/variants/gameTypes";
import { hirePlayer } from "../../src/game/rules/teamPricing";
import type { SevensRuleset } from "../../src/game/rules/sevensRuleset";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

function LaunchedMatch() {
  const state = useLocation().state as Record<string, unknown>;
  return (
    <output data-testid="launched">
      {JSON.stringify({
        progressionEnabled: state["progressionEnabled"],
        competitionContext: state["competitionContext"],
      })}
    </output>
  );
}

function entrantsFor(teams: Team[]): CompetitionEntrant[] {
  return teams.map((team, index) => ({
    id: `local:${team.id}`,
    teamId: team.id,
    ownerUid: null,
    name: team.name,
    rosterName: team.rosterName,
    seed: index + 1,
  }));
}

async function playLocalFixture(
  root: Root,
  container: HTMLDivElement,
  { teams, ruleset, gameType }: { teams: Team[]; ruleset: SevensRuleset; gameType?: GameType }
): Promise<LeagueDoc["fixtures"]> {
  saveTeams(teams);
  const entrants = entrantsFor(teams);
  const fixtures = generateRoundRobin(entrants);
  const league: LeagueDoc = {
    ruleset,
    ...(gameType && { gameType }),
    id: "season-1",
    type: "league",
    name: "Season 1",
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
  await saveCompetition(league);

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/leagues/season-1"]}>
        <Routes>
          <Route
            path="/leagues/:id"
            element={<CompetitionView type="league" />}
          />
          <Route path="/play" element={<LaunchedMatch />} />
        </Routes>
      </MemoryRouter>
    );
  });
  const play = fixtureValue([...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Play local"
  ));
  await act(async () => {
    play.click();
  });
  return fixtures;
}

function clubWithFivePositionals(): Team {
  const team = foundClub("Shadow Wake", RosterName.DARK_ELF);
  team.id = "shadow-wake";
  team.treasury = 2_000_000;
  const templates = getRosterByRosterName(RosterName.DARK_ELF).playerTemplates;
  const positions = [
    "Dark Elf Blitzer",
    "Dark Elf Blitzer",
    "Witch Elf",
    "Dark Elf Runner",
    "Assassin",
    "Dark Elf Lineman",
    "Dark Elf Lineman",
  ];
  for (const positionName of positions) {
    const template = fixtureValue(
      templates.find((candidate) => candidate.positionName === positionName)
    );
    const hired = hirePlayer(team, template);
    if (hired.amount == null) throw new Error(hired.reason);
  }
  return team;
}

describe("launching a competition fixture", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
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

  it.each(["gw-2025", "naf-sevens-2026-09-26"] as const)(
    "plays a local league fixture with progression on under %s",
    async (ruleset) => {
      const teams = ["home", "away"].map((id) =>
        new TeamBuilder().withId(id).withName(id).withPlayers(7).build()
      );
      const fixtures = await playLocalFixture(root, container, { teams, ruleset });

      const launched = container.querySelector('[data-testid="launched"]');
      expect(JSON.parse(fixtureValue(launched).textContent)).toEqual({
        progressionEnabled: true,
        competitionContext: {
          ruleset,
          competitionType: "league",
          competitionId: "season-1",
          fixtureId: fixtureValue(fixtures[0]).id,
          playedVia: "local",
        },
      });
    }
  );

  it("refuses to start a fixture while a club's squad is illegal for the game type", async () => {
    const rival = new TeamBuilder().withId("rival").withName("rival").withPlayers(7).build();
    await playLocalFixture(root, container, {
      teams: [clubWithFivePositionals(), rival],
      ruleset: "gw-2025",
    });

    expect(container.querySelector('[data-testid="launched"]')).toBeNull();
    expect(container.textContent).toContain("Shadow Wake's Sevens squad cannot play:");
  });

  it("lifts a computer club below 750k to play a Gutter Bowl fixture", async () => {
    const rival = foundClub("Low Rollers", RosterName.HUMAN);
    rival.id = "low-rollers";
    rival.computerCoached = true;
    const lineman = fixtureValue(
      getRosterByRosterName(RosterName.HUMAN).playerTemplates.find(
        (template) => template.positionName === "Human Lineman"
      )
    );
    for (let index = 0; index < 7; index++) hirePlayer(rival, lineman);
    expect(clubWorth(rival)).toBeLessThan(750_000);

    await playLocalFixture(root, container, {
      teams: [clubWithFivePositionals(), rival],
      ruleset: "gw-2025",
      gameType: "gutter-bowl",
    });

    expect(container.querySelector('[data-testid="launched"]')).not.toBeNull();
    const lifted = fixtureValue(getTeamById("low-rollers"));
    expect(clubWorth(lifted)).toBe(750_000);
    expect(lifted.club?.gutterUnlocked).toBe(true);
  });
});
