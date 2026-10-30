/**
 * A seeded scenario's expected outcome holds only for its own seed. On
 * any other seed the sandbox must not promise it.
 */
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

const PROMISE = "Pass and catch will both succeed";

test("the sandbox shows a scenario's expected outcome only on its own seed", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "pass-success-seeded", seed: 776 });
  await expect(app.sandbox.scenarioInfo()).toContainText(PROMISE);

  await app.sandbox.open({ scenario: "pass-success-seeded", seed: 3 });
  expect(await app.sandbox.loadedSeed()).toBe(3);
  await expect(app.sandbox.scenarioInfo()).not.toContainText(PROMISE);
});
