import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test("a coach creates an email account, signs out and back in @online", async ({
  page,
}) => {
  const email = `coach-${String(Date.now())}@example.com`;
  const dialog = page.getByTestId("sign-in-dialog");
  const signOut = page.getByRole("button", { name: /sign out/i });
  const openSignIn = () =>
    page.getByRole("button", { name: "Sign in", exact: true }).click();

  await page.goto("/");
  await openSignIn();
  await dialog
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill("tackle-zone-7");
  await page.screenshot({ path: test.info().outputPath("create-account.png") });
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(signOut).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Check your inbox")).toBeVisible();

  await signOut.click();
  await openSignIn();
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill("not-the-password");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog).toContainText("Wrong email or password.");

  await dialog.getByLabel("Password").fill("tackle-zone-7");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(signOut).toBeVisible({ timeout: 20_000 });
});
