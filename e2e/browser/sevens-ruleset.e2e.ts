import { fixtureValue } from "../../src/testing/fixtureValue";
import { expect, test } from "@playwright/test";
import { dehydrateTeam } from "../../src/data/persistence/teamPersistence";
import { FormationManager } from "../../src/game/managers/FormationManager";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { serializeMatchSave } from "../../src/headless/serialization";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { RosterName } from "../../src/types/Team";
import { GameApp } from "../support/pages/game";

for (const type of ["leagues", "tournaments"]) {
  test(`${type} save the organizer's dated NAF choice`, async ({ page }) => {
    const teams = [RosterName.HUMAN, RosterName.ORC].map((roster) =>
      dehydrateTeam(createReadyMadeTeam(roster, `${roster} rules test`, 1))
    );
    await page.addInitScript((teams) => {
      localStorage.setItem("bloodbowl_teams", JSON.stringify(teams));
    }, teams);
    await page.goto(`/${type}/new`);
    await expect(
      page.getByRole("combobox", { name: "Sevens rules", exact: true })
    ).toHaveValue("gw-2025");
    await page.getByLabel("Name", { exact: true }).fill("NAF rules test");
    await page
      .getByRole("combobox", { name: "Sevens rules", exact: true })
      .selectOption("naf-sevens-2026-09-26");
    for (const team of teams) {
      await page.getByRole("button", { name: new RegExp(team.name) }).click();
    }
    await page.getByRole("button", { name: "Generate competition" }).click();
    await expect(page).toHaveURL(new RegExp(`/${type}/(?:league|tournament)-`));
    await expect(
      page.getByText("GW 2025 Sevens + NAF rulings, 26 Sep 2026", {
        exact: false,
      })
    ).toBeVisible();
    const id = fixtureValue(new URL(page.url()).pathname.split("/").pop());
    expect(
      await page.evaluate(
        ({ type, id }) =>
          JSON.parse((localStorage.getItem("bloodbowl_competitions"))!)[
            `${type === "leagues" ? "league" : "tournament"}:${id}`
          ].ruleset,
        { type, id }
      )
    ).toBe("naf-sevens-2026-09-26");
    await page.screenshot({
      path: test.info().outputPath(`${type}-rules.png`),
    });
  });
}

test("a coach resumes Swarming and places an eighth player through the canvas", async ({
  page,
}) => {
  const home = createReadyMadeTeam(RosterName.SNOTLING, "GW Swarm", 0xaa2222);
  const away = createReadyMadeTeam(RosterName.HUMAN, "Visitors", 0x2222aa);
  const game = new HeadlessGame({ seed: 17, team1: home, team2: away });
  await game.execute({ type: "start-setup", kickingTeamId: home.id });
  for (const [team, side] of [
    [home, true],
    [away, false],
  ] as const) {
    await game.execute({
      type: "apply-formation",
      teamId: team.id,
      formation: fixtureValue(new FormationManager().getBuiltInFormations(side)[0]).positions,
    });
    expect(
      (await game.execute({ type: "confirm-setup", teamId: team.id })).ok
    ).toBe(true);
  }
  const save = game.matchSave();
  const reserve = fixtureValue(home.players.find((player) => !player.gridPosition));
  expect(
    fixtureValue(save.snapshot.setup?.teams[home.id]).swarming?.maximumAdditionalPlayers
  ).toBe(1);
  await page.addInitScript((saved) => {
    if (!localStorage.getItem("bloodbowl_local_match_save"))
      localStorage.setItem("bloodbowl_local_match_save", saved);
  }, serializeMatchSave(save));
  await page.goto("/play");
  const app = new GameApp(page);
  await app.bridge.waitForReady(60_000);
  await expect(
    page.getByRole("button", { name: /FINISH SWARMING/ })
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("optgroup[label=Presets]")).toHaveCount(0);
  const square = await page.evaluate((id) => {
    const scene = (window.game)!.scene
      .getScenes(true)
      .find((scene) => scene.scene.key === "GameScene");
    if (!scene || !("dugouts" in scene) || !("getPitch" in scene))
      throw new Error("Missing match scene");

    const board = scene as unknown as {
      dugouts: Map<
        string,
        { getSprites(): Map<string, { x: number; y: number }> }
      >;
      getPitch(): {
        worldToGrid(x: number, y: number): { x: number; y: number };
      };
    };
    const sprite = [...board.dugouts.values()]
      .map((dugout) => dugout.getSprites().get(id))
      .find((sprite) => sprite !== undefined);
    if (!sprite) throw new Error("Missing reserve sprite");
    return board.getPitch().worldToGrid(sprite.x, sprite.y);
  }, reserve.id);
  const start = await app.pitch.viewportPoint(square);
  const end = await app.pitch.viewportPoint({ x: 5, y: 4 });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        fixtureValue((await app.bridge.snapshot()).teams[0]).players.filter(
          (player) => player.position
        ).length
    )
    .toBe(8);
  await page.screenshot({
    path: test.info().outputPath("swarming-placement.png"),
  });
  await page.getByRole("button", { name: /FINISH SWARMING/ }).click();
  await app.bridge.expectPhase("KICKOFF");
});
