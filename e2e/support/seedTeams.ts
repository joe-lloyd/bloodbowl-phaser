/**
 * The development seed teams, as the browser specs start their matches
 * from them: Manage Team's "Seed All Rosters" on a clean profile.
 */
import { expect, Page } from "@playwright/test";

/** Where TeamManager keeps the coach's library. */
const TEAMS_KEY = "bloodbowl_teams";

/**
 * Seed every roster on a clean profile.
 *
 * The seed teams carry league history, and the Human seed team has a player
 * due to Miss Next Game. A friendly takes on no Journeymen (league-treasury
 * spec), so as seeded that team fields 6. `fullStrength` clears injuries that
 * carry to the next game, so every seed team can field 7, for specs about
 * setting up a full team rather than a short one.
 */
export async function seedAllRosters(
  page: Page,
  { fullStrength = false }: { fullStrength?: boolean } = {}
): Promise<void> {
  await page.goto("/build-team");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
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
