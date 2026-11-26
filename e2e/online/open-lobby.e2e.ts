import { expect, type Page, test } from "@playwright/test";
import { OnlinePage } from "../support/pages/online";

test.describe.configure({ mode: "serial", timeout: 180_000 });

const shot = (page: Page, name: string) =>
  page.screenshot({ path: test.info().outputPath(`${name}.png`) });

test("a host opens a lobby and a stranger joins it from Open games @online", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    const host = new OnlinePage(hostPage);
    await hostPage.goto("/");
    await host.signIn();
    const code = await host.hostGame();
    const open = hostPage.getByRole("checkbox", { name: /Open game/ });
    await open.click();
    await expect(open).toBeChecked();
    await shot(hostPage, "host-open-lobby");

    await guestPage.goto("/");
    await new OnlinePage(guestPage).signIn();
    await guestPage.getByRole("button", { name: "Join Game" }).click();
    const listed = guestPage.locator(
      `[data-testid="open-game"][data-code="${code}"]`
    );
    await expect(listed).toBeVisible({ timeout: 30_000 });
    await shot(guestPage, "guest-open-games");
    await listed.getByRole("button", { name: "Join" }).click();

    await expect(guestPage.getByTestId("lobby-code")).toHaveAttribute(
      "data-code",
      code,
      { timeout: 30_000 }
    );
    await expect(guestPage).toHaveURL(new RegExp(`/online/lobby/${code}$`));
    await guestPage.reload();
    await expect(guestPage.getByTestId("lobby-code")).toHaveAttribute(
      "data-code",
      code,
      { timeout: 30_000 }
    );
    await expect(hostPage.getByText("Waiting for opponent…")).toBeHidden();
    await expect(
      hostPage.getByRole("checkbox", { name: /Open game/ })
    ).toBeHidden();
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test("a host who leaves takes the lobby off Open games @online", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    const host = new OnlinePage(hostPage);
    await hostPage.goto("/");
    await host.signIn();
    const code = await host.hostGame();
    await hostPage.getByRole("checkbox", { name: /Open game/ }).click();

    await guestPage.goto("/");
    await new OnlinePage(guestPage).signIn();
    await guestPage.getByRole("button", { name: "Join Game" }).click();
    const listed = guestPage.locator(
      `[data-testid="open-game"][data-code="${code}"]`
    );
    await expect(listed).toBeVisible({ timeout: 30_000 });

    await hostPage.getByRole("button", { name: "Leave" }).click();
    await expect(listed).toBeHidden({ timeout: 15_000 });
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
