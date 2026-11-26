import { fixtureValue } from "../../src/testing/fixtureValue";
import { expect, type Page, test } from "@playwright/test";
import {
  computeStandings,
  generateRoundRobin,
} from "../../src/competition/logic";
import type {
  CompetitionEntrant,
  LeagueDoc,
} from "../../src/competition/types";
import { dehydrateTeam } from "../../src/data/persistence/teamPersistence";
import { queueExpensiveMistakes } from "../../src/game/rules/expensiveMistakes";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { RosterName } from "../../src/types/Team";

function season() {
  const teams = (
    [
      [RosterName.HUMAN, "Altdorf Reavers"],
      [RosterName.DWARF, "Karak Hammers"],
      [RosterName.ORC, "Gouged Eye Grinders"],
      [RosterName.SKAVEN, "Skavenblight Scramblers"],
    ] as const
  ).map(([roster, name], index) => {
    const team = createReadyMadeTeam(roster, name, 0x8e1b1b + index * 0x2040);
    team.id = `progress-${String(index)}`;
    team.advancementMode = "advanced-league";
    team.firstMatchPlayedAt = 1;
    return team;
  });

  fixtureValue(teams[0]).treasury = 150_000;
  queueExpensiveMistakes(fixtureValue(teams[0]), "progress:f1");
  fixtureValue(fixtureValue(teams[1]).players[0]).spp = 3;
  const entrants: CompetitionEntrant[] = teams.map((team, index) => ({
    id: `local:${team.id}`,
    teamId: team.id,
    ownerUid: null,
    name: team.name,
    rosterName: team.rosterName,
    seed: index + 1,
  }));
  const fixtures = generateRoundRobin(entrants);
  fixtureValue(fixtures[0]).status = "complete";
  fixtureValue(fixtures[0]).result = { homeScore: 2, awayScore: 1, completedAt: 0 };
  const league: LeagueDoc = {
    id: "progress",
    type: "league",
    name: "Progress League",
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

  return { teams: teams.slice(0, 2).map((element) => dehydrateTeam(element)), league };
}

async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate(({ teams, league }) => {
    localStorage.clear();
    localStorage.setItem("bloodbowl_teams", JSON.stringify(teams));
    localStorage.setItem(
      "bloodbowl_competitions",
      JSON.stringify({ [`league:${league.id}`]: league })
    );
  }, season());
}

async function expectNoSideways(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: test.info().outputPath(name), fullPage: true });

for (const device of [
  { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
  { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
]) {
  test.describe(`team progression from a league on a ${device.label}`, () => {
    test.use({ viewport: device.viewport, hasTouch: device.touch });

    test("the main menu opens Teams", async ({ page }) => {
      await seed(page);
      await page.goto("/");
      await page.getByRole("button", { name: "Teams", exact: true }).click();
      await expect(page).toHaveURL(/\/build-team$/);
      await expect(
        page.getByRole("heading", { name: "TEAMS", exact: true })
      ).toBeVisible();

      await expect(
        page.getByRole("button", { name: "+ Create New Team" })
      ).toBeVisible();
      await expectNoSideways(page);
      await shot(page, `${device.label}-0-teams.png`);
    });

    test("finish a game, return to the league, progress the right team", async ({
      page,
    }) => {
      await seed(page);

      await page.goto(
        "/build-team/progress-0?postMatch=1&returnTo=%2Fleagues%2Fprogress"
      );
      await page.getByRole("button", { name: "Finish post-match" }).click();

      const back = page.getByRole("button", { name: "Back to the league" });
      await expect(
        back.or(page.getByTestId("league-your-teams"))
      ).toBeVisible();
      if (await back.isVisible()) await back.click();
      await expect(page).toHaveURL(/\/leagues\/progress$/);

      const yours = page.getByTestId("league-your-teams");
      await expect(yours.getByRole("listitem")).toHaveCount(2);
      const hammers = yours
        .getByRole("listitem")
        .filter({ hasText: "Karak Hammers" });
      await expect(hammers).toContainText("1 player can advance");
      await expect(
        yours.getByRole("listitem").filter({ hasText: "Gouged Eye Grinders" })
      ).toHaveCount(0);

      const yoursBox = await yours.boundingBox();
      const standings = await page
        .getByRole("heading", { name: "Standings", exact: true })
        .boundingBox();
      expect(fixtureValue(yoursBox).y).toBeLessThan(fixtureValue(standings).y);
      await expectNoSideways(page);
      await shot(page, `${device.label}-1-league-your-teams.png`);

      await page
        .getByRole("button", { name: "Progress team: Karak Hammers" })
        .click();
      await expect(page).toHaveURL(
        /\/build-team\/progress-1\?returnTo=%2Fleagues%2Fprogress$/
      );
      await expect(page.getByLabel("Team Name")).toHaveValue("Karak Hammers");
      await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
      await expectNoSideways(page);
      await shot(page, `${device.label}-2-team-page.png`);

      await page.getByTestId("roster-row-1").locator("td").nth(2).click();
      await expect(page).toHaveURL(
        /\/build-team\/progress-1\/player\/[^?]+\?returnTo=%2Fleagues%2Fprogress$/
      );
      await shot(page, `${device.label}-3-player-page.png`);
      await page
        .getByRole("button", { name: "Back to Manage Team" })
        .first()
        .click();
      await page.getByRole("button", { name: "Back to the league" }).click();
      await expect(page).toHaveURL(/\/leagues\/progress$/);
      await expect(page.getByTestId("league-your-teams")).toBeVisible();
    });
  });
}
