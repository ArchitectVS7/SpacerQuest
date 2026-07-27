import { defineConfig } from 'vitest/config';

// T-1701a · The UI's first vitest suite (`src/__tests__/storage.test.ts`).
//
// A STANDALONE config, not a `test:` block inside `vite.config.ts`, on purpose:
// the web build's config is load-bearing for the e2e suite (`dist-web`, the
// preview server, the React plugin) and must not grow a test surface.
//
// `include` is REQUIRED, not decorative: vitest's default include is
// `**/*.{test,spec}.?(c|m)[jt]s?(x)`, which would sweep up the 28 Playwright
// specs in `e2e/` and fail the whole suite on the first `@playwright/test`
// import. Scoping to `src/**/*.test.ts` is what keeps the two runners apart —
// the same separation `playwright.config.ts` gets from its `testDir: './e2e'`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // `storage.ts` is deliberately total over a missing `window` (its in-memory
    // fallback), and the test drives `selectStorage`/`migrateInto` with plain
    // fake objects — so no DOM is needed and none is provided. If a UI test ever
    // needs one it should say so with a per-file `@vitest-environment` comment
    // rather than slowing every suite down.
    environment: 'node',
  },
});
