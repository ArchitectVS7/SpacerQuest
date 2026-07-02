/**
 * SpacerQuest v4.0 — Shared E2E Boot Fixture
 *
 * One reliable path from a cold browser to the main menu, used by every browser
 * playtest (scripted engine + LLM agent). It drives the real UI:
 *   1. Load the app, clear any stale auth.
 *   2. Click the Development Login button (full-page redirect → /?token=JWT).
 *   3. Create a character through the DOM form if prompted.
 *   4. Wait on the terminal's stable readiness marker (data-ready="true") — NOT
 *      xterm-text regex, NOT reload+re-emit hacks (those only existed to paper over
 *      the WebSocket listener race, now fixed at the source in wsClient/App).
 *   5. Return the JWT the app stored (for read-only API state assertions).
 *
 * Player actions still go exclusively through the terminal; the token is only for
 * backend state observation, which is an accepted use.
 */

import { Page } from '@playwright/test';
import { waitForReady } from './terminal';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export interface BootOptions {
  /** Character name to create if the creation form appears. */
  characterName?: string;
  /** Ship name to create if the creation form appears. */
  shipName?: string;
  /** Max time to wait for the main menu to become ready. */
  readyTimeoutMs?: number;
}

export interface BootResult {
  token: string;
}

/**
 * Boot the browser to a ready main menu and return the stored JWT.
 */
export async function bootToMainMenu(page: Page, opts: BootOptions = {}): Promise<BootResult> {
  const readyTimeoutMs = opts.readyTimeoutMs ?? 30000;

  // --- 1. Cold load, clear stale auth so we exercise the real login path ---
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // --- 2. Dev login through the UI ---
  // The real control is the button labelled "[D] Development Login" (LoginScreen.tsx).
  const devLoginBtn = page.getByRole('button', { name: /Development Login/i });
  const authVisible = await devLoginBtn
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (authVisible) {
    // Clicking navigates the whole page to /auth/dev-login, which 302s back to /?token=JWT.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
      devLoginBtn.click(),
    ]);
  }

  // --- 3. Character creation (DOM form), only for a brand-new dev user ---
  // Race the creation form (new user) against the ready marker (existing character)
  // so returning users don't burn a timeout waiting for a form that never appears.
  const outcome = await Promise.race([
    page.waitForSelector('input[type="text"]', { timeout: 15000 }).then(() => 'create' as const).catch(() => 'none' as const),
    page.waitForSelector('.terminal-container[data-ready="true"]', { timeout: 15000 }).then(() => 'ready' as const).catch(() => 'none' as const),
  ]);

  if (outcome === 'create') {
    const suffix = String(Date.now()).slice(-4);
    const charName = opts.characterName ?? `Scout${suffix}`;
    const shipName = opts.shipName ?? 'Wayfarer';
    const inputs = page.locator('input[type="text"]');
    await inputs.nth(0).fill(charName);
    await inputs.nth(1).fill(shipName);
    await page.getByRole('button', { name: /Create Character/i }).click();
  }

  // --- 4. Wait on the stable readiness signal (data-ready) ---
  await waitForReady(page, readyTimeoutMs);

  // --- 5. Return the JWT the app persisted (backend state reads only) ---
  const token = await page.evaluate((): string => {
    try {
      const raw = localStorage.getItem('spacerquest-storage');
      if (!raw) return '';
      return (JSON.parse(raw) as { state?: { token?: string } })?.state?.token ?? '';
    } catch {
      return '';
    }
  });

  return { token };
}
