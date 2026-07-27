import { defineConfig, devices } from '@playwright/test';

// ---------------------------------------------------------------------------
// T-1703 · THE DEMO-GATE CONFIG.
//
// A SECOND config rather than a project inside the existing one, on the
// `playwright.packaged.config.ts` precedent — and here, as there, the
// CONFIGURATION IS PART OF THE PROOF. This is the only place in the repo that
// builds BOTH bundles and serves them side by side, which is what makes the
// gate's negative half assertable: the same control, in the same test run, gated
// on one build and live on the other. A single-build suite can only ever
// screenshot the demo and hope.
//
// TWO WEB SERVERS, TWO PORTS:
//   * :5173 — `vite build && vite preview`, the FULL cockpit. Byte-identical to
//     what the 92-test web suite already tests.
//   * :5174 — `vite build --mode demo && vite preview --mode demo`, the DEMO
//     cockpit, with `__SQ_EDITION__` compiled in.
// The ports come from `vite.config.ts` (both `strictPort`), so a misconfiguration
// fails loudly at boot instead of silently serving the wrong bundle.
//
// IT MUST NOT CHANGE THE SHAPE OF THE WEB SUITE. `playwright.config.ts` ignores
// `demo-gate.spec.ts`, so the functional run and the `@tour-one` flake
// denominator keep exactly the counts they had. Run this one explicitly:
//     npm run test:e2e:demo -w @spacerquest/ui
//
// `workers: 1` because the two tests that cross builds move a downloaded save
// file between origins; serialising them keeps the download directory
// unambiguous and costs nothing at four tests.
// ---------------------------------------------------------------------------

const TEST_TIMEOUT_MS = 120_000;
const EXPECT_TIMEOUT_MS = 10_000;

export default defineConfig({
  testDir: './e2e',
  testMatch: /demo-gate\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // Longer than the web suite's 60s: the ceiling test plays 33 days of dusk
  // through the real cockpit, one click at a time.
  timeout: TEST_TIMEOUT_MS,
  expect: { timeout: EXPECT_TIMEOUT_MS },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    // The DEMO build is the subject, so it is the default origin; the full build
    // is reached by absolute URL in the two cross-build tests.
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run build && npm run preview',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run build:demo && npm run preview:demo',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
