/**
 * Every page outside the match, in its main states, at the configured
 * viewport. Each shot is `<SHOTS>/<name>.jpg`; `-full` shots grow the
 * viewport to the page's scroll height so the whole page is in one image.
 * Afterwards `manifest.json` beside SHOTS lists every side's files, which
 * the gallery's Pages section reads. For the gallery:
 *
 *   SHOTS=gallery/public/shots/pages/after   (and /before, /after-1920)
 *
 * The app must run in e2e mode (no Firebase), where the admin pages are
 * open and online pages show their signed-out state.
 */
import { test, Page } from "@playwright/test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join } from "path";

const DIR = process.env.SHOTS ?? "e2e-results/page-shots/out";

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${DIR}/${name}.jpg`, type: "jpeg", quality: 82 });

test.afterAll(() => {
  mkdirSync(DIR, { recursive: true });
  const file = join(dirname(DIR), "manifest.json");
  const manifest = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {};
  manifest[basename(DIR)] = readdirSync(DIR)
    .filter((f) => f.endsWith(".jpg"))
    .sort();
  writeFileSync(file, JSON.stringify(manifest, null, 2));
});

/** Height of the tallest scrolling element, or the window. */
const scrollHeight = (page: Page) =>
  page.evaluate(() => {
    let tallest = document.documentElement.scrollHeight;
    document.querySelectorAll<HTMLElement>("*").forEach((el) => {
      const style = getComputedStyle(el);
      if (
        /(auto|scroll)/.test(style.overflowY) &&
        el.scrollHeight > el.clientHeight
      ) {
        tallest = Math.max(tallest, el.scrollHeight);
      }
    });
    return tallest;
  });

/** The whole page in one image: grow the viewport, shoot, put it back. */
async function fullShot(page: Page, name: string) {
  const size = page.viewportSize()!;
  const height = Math.min(await scrollHeight(page), 6000);
  if (height <= size.height + 4) return;
  await page.setViewportSize({ width: size.width, height });
  await page.waitForTimeout(300);
  await shot(page, `${name}-full`);
  await page.setViewportSize(size);
  await page.waitForTimeout(200);
}

async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(400);
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await settle(page);
}

async function freshProfile(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
}

async function seed(page: Page) {
  await visit(page, "/build-team");
  await page.getByRole("button", { name: /Seed All Rosters/ }).click();
  await settle(page);
}

test.beforeEach(({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
});

test("empty profile", async ({ page }) => {
  await freshProfile(page);
  await visit(page, "/");
  await shot(page, "menu");
  await visit(page, "/build-team");
  await shot(page, "build-team-empty");
  await visit(page, "/select-team");
  await shot(page, "select-team-empty");
  await visit(page, "/leagues");
  await shot(page, "leagues-empty");
  await visit(page, "/build-team/new-team");
  await shot(page, "team-builder-new");
  await fullShot(page, "team-builder-new");
  await visit(page, "/build-team/missing/player/missing");
  await shot(page, "player-not-found");
  await visit(page, "/shared-teams");
  await shot(page, "shared-teams-signed-out");
  await visit(page, "/online/host");
  await shot(page, "online-host-signed-out");
  await visit(page, "/music");
  await shot(page, "sound-test");
  await fullShot(page, "sound-test");
});

test("seeded profile", async ({ page }) => {
  await freshProfile(page);
  await seed(page);
  await shot(page, "build-team");
  await fullShot(page, "build-team");

  // Team select: empty choice, both picked, and a filter with no match
  await visit(page, "/select-team");
  await shot(page, "select-team");
  await fullShot(page, "select-team");
  await page
    .getByRole("button", { name: /Human Founders/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Orc Founders/ })
    .last()
    .click();
  await page.waitForTimeout(200);
  await shot(page, "select-team-picked");
  await page.getByLabel("Filter Player 1 teams").fill("zzz");
  await page.waitForTimeout(200);
  await shot(page, "select-team-no-match");

  // Team builder for a seeded team, then one of its players
  await visit(page, "/build-team");
  await page.getByRole("button", { name: "Manage Team" }).first().click();
  await settle(page);
  await shot(page, "team-builder");
  await fullShot(page, "team-builder");
  const firstPlayer = page.getByTitle("View player development page").first();
  await firstPlayer.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, "team-builder-roster");
  await firstPlayer.click();
  await settle(page);
  await shot(page, "player-page");
  await fullShot(page, "player-page");

  // Competitions
  await visit(page, "/leagues");
  await shot(page, "leagues");
  await page.getByRole("button", { name: /Founders League/ }).click();
  await settle(page);
  await shot(page, "league-view");
  await fullShot(page, "league-view");
  await visit(page, "/leagues/new");
  await shot(page, "league-new");
  await page.getByRole("button", { name: "Generate competition" }).click();
  await page.waitForTimeout(200);
  await fullShot(page, "league-new-error");
  await shot(page, "league-new-error");
  await visit(page, "/tournaments");
  await shot(page, "tournaments");
  await page.getByRole("button", { name: /Winter Gauntlet/ }).click();
  await settle(page);
  await shot(page, "tournament-bracket");
  await fullShot(page, "tournament-bracket");
  await visit(page, "/tournaments");
  await page.getByRole("button", { name: /Founders Cup/ }).click();
  await settle(page);
  await shot(page, "tournament-complete");
  await visit(page, "/tournaments/new");
  await shot(page, "tournament-new");
});

test("a saved local match on the menu", async ({ page }) => {
  await freshProfile(page);
  await seed(page);
  await visit(page, "/select-team");
  await page
    .getByRole("button", { name: /Human Founders/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Orc Founders/ })
    .last()
    .click();
  await page.getByRole("button", { name: /Start Game/ }).click();
  await page
    .getByRole("button", { name: "FLIP COIN" })
    .waitFor({ timeout: 40_000 });
  await page.getByRole("button", { name: "FLIP COIN" }).click();
  await page.waitForTimeout(2500);
  await visit(page, "/");
  const resume = page.getByTestId("resume-local-match");
  if (await resume.isVisible()) await shot(page, "menu-resume");
});
