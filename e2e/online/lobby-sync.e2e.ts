import { test, expect } from "@playwright/test";
import { OnlinePage } from "../support/pages/online";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("online lobby @online", () => {
  test("a coach signs in against the auth emulator", async ({ page }) => {
    const online = new OnlinePage(page);
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Host Game" })).toBeEnabled();
    await online.signIn();

    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("a host creates a lobby and a guest joins it", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const guestPage = await guestContext.newPage();
      const host = new OnlinePage(hostPage);
      const guest = new OnlinePage(guestPage);

      await hostPage.goto("/");
      await host.signIn();
      const code = await host.hostGame();
      expect(code).toMatch(/^[A-Z0-9]+$/);

      await guestPage.goto("/");
      await guest.signIn();
      await guest.joinGame(code);

      await guest.expectInLobby(code);
      await host.expectInLobby(code);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("a coach can resume their lobby from the main menu", async ({
    browser,
  }) => {
    const hostContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const host = new OnlinePage(hostPage);

      await hostPage.goto("/");
      await host.signIn();
      const code = await host.hostGame();

      await hostPage.goto("/");
      const resume = hostPage.getByRole("button", { name: new RegExp(code) });
      await expect(resume).toBeVisible({ timeout: 30_000 });

      await resume.click();
      await host.expectInLobby(code);
    } finally {
      await hostContext.close();
    }
  });
});
