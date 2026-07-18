import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// T-1703 · Vitest for the ui package's pure-predicate unit tests (demo.test.ts is the
// first). Scoped to `src/**/*.test.ts` ONLY so it never picks up the Playwright specs
// under `e2e/**` (those match vitest's default `*.spec.*` glob and would fail if run as
// vitest). The workspace-wide `npm test` picks this up via ui's `"test": "vitest run"`.
//
// T-1704 · Vitest resolves THIS config, not vite.config.ts, so the `__APP_VERSION__`
// build-time constant defined there is invisible here. Re-declare the SAME `define` from
// the SAME source (this package's `version`) so version.test.ts — the named reader that
// asserts the stamp never drifts from package.json — runs with the global defined.
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  .version as string;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkgVersion) },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
