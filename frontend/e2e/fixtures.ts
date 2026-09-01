import { test as base, expect } from "@playwright/test";
import { loginAsManager } from "./helpers";

/**
 * Extends the base Playwright `test` so `page` is already signed in as the shared
 * manager account by the time a test body runs — every existing spec other than
 * auth.spec.ts assumes a manager session.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await loginAsManager(page);
    await use(page);
  },
});

export { expect };
