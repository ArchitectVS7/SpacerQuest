/**
 * SpacerQuest — Boot Smoke Test
 *
 * A fast, deterministic guard for the WebSocket auth → main-menu handshake that
 * used to be flaky (the server's main-menu render could arrive before the React
 * listener registered, stranding the browser at the auth screen). Run repeatedly
 * (`--repeat-each`) it proves the boot is race-free. Also a quick CI signal that
 * the terminal readiness marker and login flow work end-to-end.
 */

import { test, expect, request as apiRequest } from '@playwright/test';
import { bootToMainMenu } from '../helpers/boot';
import { getScreenName } from '../helpers/terminal';

const API_URL = 'http://localhost:3000';

test('boots from cold to a ready main menu (no reload/poke)', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const requestCtx = await apiRequest.newContext({ baseURL: API_URL });

  try {
    const { token } = await bootToMainMenu(page);

    // The stable readiness marker is set...
    await expect(page.locator('.terminal-container[data-ready="true"]')).toBeVisible();
    // ...the app reports the main menu...
    expect(await getScreenName(page)).toBe('main-menu');
    // ...and we captured a JWT for backend state reads.
    expect(token).toBeTruthy();
  } finally {
    await requestCtx.dispose();
    await ctx.close();
  }
});
