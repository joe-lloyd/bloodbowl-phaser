import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect, type Page } from "@playwright/test";
import { createTeam, RosterName } from "../../src/types/Team";
import { createPlayer } from "../../src/types/Player";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { dehydrateTeam } from "../../src/data/persistence/teamPersistence";
import { queueExpensiveMistakes } from "../../src/game/rules/expensiveMistakes";

async function openPostMatch(page: Page) {
  const team = createTeam(
    "Post-match Humans",
    RosterName.HUMAN,
    {
      primary: 0x8e1b1b,
      secondary: 0xffffff,
    },
    100_000
  );
  team.id = "post-match-humans";
  team.advancementMode = "advanced-league";
  team.firstMatchPlayedAt = 1;
  team.treasury = 150_000;
  const lineman = getRosterByRosterName(RosterName.HUMAN).playerTemplates[0];
  team.players = Array.from({ length: 7 }, (_, index) =>
    createPlayer(fixtureValue(lineman), team.id, index + 1, `Human ${String(index + 1)}`)
  );
  queueExpensiveMistakes(team, "season-1:fixture-1");
  await page.goto("/build-team");
  await page.evaluate((stored) => {
    localStorage.clear();
    localStorage.setItem("bloodbowl_teams", JSON.stringify([stored]));
  }, dehydrateTeam(team));
  await page.goto(
    "/build-team/post-match-humans?postMatch=1&returnTo=%2Fleagues%2Fseason-1&winnings-post-match-humans=60000"
  );
  await expect(
    page.getByRole("heading", { name: "Post-match team management" })
  ).toBeVisible();
  return team.id;
}

async function savedTeam(page: Page) {
  return page.evaluate(() => {
    const [team] = JSON.parse(localStorage.getItem("bloodbowl_teams") ?? "[]");
    return {
      treasury: team.treasury,
      pending: team.pendingDevelopment,
      rerolls: team.rerolls,
      coaches: team.coaches,
    };
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 802, height: 1138 },
]) {
  test(`spending removes Expensive Mistakes and finishes at ${String(viewport.width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const id = await openPostMatch(page);
    const details = page.locator(".hud-slab").filter({
      has: page.getByRole("heading", { name: "Team details", exact: true }),
    });
    const box = await details.boundingBox();
    expect(fixtureValue(box).x + fixtureValue(box).width).toBeLessThanOrEqual(viewport.width);
    await expect(
      page.getByText("Winnings: +60,000 gp added to the Treasury.")
    ).toBeVisible();
    for (const locked of ["Re-Rolls", "Dedicated Fans"])
      await expect(
        page
          .getByText(locked, { exact: true })
          .locator("..")
          .getByRole("button")
      ).toHaveCount(0);
    for (let coach = 0; coach < 3; coach++) {
      await page
        .getByText(/^Asst. Coaches/)
        .locator("..")
        .getByRole("button", { name: "+", exact: true })
        .click();
    }
    await page.locator('[data-testid="roster-row-1"] td').nth(2).click();
    await expect(page).toHaveURL(
      new RegExp(`/build-team/${id}/player/${id}-player-1`)
    );
    await page.getByRole("button", { name: "Back to Manage Team" }).click();
    await expect(
      page.getByRole("heading", { name: "Post-match team management" })
    ).toBeVisible();
    await expect(page.getByTestId("expensive-mistakes")).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath("post-match-after-spending.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Finish post-match", exact: true })
      .click();
    await expect(page).toHaveURL(/\/leagues\/season-1$/);
    expect(await savedTeam(page)).toEqual({
      treasury: 90_000,
      pending: [],
      rerolls: 0,
      coaches: 3,
    });
    await page.goto("/build-team");
    await expect(page.getByTestId("expensive-mistakes")).toHaveCount(0);
  });
}

test("finishing with unspent gold shows one saved roll", async ({ page }) => {
  await openPostMatch(page);
  await page
    .getByRole("button", { name: "Finish post-match", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Expensive Mistakes: Rolled"
  );
  const settled = await savedTeam(page);
  expect(settled.pending).toEqual([]);
  expect(settled.treasury).toBeGreaterThanOrEqual(120_000);
  expect(settled.treasury).toBeLessThanOrEqual(150_000);
  await page.screenshot({
    path: test.info().outputPath("expensive-mistakes-result.png"),
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Finish post-match", exact: true })
    .click();
  await expect(page).toHaveURL(/\/leagues\/season-1$/);
  expect(await savedTeam(page)).toEqual(settled);
});
