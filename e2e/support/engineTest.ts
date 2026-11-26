import { test as base,  } from "@playwright/test";

export function refuseBrowserFixture(fixture: string): never {
  throw new Error(
    `engine-scenarios is a browser-free project: '${fixture}' is not available here. ` +
      `Move this case to e2e/browser (browser-gameplay) if it needs the UI.`
  );
}

export const test = base.extend({
  browser: async ({}, use) => {
    await use(refuseBrowserFixture("browser"));
    use;
  },

  context: async ({}, use) => {
    await use(refuseBrowserFixture("context"));
    use;
  },

  page: async ({}, use) => {
    await use(refuseBrowserFixture("page"));
    use;
  },
});



export {expect} from "@playwright/test";
