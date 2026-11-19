import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect, type Page } from "@playwright/test";
import { createTeam, RosterName } from "../../src/types/Team";
import { createPlayer } from "../../src/types/Player";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { dehydrateTeam } from "../../src/data/persistence/teamPersistence";

const CASES = [
  {
    roster: RosterName.HUMAN,
    position: "Human Lineman",
    model: "human_lineman",
  },
  { roster: RosterName.ORC, position: "Untrained Troll", model: "troll" },
  {
    roster: RosterName.HALFLING,
    position: "Halfling Hopeful",
    model: "halfling_hopeful",
  },
] as const;

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 360, height: 740 },
  { width: 320, height: 640 },
] as const;

async function seedTeams(page: Page) {
  const teams = CASES.map(({ roster }) => {
    const template = getRosterByRosterName(roster);
    const team = createTeam(
      `Sprite ${roster}`,
      roster,
      { primary: 0xc81e1e, secondary: 0x1e50c8 },
      template.rerollCost
    );
    team.id = `sprite-${roster.toLowerCase()}`;
    team.players = template.playerTemplates.map((player, index) =>
      createPlayer(player, team.id, index + 1)
    );
    return team;
  });
  await page.goto("/build-team");
  await page.evaluate((stored) => {
    localStorage.clear();
    localStorage.setItem("bloodbowl_teams", JSON.stringify(stored));
  }, teams.map(dehydrateTeam));
  return teams;
}

for (const viewport of VIEWPORTS) {
  test(`player page shows each player's sprite large at ${String(viewport.width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const teams = await seedTeams(page);
    for (const [index, { position, model }] of CASES.entries()) {
      const team = teams[index];
      const player = fixtureValue(fixtureValue(team).players.find((p) => p.positionName === position));
      await page.goto(`/build-team/${fixtureValue(team).id}/player/${player.id}`);

      const panel = page.getByTestId("player-sprite");
      const sprite = panel.getByRole("img", { name: position, exact: true });
      await expect(sprite).toHaveAttribute("data-model", model);

      await expect
        .poll(() => sprite.evaluate((c: HTMLCanvasElement) => c.width))
        .toBeGreaterThan(0);

      const drawn = await sprite.evaluate((c: HTMLCanvasElement) => {
        const rect = c.getBoundingClientRect();
        const pixels = fixtureValue(c
          .getContext("2d"))
          .getImageData(0, 0, c.width, c.height).data;
        let opaque = 0;
        let red = 0;
        let blue = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (fixtureValue(pixels[i + 3]) < 128) continue;
          opaque++;
          const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
          if (fixtureValue(r) > fixtureValue(g) * 1.6 && fixtureValue(r) > fixtureValue(b) * 1.6) red++;
          if (fixtureValue(b) > fixtureValue(r) * 1.6 && fixtureValue(b) > fixtureValue(g) * 1.2) blue++;
        }
        return {
          side: c.width,
          cssWidth: rect.width,
          cssHeight: rect.height,
          left: rect.left,
          right: rect.right,
          opaque,
          red,
          blue,
        };
      });

      expect(drawn.cssWidth).toBe(drawn.cssHeight);
      expect(drawn.cssWidth % drawn.side).toBe(0);
      expect(drawn.cssWidth / drawn.side).toBeGreaterThanOrEqual(3);
      expect(drawn.cssWidth).toBeLessThanOrEqual(240);

      expect(drawn.left).toBeGreaterThanOrEqual(0);
      expect(drawn.right).toBeLessThanOrEqual(viewport.width);
      const overflow = await page
        .locator(".hud-page")
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      expect(drawn.opaque).toBeGreaterThan(200);
      expect(drawn.red + drawn.blue).toBeGreaterThan(0);

      await expect(
        page.getByRole("heading", { name: "Characteristics", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Pending development", exact: true })
      ).toBeAttached();

      await page.screenshot({
        path: test
          .info()
          .outputPath(`player-${model}-${String(viewport.width)}.png`),
        fullPage: true,
      });
    }
  });
}
