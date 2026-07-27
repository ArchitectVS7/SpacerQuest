import { defineConfig } from '@playwright/test';

// ---------------------------------------------------------------------------
// T-1701a · The Electron shell's e2e suite.
//
// A SECOND Playwright root, in `packages/desktop` rather than `packages/ui/e2e`,
// deliberately:
//   * the web suite's 92 tests and its flake gate (`e2e-flake.yml`,
//     `flake-rate.spec.ts`, whose denominator is the `@tour-one` tag) must not
//     change shape — a desktop test in that directory would dilute the gate and
//     put an `electron` launch inside the browser suite's parallel matrix;
//   * `packages/desktop` is the package that owns the `electron` dependency, and
//     a test should live with the binary it launches.
//
// The renderer is the SAME artifact the web suite tests — this config starts
// `packages/ui`'s `vite preview` and the shell points at it. That is what makes
// "web build unaffected" a claim about one build rather than two.
// ---------------------------------------------------------------------------

export default defineConfig({
  testDir: './e2e',
  // Same reasoning as `packages/ui/playwright.config.ts` — sized for a contended
  // workstation, not an idle one — but with a bigger budget, because these tests
  // do something no browser test does: the migration test LAUNCHES AND CLOSES
  // FIVE SEPARATE ELECTRON APPS in one test (a web-storage career, a re-check
  // that it flushed, the importing boot, and an idempotence boot), each paying a
  // full process spawn plus a Chromium profile cold start. 180s is roughly 4x
  // the observed run, not a mask for a hang.
  timeout: 180_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // SERIAL, and this is load-bearing rather than conservative: every test drives
  // a real Electron app, and the migration test relaunches the SAME app against
  // the SAME save dir to prove the career came off disk. Parallel workers would
  // interleave those launches. Each test still gets its own temp dirs.
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  webServer: {
    command: 'npm run build && npm run preview',
    cwd: '../ui',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
