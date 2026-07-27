/**
 * Emulator-backed online flows. @online
 *
 * Two browser contexts are two coaches: separate auth, separate storage,
 * separate pages — the only thing they share is the Firestore emulator, so
 * anything one sees of the other really did travel through the backend.
 *
 * Everything here runs against `demo-bloodbowl`, a Firebase demo project the
 * emulators serve with no credentials and which cannot reach a real backend.
 * No secrets, and safe to run anywhere.
 */

import { test, expect } from "@playwright/test";
import { OnlinePage } from "../support/pages/online";

// This lane costs a second build and the emulators, so it is opt-in and
// generously timed: sign-in involves a popup and a round trip.
test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("online lobby @online", () => {
  test("a coach signs in against the auth emulator", async ({ page }) => {
    const online = new OnlinePage(page);
    await page.goto("/");

    // With Firebase configured, online play is offered rather than disabled.
    await expect(page.getByRole("button", { name: "Host Game" })).toBeEnabled();
    await online.signIn();

    // A signed-in coach gets the name editor and a sign-out control.
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("a host creates a lobby and a guest joins it", async ({ browser }) => {
    // Two contexts, two coaches. Sharing a context would share auth and
    // prove nothing about synchronisation.
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

      // The guest reached the host's lobby, which only Firestore could have
      // told it about.
      await guest.expectInLobby(code);
      await host.expectInLobby(code);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  /**
   * Reconnect, through the path the app actually supports: the menu's resume
   * banner, driven by `getActiveMatchCode`.
   *
   * Note that navigating straight to `/online/lobby/<code>` in a fresh page
   * bounces back to the menu rather than restoring the lobby. That may well
   * be deliberate, so this asserts the flow that is definitely intended
   * rather than pinning behaviour nobody has confirmed.
   */
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

      // Leave the lobby, come back to the menu: the coach's in-progress
      // match is offered again, which means the lobby survived as server
      // state rather than page state.
      await hostPage.goto("/");
      const resume = hostPage.getByRole("button", { name: new RegExp(code) });
      await expect(resume).toBeVisible({ timeout: 30_000 });

      // …and following it lands back in that same lobby.
      await resume.click();
      await host.expectInLobby(code);
    } finally {
      await hostContext.close();
    }
  });
});
