import { defineConfig, devices } from '@playwright/test';

// Boot-smoke config (T-301). Playwright builds the engine + starts Vite's preview
// server, then drives the real cockpit. `reuseExistingServer` keeps local reruns
// fast; CI always boots a fresh server.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // T-1605 · Timeout headroom for slow/loaded machines. The heaviest specs
  // (nemesis-arc, tour-one) inject a long career as the boot save and then assert
  // through the real cockpit, so their FIRST assertion after a cold `page.goto`
  // pays the one-off bundle-fetch + React-mount cost. On a loaded orchestrator/CI
  // box that cold render can run well past Playwright's tight defaults (30s per
  // test / 5s per `expect`), failing the first locator purely on timing — an
  // observed intermittent gate failure with retries:0 outside CI. These raised
  // ceilings only ever help an assertion that WOULD eventually pass; a genuinely
  // missing element still fails (now after 15s), so nothing is masked.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // In CI, emit an HTML report (bundles the tour-one run-report attachments) plus a
  // JSON result file, both into `test-results` so the workflow can upload them as
  // the T-1602 run-report artifact. `list`/`github` keep the inline log readable.
  reporter: process.env.CI
    ? [
        ['github'],
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'test-results/results.json' }],
      ]
    : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  // T-1701 · The Electron shell spec launches a real Electron process (`_electron`)
  // and never touches the Vite server, so it lives in its own project, gated behind
  // `SQ_ELECTRON`. The default web run (chromium) IGNORES it — so `npm run test:e2e`
  // stays a pure web run that never spawns Electron — and when SQ_ELECTRON is set the
  // web server is skipped entirely (the Electron app loads dist-web over file://).
  // T-1703 · A third, opt-in `demo` project (gated behind `SQ_DEMO`, mirroring the
  // `SQ_ELECTRON` pattern) whose webServer serves the REAL `VITE_SQ_DEMO=1` build, so
  // `demo-gate.spec.ts` proves the actual demo BUILD gates veteran content — a second
  // full `vite build`, so it stays off the default run. The default chromium run
  // IGNORES `demo-gate.spec.ts` (it needs the demo build) but KEEPS
  // `demo-save-carry.spec.ts` — that spec proves a day-33 demo save carries into the
  // FULL build, so it must run against the ordinary (non-demo) server.
  projects: process.env.SQ_ELECTRON
    ? [{ name: 'electron', testMatch: /electron-.*\.spec\.ts/ }]
    : process.env.SQ_DEMO
      ? [{ name: 'demo', use: { ...devices['Desktop Chrome'] }, testMatch: /demo-gate\.spec\.ts/ }]
      : [
          {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            testIgnore: [/electron-.*\.spec\.ts/, /demo-gate\.spec\.ts/],
          },
        ],
  webServer: process.env.SQ_ELECTRON
    ? undefined
    : {
        command: process.env.SQ_DEMO
          ? 'npm run build:demo && npm run preview'
          : 'npm run build && npm run preview',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
