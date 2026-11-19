import { type BrowserContext, type Page, expect } from "@playwright/test";

export class OnlinePage {
  private readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  async signIn(): Promise<void> {
    await this.page
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    const popupPromise = this.page.waitForEvent("popup", { timeout: 30_000 });
    await this.page
      .getByTestId("sign-in-dialog")
      .getByRole("button", { name: /sign in with google/i })
      .click();
    const popup = await popupPromise;
    await popup.waitForLoadState();

    await popup
      .getByRole("button", { name: /add new account/i })
      .click({ timeout: 20_000 });

    await popup
      .getByRole("button", { name: /auto.?generate user information/i })
      .click({ timeout: 10_000 })
      .catch(() => undefined);
    await popup
      .getByRole("button", { name: /sign in with google\.com/i })
      .click({ timeout: 20_000 });
    await popup.waitForEvent("close").catch(() => undefined);

    await expect(
      this.page.getByRole("button", { name: /sign out/i })
    ).toBeVisible({ timeout: 20_000 });
  }

  async hostGame(): Promise<string> {
    await this.page.getByRole("button", { name: "Host Game" }).click();
    await expect(this.page).toHaveURL(/\/online\/(host|lobby)/);

    const codeElement = this.page.getByTestId("lobby-code");
    await expect(codeElement).toBeVisible({ timeout: 30_000 });
    const code = await codeElement.getAttribute("data-code");
    if (!code) throw new Error("the lobby rendered without a code");
    return code;
  }

  async joinGame(code: string): Promise<void> {
    await this.page.getByRole("button", { name: "Join Game" }).click();
    await expect(this.page).toHaveURL(/\/online\/join/);
    await this.page.getByRole("textbox").first().fill(code);
    await this.page
      .getByRole("button", { name: /join|enter|connect/i })
      .first()
      .click();
  }

  async expectInLobby(code: string): Promise<void> {
    await expect(this.page.getByTestId("lobby-code")).toHaveAttribute(
      "data-code",
      code,
      { timeout: 30_000 }
    );
  }
}

export async function newCoach(
  context: BrowserContext
): Promise<{ page: Page; online: OnlinePage }> {
  const page = await context.newPage();
  await page.goto("/");
  return { page, online: new OnlinePage(page) };
}
