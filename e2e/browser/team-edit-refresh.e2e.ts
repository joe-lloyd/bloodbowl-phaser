/**
 * Edit Team survives a refresh and a direct link: the page loads the saved
 * team its URL names, saves over that same team, and says so plainly when
 * the ID is not in the library instead of starting a new team.
 */
import { test, expect, Page } from "@playwright/test";

const STORAGE_KEY = "bloodbowl_teams";

async function storedTeams(page: Page) {
  return page.evaluate(
    (key) =>
      (
        JSON.parse(localStorage.getItem(key) ?? "[]") as {
          id: string;
          name: string;
        }[]
      ).map(({ id, name }) => ({ id, name })),
    STORAGE_KEY
  );
}

test("a saved team's edit page survives a refresh and a direct link", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.setViewportSize({ width: 1440, height: 900 });

  // A saved, non-Amazon team
  await page.goto("/build-team/new-team");
  await page.getByTestId("roster-choice-Dwarf").click();
  await page.getByPlaceholder("Enter Team Name").fill("Refresh Dwarfs");
  await page.getByRole("button", { name: /Save Team/ }).click();
  await expect(page).toHaveURL(/\/build-team$/);
  const [saved] = await storedTeams(page);
  expect(saved.name).toBe("Refresh Dwarfs");

  // Normal navigation into Edit Team, then a refresh
  await page.getByRole("button", { name: "Manage Team" }).click();
  await expect(page).toHaveURL(new RegExp(`/build-team/${saved.id}$`));
  await page.reload();
  const roster = page.getByRole("combobox", { name: "Roster", exact: true });
  await expect(page.getByPlaceholder("Enter Team Name")).toHaveValue(
    "Refresh Dwarfs"
  );
  await expect(roster).toHaveValue("Dwarf");
  await expect(
    page.getByRole("heading", { name: "CHOOSE YOUR TEAM" })
  ).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("after-refresh.png") });

  // Saving after the refresh updates the original team
  await page.getByPlaceholder("Enter Team Name").fill("Refresh Dwarfs II");
  await page.getByRole("button", { name: /Save Team/ }).click();
  await expect(page).toHaveURL(/\/build-team$/);
  expect(await storedTeams(page)).toEqual([
    { id: saved.id, name: "Refresh Dwarfs II" },
  ]);

  // A direct link opens the same team
  const direct = await page.context().newPage();
  await direct.goto(`/build-team/${saved.id}`);
  await expect(direct.getByPlaceholder("Enter Team Name")).toHaveValue(
    "Refresh Dwarfs II"
  );
  await expect(
    direct.getByRole("combobox", { name: "Roster", exact: true })
  ).toHaveValue("Dwarf");
  await direct.screenshot({ path: test.info().outputPath("direct-link.png") });
  await direct.close();
});

test("an edit link to a team that is not saved says so and starts nothing", async ({
  page,
}) => {
  await page.goto("/build-team/no-such-team");
  await expect(
    page.getByRole("heading", { name: "Team not found" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "CHOOSE YOUR TEAM" })
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("Enter Team Name")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("team-not-found.png") });
  expect(await storedTeams(page)).toEqual([]);

  await page.getByRole("button", { name: "Back to Team Management" }).click();
  await expect(page).toHaveURL(/\/build-team$/);
});
