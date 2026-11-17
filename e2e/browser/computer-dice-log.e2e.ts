import { confirmPregame } from "../support/pregame";
/**
 * A match against the computer keeps every roll in a dice log, through the
 * real pages, and a reload that resumes the match keeps adding to the same
 * log instead of starting another.
 */
import { test, expect, Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";

interface StoredLog {
  id: string;
  mode: string;
  entries: { kind: string; rollType?: string }[];
}

const storedLogs = (page: Page) =>
  page.evaluate((): StoredLog[] => {
    const ids: string[] = JSON.parse(
      localStorage.getItem("bloodbowl_dice_logs") ?? "[]"
    );
    return ids.map((id) =>
      JSON.parse(localStorage.getItem(`bloodbowl_dice_log_${id}`) ?? "null")
    );
  });

test("keeps every roll of a computer match, across a reload", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/build-team");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByText("Development fixtures", { exact: true }).click();
  await page.getByRole("button", { name: /Seed All Rosters/ }).click();
  await page.goto("/select-team");
  await page
    .getByRole("button", { name: /Human Founders/ })
    .first()
    .click();
  await page.getByRole("radio", { name: /Versus computer/ }).click();
  await page.getByRole("button", { name: /Green Bay Smackers/ }).click();
  await page.getByRole("button", { name: /Start Game/ }).click();
  await app.bridge.waitForReady();
  await app.rollWeather(120_000);
  await confirmPregame(page);
  const flip = page.getByRole("button", { name: "FLIP COIN" });
  await flip.waitFor({ timeout: 15_000 });
  await flip.click();

  let before: StoredLog | undefined;
  await expect(async () => {
    [before] = await storedLogs(page);
    expect(before?.mode).toBe("computer");
    const rolled = before?.entries.map((e) => e.rollType);
    expect(rolled).toContain("Coin Toss");
    expect(rolled?.some((r) => r?.startsWith("Weather"))).toBe(true);
  }).toPass({ timeout: 60_000 });

  // The toss saved the match: a reload resumes it and its dice log
  const receive = page.getByRole("button", { name: /^RECEIVE$/ });
  await expect(async () => {
    if (await receive.count()) await receive.first().click({ timeout: 500 });
    const raw = await page.evaluate(() =>
      localStorage.getItem("bloodbowl_local_match_save")
    );
    expect(raw).toMatch(/"subPhase":"SETUP_/);
  }).toPass({ timeout: 60_000 });
  await page.reload();
  await page
    .getByRole("button", { name: /match options/i })
    .waitFor({ timeout: 120_000 });

  const after = await storedLogs(page);
  expect(after.map((log) => log.id)).toEqual([before?.id]);
  expect(after[0].entries.length).toBeGreaterThanOrEqual(
    before?.entries.length ?? 0
  );
});
