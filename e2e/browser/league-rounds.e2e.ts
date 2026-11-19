import { fixtureValue } from "../../src/testing/fixtureValue";
import { expect, type Page, test } from "@playwright/test";
import {
  computeStandings,
  generateRoundRobin,
} from "../../src/competition/logic";
import type {
  CompetitionEntrant,
  CompetitionFixture,
  LeagueDoc,
} from "../../src/competition/types";
import { dehydrateTeam } from "../../src/data/persistence/teamPersistence";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { RosterName } from "../../src/types/Team";

const ROSTERS = [
  [RosterName.HUMAN, "Altdorf Reavers"],
  [RosterName.ORC, "Gouged Eye Grinders"],
  [RosterName.SKAVEN, "Skavenblight Scramblers"],
  [RosterName.DWARF, "Karak Hammers"],
] as const;

function season(allPlayed = false) {
  const teams = ROSTERS.map(([roster, name], index) => {
    const team = createReadyMadeTeam(roster, name, 0x8e1b1b + index * 0x2040);
    team.id = `rounds-${String(index)}`;
    return team;
  });
  const entrants: CompetitionEntrant[] = teams.map((team, index) => ({
    id: `local:${team.id}`,
    teamId: team.id,
    ownerUid: null,
    name: team.name,
    rosterName: team.rosterName,
    seed: index + 1,
  }));
  const fixtures = generateRoundRobin(entrants);
  const play = (game: CompetitionFixture) => {
    game.status = "complete";
    game.result = { homeScore: 2, awayScore: 1, completedAt: 0 };
  };
  if (allPlayed) fixtures.forEach(play);
  else play(fixtureValue(fixtures[0]));
  const league: LeagueDoc = {
    id: "rounds",
    type: "league",
    name: "Rounds League",
    organizerUid: null,
    participantUids: [],
    status: allPlayed ? "complete" : "active",
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
  const name = (id: string | null) =>
    fixtureValue(entrants.find((entrant) => entrant.id === id)).name;
  return {
    teams: teams.map(dehydrateTeam),
    league,
    left: {
      home: name(fixtureValue(fixtures[1]).homeEntrantId),
      away: name(fixtureValue(fixtures[1]).awayEntrantId),
    },
  };
}

async function openLeague(page: Page, allPlayed = false) {
  const seeded = season(allPlayed);

  await page.goto("/build-team");
  await page.evaluate(({ teams, league }) => {
    localStorage.clear();
    localStorage.setItem("bloodbowl_teams", JSON.stringify(teams));
    localStorage.setItem(
      "bloodbowl_competitions",
      JSON.stringify({ [`league:${league.id}`]: league })
    );
  }, seeded);
  await page.goto("/leagues/rounds");
  await expect(
    page.getByRole("heading", { name: "Standings", exact: true })
  ).toBeVisible();
  return seeded;
}

const nextRound = (page: Page) => page.getByTestId("next-round");
const completedToggle = (page: Page, round: number) =>
  page.getByRole("button", { name: `Round ${String(round)}`, exact: true });

async function shoot(page: Page, title: string, name: string) {
  await page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .screenshot({ path: test.info().outputPath(name) });
}

async function expectNoSideways(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const device of [
  { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
  { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
]) {
  test.describe(`league rounds on a ${device.label}`, () => {
    test.use({ viewport: device.viewport, hasTouch: device.touch });

    test("the next round leads and a completed round folds away", async ({
      page,
    }) => {
      const { left } = await openLeague(page);

      const standings = await page
        .getByRole("heading", { name: "Standings", exact: true })
        .boundingBox();
      const next = await page
        .getByRole("heading", { name: "Next round", exact: true })
        .boundingBox();
      expect(fixtureValue(next).y).toBeGreaterThan(fixtureValue(standings).y);
      await expect(nextRound(page).getByRole("heading")).toHaveText("Round 1");
      await expect(nextRound(page)).toContainText("1 of 2 games played");
      await expect(page.getByTestId("next-round-fixture")).toHaveCount(2);
      await expect(
        page.getByTestId("next-round-fixture").first().locator("[data-crest]")
      ).toHaveCount(2);
      await expectNoSideways(page);
      await page.screenshot({
        path: test.info().outputPath(`${device.label}-1-partly-played.png`),
        fullPage: true,
      });
      await shoot(page, "Next round", `${device.label}-1-next-round.png`);

      const toPlay = page
        .getByTestId("next-round-fixture")
        .filter({ has: page.getByRole("button", { name: "Record result" }) });
      await expect(toPlay).toHaveCount(1);
      await toPlay.getByLabel(`${left.home} score`, { exact: true }).fill("0");
      await toPlay.getByLabel(`${left.away} score`, { exact: true }).fill("3");
      await toPlay.getByRole("button", { name: "Record result" }).click();

      await expect(nextRound(page).getByRole("heading")).toHaveText("Round 2");
      const roundOne = completedToggle(page, 1);
      await expect(roundOne).toHaveAttribute("aria-expanded", "false");
      const panel = page.locator(
        `#${String(await roundOne.getAttribute("aria-controls"))}`
      );
      await expect(panel).toBeHidden();
      await expectNoSideways(page);

      if (device.touch) {
        await roundOne.tap();
      } else {
        await roundOne.focus();
        await page.keyboard.press("Enter");
      }
      await expect(roundOne).toHaveAttribute("aria-expanded", "true");
      await expect(panel).toBeVisible();
      await expect(panel).toContainText(left.home);
      await expect(panel).toContainText(left.away);
      await expect(panel.locator("strong")).toHaveText(["2", "1", "0", "3"]);
      await expectNoSideways(page);
      await page.screenshot({
        path: test.info().outputPath(`${device.label}-2-round-one-open.png`),
        fullPage: true,
      });
      await shoot(page, "Next round", `${device.label}-2-next-round.png`);
      await shoot(
        page,
        "Completed rounds",
        `${device.label}-2-completed-rounds.png`
      );
      if (device.touch) {
        await roundOne.tap();
      } else {
        await page.keyboard.press("Space");
      }
      await expect(roundOne).toHaveAttribute("aria-expanded", "false");
      await expect(panel).toBeHidden();

      await page.reload();
      await expect(nextRound(page).getByRole("heading")).toHaveText("Round 2");
      await expect(completedToggle(page, 1)).toHaveAttribute(
        "aria-expanded",
        "false"
      );
      await page.screenshot({
        path: test.info().outputPath(`${device.label}-3-after-reload.png`),
        fullPage: true,
      });
    });

    test("a finished league shows its history and no next round", async ({
      page,
    }) => {
      await openLeague(page, true);
      await expect(
        page.getByRole("heading", { name: "Completed rounds", exact: true })
      ).toBeVisible();
      await expect(nextRound(page)).toHaveCount(0);
      for (const round of [1, 2, 3]) {
        await expect(completedToggle(page, round)).toHaveAttribute(
          "aria-expanded",
          "false"
        );
      }
      await completedToggle(page, 3).click();
      await expect(completedToggle(page, 3)).toHaveAttribute(
        "aria-expanded",
        "true"
      );
      await expectNoSideways(page);
      await page.screenshot({
        path: test.info().outputPath(`${device.label}-4-finished.png`),
        fullPage: true,
      });
      await shoot(
        page,
        "Completed rounds",
        `${device.label}-4-completed-rounds.png`
      );
    });
  });
}
