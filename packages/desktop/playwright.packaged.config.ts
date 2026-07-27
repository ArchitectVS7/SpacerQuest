import { defineConfig } from '@playwright/test';

// ---------------------------------------------------------------------------
// T-1701b · The PACKAGED build's e2e suite.
//
// A second config rather than a project in `playwright.config.ts`, for one
// reason that is the point of the whole task: THERE IS NO `webServer` KEY HERE.
// The dev config starts `packages/ui`'s `vite preview` and points the shell at
// it; a packaged app that still needed that server would not be packaged. The
// ABSENCE of the key is the proof, and it cannot be expressed as a project
// option because `webServer` is config-level.
//
// Run it with `npm run test:e2e:packaged -w @spacerquest/desktop`, after
// `npm run package:win` / `package:mac`. The spec THROWS (rather than skipping)
// when no binary is present — see its header.
// ---------------------------------------------------------------------------

export default defineConfig({
  testDir: './e2e',
  testMatch: /packaged\.spec\.ts/,
  // A packaged launch pays an install-tree cold start plus, on Windows, a
  // first-run SmartScreen/Defender scan of a freshly written binary. 180s is
  // the same budget the dev suite uses for its five-launch migration test.
  timeout: 180_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // SERIAL: one packaged app, one single-instance lock (`main.ts` takes one, so
  // a second concurrent launch would hand its focus to the first and exit).
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
});
