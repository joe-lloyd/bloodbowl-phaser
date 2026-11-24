import { fixtureValue } from "../../src/testing/fixtureValue";
import { confirmPregame } from "../support/pregame";
import { expect, type Page, test } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { seedAllRosters } from "../support/seedTeams";

async function openCatalogue(page: Page, query = "") {
  await page.goto("/build-team");
  await page.getByRole("tab", { name: "Computer teams", exact: true }).click();
  if (query)
    await page
      .getByRole("textbox", { name: "Find a computer team" })
      .fill(query);
}

const savedTeams = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("bloodbowl_teams") ?? "[]") as {
        id: string;
        name: string;
        computerCoached?: boolean;
        computerTemplateId?: string;
        activeCompetitionId?: string;
        advancementMode?: string;
        players: { id: string }[];
      }[]
  );

test("the default catalogue is read-only, searchable, and filters by rules", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCatalogue(page);
  await expect(page.getByRole("status")).toHaveText("83 of 83 computer teams");
  await expect(
    page.getByRole("button", { name: "Delete team", exact: true })
  ).toHaveCount(0);
  expect(await savedTeams(page)).toEqual([]);

  const rosterFilter = page.getByRole("combobox", { name: "Roster", exact: true });
  await rosterFilter.selectOption("Night Goblin");
  await expect(page.getByRole("status")).toHaveText("1 of 83 computer teams");
  await expect(page.getByRole("heading", { name: "Moonlit Menace", exact: true })).toBeVisible();

  await rosterFilter.selectOption("Human");
  await expect(page.getByRole("status")).toHaveText("3 of 83 computer teams");
  const human = page
    .locator(".hud-slab")
    .filter({ has: page.getByRole("heading", { name: "Altdorf All Sorts" }) });
  await human.getByText("View roster and source", { exact: true }).click();
  await expect(human).toContainText("3 × Human Lineman");
  await expect(
    human.getByRole("link", { name: /Roster source/ })
  ).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=deZAXO1x00k&t=400s"
  );
  await page.screenshot({
    path: test.info().outputPath("computer-teams-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("computer-teams-mobile.png"),
    fullPage: true,
  });
  await human.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("computer-team-card-mobile.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);

  await page
    .getByRole("combobox", { name: "Roster", exact: true })
    .selectOption("");
  await page
    .getByRole("textbox", { name: "Find a computer team" })
    .fill("Snot What You Think");
  await expect(page.getByRole("status")).toHaveText("0 of 83 computer teams");
  await page
    .getByRole("combobox", { name: "Sevens rules" })
    .selectOption("naf-sevens-2026-09-26");
  await expect(page.getByRole("status")).toHaveText("1 of 84 computer teams");
  await expect(
    page.getByRole("button", { name: "Play against", exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Add to a league" })
  ).toBeEnabled();
  expect(await savedTeams(page)).toEqual([]);
  await page.getByRole("tab", { name: "Computer teams", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: "My teams", exact: true })
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "No teams found in the archives." })
  ).toBeVisible();
});

test("a saved team can play a fresh catalogue opponent without saving the opponent", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await seedAllRosters(page, { fullStrength: true });
  const saved = (await savedTeams(page)).length;
  await openCatalogue(page, "Green Bay Smackers");
  await page.getByRole("button", { name: "Play against", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: /Versus computer/ })
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page
      .getByTestId("team-column-2")
      .getByRole("button", { name: /Green Bay Smackers/ })
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByTestId("team-column-1")
    .getByRole("button", { name: /Human Founders/ })
    .click();
  await page.getByRole("button", { name: /Start Game/ }).click();
  const app = new GameApp(page);
  await app.bridge.waitForReady();
  await app.rollWeather();
  await confirmPregame(page);
  await expect(page.getByRole("button", { name: "FLIP COIN" })).toBeVisible({
    timeout: 15_000,
  });
  const opponent = (await app.bridge.snapshot()).teams.find(
    (team) => team.name === "Green Bay Smackers"
  );
  expect(opponent?.players).toHaveLength(7);
  expect(opponent?.players.map((player) => player.positionName)).toEqual([
    "Big Un Blocker",
    "Big Un Blocker",
    "Orc Blitzer",
    "Orc Blitzer",
    "Orc Lineman",
    "Orc Lineman",
    "Goblin Lineman",
  ]);
  expect(await savedTeams(page)).toHaveLength(saved);
});

test("the same template enters two leagues as different teams with the league mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [name, mode] of [
    ["First season", "advanced-league"],
    ["Second season", "sevens-skill-selection"],
  ] as const) {
    await openCatalogue(page, "Altdorf All Sorts");
    await page.getByRole("button", { name: "Add to a league" }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(fixtureValue(name));
    await page
      .getByRole("checkbox", { name: /Require an advancement mode/ })
      .check();
    await page
      .getByRole("combobox", { name: "Advancement mode", exact: true })
      .selectOption(fixtureValue(mode));
    await page
      .getByRole("button", { name: "+ Add computer team", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Generate competition", exact: true })
      .click();
    await expect(page).toHaveURL(/\/leagues\/league-/);
    await expect(
      page.getByRole("heading", { name, exact: true })
    ).toBeVisible();
  }
  const copies = (await savedTeams(page)).filter(
    (team) => team.computerTemplateId === "human-reroll-mix-roster"
  );
  expect(copies).toHaveLength(2);
  expect(copies.map((team) => team.advancementMode).sort()).toEqual([
    "advanced-league",
    "sevens-skill-selection",
  ]);
  expect(new Set(copies.map((team) => team.activeCompetitionId)).size).toBe(2);
  expect(
    new Set(copies.flatMap((team) => team.players.map((player) => player.id)))
      .size
  ).toBe(14);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Second season", exact: true })
  ).toBeVisible();
  await openCatalogue(page, "Altdorf All Sorts");
  await expect(page.getByRole("status")).toHaveText("1 of 83 computer teams");
  await expect(
    page.getByRole("button", { name: "Add to a league" })
  ).toBeEnabled();
});
