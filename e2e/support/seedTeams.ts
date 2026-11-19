import { expect, type Page } from "@playwright/test";

const TEAMS_KEY = "bloodbowl_teams";

export async function seedAllRosters(
  page: Page,
  { fullStrength = false }: { fullStrength?: boolean } = {}
): Promise<void> {
  await page.goto("/build-team");
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await page.getByText("Development fixtures", { exact: true }).click();
  await page.getByRole("button", { name: /Seed All Rosters/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          (JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[]).length,
        TEAMS_KEY
      )
    )
    .toBeGreaterThan(1);
  if (!fullStrength) return;
  await page.evaluate((key) => {
    const teams = JSON.parse(localStorage.getItem(key) ?? "[]") as {
      players: { injuries?: string[] }[];
    }[];
    for (const team of teams)
      for (const player of team.players)
        player.injuries = (player.injuries ?? []).filter(
          (injury) => injury !== "Miss Next Game"
        );
    localStorage.setItem(key, JSON.stringify(teams));
  }, TEAMS_KEY);
}
