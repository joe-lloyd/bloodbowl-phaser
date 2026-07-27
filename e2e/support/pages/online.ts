/**
 * Page objects for the emulator-backed online lane.
 *
 * Sign-in goes through `signInWithPopup(GoogleAuthProvider)`. Against the
 * Firebase auth emulator that popup is a local page with an "Add new
 * account" flow, so a test can create a fresh coach per context without any
 * real credentials — which is exactly why this lane can run anywhere.
 */

import { BrowserContext, Page, expect } from "@playwright/test";

export class OnlinePage {
  constructor(private readonly page: Page) {}

  /**
   * Sign in as a fresh emulator account.
   *
   * The emulator's popup offers existing accounts and an "Add new account"
   * button; a new account is created with an auto-generated identity, which
   * keeps host and guest genuinely distinct coaches.
   */
  async signIn(): Promise<void> {
    const popupPromise = this.page.waitForEvent("popup");
    await this.page.getByRole("button", { name: /sign in with google/i }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();

    const addAccount = popup.getByRole("button", { name: /add new account/i });
    if (await addAccount.isVisible().catch(() => false)) {
      await addAccount.click();
    }
    // The emulator pre-fills a random identity; "Sign in with Google.com"
    // completes it.
    const autoGenerate = popup.getByRole("button", {
      name: /auto.?generate user information/i,
    });
    if (await autoGenerate.isVisible().catch(() => false)) {
      await autoGenerate.click();
    }
    await popup
      .getByRole("button", { name: /sign in with google\.com/i })
      .click();
    await popup.waitForEvent("close").catch(() => undefined);

    // The menu swaps the sign-in button for the coach editor once auth lands.
    await expect(
      this.page.getByRole("button", { name: /sign out/i })
    ).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Host a game and return the lobby code the app generated.
   *
   * The lobby renders in place at `/online/host` rather than navigating to
   * `/online/lobby/<code>`, so the code is read from the page — which is
   * also where a real coach reads it from.
   */
  async hostGame(): Promise<string> {
    await this.page.getByRole("button", { name: "Host Game" }).click();
    await expect(this.page).toHaveURL(/\/online\/(host|lobby)/);

    const codeElement = this.page.getByTestId("lobby-code");
    await expect(codeElement).toBeVisible({ timeout: 30_000 });
    const code = await codeElement.getAttribute("data-code");
    if (!code) throw new Error("the lobby rendered without a code");
    return code;
  }

  /** Join an existing lobby by its code. */
  async joinGame(code: string): Promise<void> {
    await this.page.getByRole("button", { name: "Join Game" }).click();
    await expect(this.page).toHaveURL(/\/online\/join/);
    await this.page.getByRole("textbox").first().fill(code);
    await this.page
      .getByRole("button", { name: /join|enter|connect/i })
      .first()
      .click();
  }

  /** True once this page is showing the lobby for `code`. */
  async expectInLobby(code: string): Promise<void> {
    await expect(this.page.getByTestId("lobby-code")).toHaveAttribute(
      "data-code",
      code,
      { timeout: 30_000 }
    );
  }
}

/** A fresh context is a fresh coach: no shared auth state between them. */
export async function newCoach(
  context: BrowserContext
): Promise<{ page: Page; online: OnlinePage }> {
  const page = await context.newPage();
  await page.goto("/");
  return { page, online: new OnlinePage(page) };
}
