import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../../src/competition/computerTeamTemplates";
import { dehydrateTeam } from "../../src/data/persistence/teamPersistence";
import { OnlinePage } from "../support/pages/online";

test.describe.configure({ mode: "serial", timeout: 240_000 });

function coachTeam(index: number, name: string): { id: string; stored: string } {
  const template = getComputerTeamTemplates()[index];
  if (!template) throw new Error("no computer templates");
  const team = createComputerTeamFromTemplate(template.id);
  delete team.computerCoached;
  delete team.computerTemplateId;
  team.name = name;
  return { id: team.id, stored: JSON.stringify([dehydrateTeam(team)]) };
}

async function coach(context: BrowserContext, teams: string): Promise<Page> {
  await context.addInitScript((stored) => {
    localStorage.setItem("bloodbowl_teams", stored);
  }, teams);
  const page = await context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await new OnlinePage(page).signIn();
  return page;
}

test("coaches sign up to an online league, computer teams fill it, and a fixture is hosted for the opponent @online", async ({
  browser,
}) => {
  const stamp = String(Date.now()).slice(-6);
  const [alpha, bravo, league] = [`Alpha ${stamp}`, `Bravo ${stamp}`, `Spike Cup ${stamp}`];
  const organizerContext = await browser.newContext();
  const coachContext = await browser.newContext();
  const shot = (page: Page, name: string) =>
    page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });

  try {
    const alphaTeam = coachTeam(0, alpha);
    const bravoTeam = coachTeam(3, bravo);
    const organizer = await coach(organizerContext, alphaTeam.stored);
    const rival = await coach(coachContext, bravoTeam.stored);

    await organizer.getByRole("button", { name: "Leagues" }).click();
    await organizer.getByRole("button", { name: "Create league" }).first().click();
    await organizer.getByRole("radio", { name: /Online sign-ups/ }).click();
    await organizer.getByLabel("Name").fill(league);
    await organizer.getByLabel("Places").selectOption("4");
    await organizer.getByLabel("Your team").selectOption(alphaTeam.id);
    await shot(organizer, "organizer-builder");
    await organizer.getByRole("button", { name: "Open sign-ups" }).click();
    await expect(organizer.getByText("1 of 4 places taken")).toBeVisible({ timeout: 30_000 });

    await rival.getByRole("button", { name: "Leagues" }).click();
    await rival.getByTestId("open-competition").filter({ hasText: league }).click();
    await rival.getByLabel("Team to enter").selectOption(bravoTeam.id);
    await rival.getByRole("button", { name: "Enter team" }).click();
    await expect(rival.getByText("2 of 4 places taken")).toBeVisible();
    await expect(organizer.getByText("2 of 4 places taken")).toBeVisible();
    await shot(organizer, "organizer-signups");

    await organizer.getByRole("button", { name: "Start league" }).click();
    await expect(organizer.getByTestId("round-status")).toContainText("Round 1 is open until", { timeout: 30_000 });
    await expect(rival.getByTestId("round-status")).toContainText("Round 1 is open until", { timeout: 30_000 });
    await shot(organizer, "organizer-round-one");

    for (let round = 1; round <= 3; round++) {
      await expect(organizer.getByTestId("round-status")).toContainText(`Round ${String(round)} is open`, { timeout: 60_000 });
      const games = organizer.getByTestId("next-round-fixture");
      if ((await games.filter({ hasText: alpha }).filter({ hasText: bravo }).count()) > 0) break;
      await expect(games.filter({ hasNotText: alpha }).filter({ hasNotText: bravo })).toContainText("Simulated", { timeout: 60_000 });
      for (const name of [alpha, bravo]) {
        const game = games.filter({ hasText: name });
        const scores = game.getByRole("spinbutton");
        await scores.nth(0).fill("1");
        await scores.nth(1).fill("0");
        await game.getByRole("button", { name: "Record result" }).click();
        await expect(game).toContainText("Result entered by hand");
      }
    }
    await shot(organizer, "organizer-open-round");
    await shot(rival, "rival-open-round");

    const fixture = organizer.getByTestId("next-round-fixture").filter({ hasText: alpha }).filter({ hasText: bravo });
    await fixture.getByRole("button", { name: "Host online" }).click();
    const lobbyCode = organizer.getByTestId("lobby-code");
    await expect(lobbyCode).toHaveAttribute("data-code", /^[A-Z0-9]{6}$/, { timeout: 30_000 });
    const code = (await lobbyCode.getAttribute("data-code")) ?? "";

    await rival.getByTestId("next-round-fixture").filter({ hasText: alpha }).getByRole("button", { name: "Join match" }).click();
    await expect(rival.getByTestId("lobby-code")).toHaveAttribute("data-code", code, { timeout: 30_000 });
    await expect(rival.getByText(new RegExp(`${bravo} .*locked for this fixture`))).toBeVisible();
    await expect(organizer.getByText(new RegExp(`${alpha} .*locked for this fixture`))).toBeVisible();
    await shot(rival, "rival-fixture-lobby");
  } finally {
    await organizerContext.close();
    await coachContext.close();
  }
});
