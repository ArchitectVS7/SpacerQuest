import { defineConfig } from 'vitest/config';

// T-1703 · Vitest for the ui package's pure-predicate unit tests (demo.test.ts is the
// first). Scoped to `src/**/*.test.ts` ONLY so it never picks up the Playwright specs
// under `e2e/**` (those match vitest's default `*.spec.*` glob and would fail if run as
// vitest). The workspace-wide `npm test` picks this up via ui's `"test": "vitest run"`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
