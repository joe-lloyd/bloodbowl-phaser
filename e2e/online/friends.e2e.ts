import { expect, type Page, test } from "@playwright/test";
import { OnlinePage } from "../support/pages/online";

test.describe.configure({ mode: "serial", timeout: 180_000 });

async function openFriends(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /^Friends/ }).click();
  await expect(page).toHaveURL(/\/friends$/);
}

async function friendCode(page: Page): Promise<string> {
  const code = page.getByTestId("friend-code");
  await expect(code).toHaveAttribute("data-code", /^[A-Z0-9]{8}$/, {
    timeout: 30_000,
  });
  return (await code.getAttribute("data-code")) ?? "";
}

test("two coaches become friends and one invites the other into a match @online", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const shot = (page: Page, name: string) =>
    page.screenshot({ path: test.info().outputPath(`${name}.png`) });

  try {
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    await hostPage.goto("/");
    await new OnlinePage(hostPage).signIn();
    await guestPage.goto("/");
    await new OnlinePage(guestPage).signIn();

    await openFriends(guestPage);
    const code = await friendCode(guestPage);

    await openFriends(hostPage);
    await hostPage.getByLabel("Friend code").fill(code.toLowerCase());
    await hostPage.getByRole("button", { name: "Send request" }).click();
    await expect(hostPage.getByText(/Friend request sent to/)).toBeVisible();
    await expect(hostPage.getByText(/^Waiting for .* to accept$/)).toBeVisible();

    await expect(guestPage.getByText(/wants to be friends$/)).toBeVisible();
    await shot(guestPage, "guest-request");
    await guestPage.getByRole("button", { name: "Accept" }).click();

    await expect(
      hostPage.getByRole("button", { name: "Invite to game" })
    ).toBeVisible();
    await shot(hostPage, "host-friends");
    await hostPage.getByRole("button", { name: "Invite to game" }).click();
    const lobbyCode = hostPage.getByTestId("lobby-code");
    await expect(lobbyCode).toHaveAttribute("data-code", /^[A-Z0-9]{6}$/, {
      timeout: 30_000,
    });
    const matchCode = (await lobbyCode.getAttribute("data-code")) ?? "";

    await guestPage.goto("/");
    const invite = guestPage.getByTestId("match-invite");
    await expect(invite).toContainText("invited you to a match");
    await shot(guestPage, "guest-menu-invite");
    await invite.getByRole("button", { name: "Join" }).click();

    await expect(guestPage.getByTestId("lobby-code")).toHaveAttribute(
      "data-code",
      matchCode,
      { timeout: 30_000 }
    );
    await expect(hostPage.getByText("Waiting for opponent…")).toBeHidden();
    await expect(hostPage.getByText("Friend", { exact: true })).toBeVisible();
    await shot(hostPage, "host-lobby-joined");
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
