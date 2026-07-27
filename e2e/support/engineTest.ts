/**
 * The engine project's test base.
 *
 * Playwright creates `browser`/`context`/`page` lazily, so "we never launch
 * Chromium here" is only true while nobody asks for them. These overrides
 * turn that convention into an enforced contract: requesting any browser
 * fixture from an engine spec fails the test with an explanation instead of
 * quietly costing a browser launch per worker.
 */

import { test as base, expect } from "@playwright/test";

/** Thrown in place of a browser fixture the engine project must not use. */
export function refuseBrowserFixture(fixture: string): never {
  throw new Error(
    `engine-scenarios is a browser-free project: '${fixture}' is not available here. ` +
      `Move this case to e2e/browser (browser-gameplay) if it needs the UI.`
  );
}

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  browser: async ({}, use) => {
    await use(refuseBrowserFixture("browser"));
    void use;
  },
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    await use(refuseBrowserFixture("context"));
    void use;
  },
  // eslint-disable-next-line no-empty-pattern
  page: async ({}, use) => {
    await use(refuseBrowserFixture("page"));
    void use;
  },
});

export { expect };
