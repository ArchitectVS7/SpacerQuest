import { defineConfig } from 'vitest/config';

// T-1701a. `include` is REQUIRED, not decorative: vitest's default include would
// collect `e2e/*.spec.ts` — Playwright specs that import `@playwright/test` and
// launch a real Electron binary — and the unit suite would die on the first
// import. Scoping to `src/**/*.test.ts` keeps the two runners apart, matching
// `playwright.config.ts`'s `testDir: './e2e'` from the other side.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
