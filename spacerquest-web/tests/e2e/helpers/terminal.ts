/**
 * SpacerQuest v4.0 - Terminal Interaction Helpers
 *
 * Provides functions to read xterm.js terminal text and send keyboard input
 * through the browser DOM. All input goes through xterm's hidden textarea.
 */

import { Page } from '@playwright/test';

/** Selector for xterm.js rows container */
const XTERM_ROWS = '.xterm-rows';

/** Selector for xterm.js hidden input element */
const XTERM_INPUT = '.xterm-helper-textarea';

/**
 * Screens that accumulate typed input until Enter is pressed.
 * Must match Terminal.tsx BUFFERED_SCREENS exactly.
 */
export const BUFFERED_SCREENS = [
  'traders-buy-fuel', 'traders-sell-fuel', 'traders-cargo',
  'navigate', 'bank-deposit', 'bank-withdraw', 'bank-transfer',
  'shipyard-upgrade', 'registry-search', 'alliance-invest',
];

/**
 * Read all visible text from the xterm.js terminal.
 * DOM textContent strips ANSI styling automatically.
 */
export async function getTerminalText(page: Page): Promise<string> {
  try {
    const rows = page.locator(XTERM_ROWS);
    await rows.waitFor({ state: 'attached', timeout: 5000 });
    const text = await rows.textContent();
    return text || '';
  } catch {
    return '';
  }
}

/**
 * Poll the terminal until a RegExp pattern matches the visible text.
 * Returns the full terminal text on match.
 * Throws if timeout is exceeded.
 */
export async function waitForText(
  page: Page,
  pattern: RegExp,
  timeoutMs = 30000,
): Promise<string> {
  const start = Date.now();
  const pollInterval = 250;

  while (Date.now() - start < timeoutMs) {
    const text = await getTerminalText(page);
    if (pattern.test(text)) {
      return text;
    }
    await page.waitForTimeout(pollInterval);
  }

  const finalText = await getTerminalText(page);
  throw new Error(
    `waitForText: pattern ${pattern} not found after ${timeoutMs}ms.\n` +
    `Terminal text (last 500 chars): "${finalText.slice(-500)}"`,
  );
}

/**
 * Focus the xterm hidden textarea and press a single key.
 * Used for unbuffered screens that react to individual keypresses.
 */
export async function pressKey(page: Page, key: string): Promise<void> {
  const input = page.locator(XTERM_INPUT);
  await input.focus();
  await page.keyboard.press(key);
  // Small delay to let the server process the input and render
  await page.waitForTimeout(300);
}

/**
 * Focus the xterm hidden textarea, type text character by character,
 * then press Enter. Used for buffered screens.
 */
export async function typeAndEnter(page: Page, text: string): Promise<void> {
  const input = page.locator(XTERM_INPUT);
  await input.focus();
  await page.keyboard.type(text, { delay: 50 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

/**
 * Known screen headers mapped to screen names.
 */
const SCREEN_PATTERNS: Array<[RegExp, string]> = [
  [/MAIN MENU/i, 'main-menu'],
  [/GALACTIC BANK|BANKING MENU/i, 'bank'],
  [/GALACTIC SHIPYARD|SHIP.*STATUS/i, 'shipyard'],
  [/LONELY ASTEROID PUB|PUB MENU/i, 'pub'],
  [/INTERGALACTIC TRADERS|TRADERS MENU/i, 'traders'],
  [/SPACE REGISTRY|REGISTRY/i, 'registry'],
  [/NAVIGATE|DESTINATION/i, 'navigate'],
  [/COMBAT|ENCOUNTER/i, 'combat'],
  [/ALLIANCE INVESTMENT|INVEST/i, 'alliance-invest'],
  [/CREATE NEW SPACER/i, 'character-create'],
  [/SpacerQuest Authentication/i, 'login'],
  [/JAIL|BRIG/i, 'jail'],
];

/**
 * Detect which screen is currently displayed by matching terminal text
 * against known headers.
 */
export async function detectScreen(page: Page): Promise<string | null> {
  const text = await getTerminalText(page);
  for (const [pattern, name] of SCREEN_PATTERNS) {
    if (pattern.test(text)) {
      return name;
    }
  }
  return null;
}

/**
 * Wait until the terminal shows a specific screen.
 */
export async function waitForScreen(
  page: Page,
  screenName: string,
  timeoutMs = 15000,
): Promise<void> {
  const entry = SCREEN_PATTERNS.find(([, name]) => name === screenName);
  if (!entry) {
    throw new Error(`Unknown screen: ${screenName}`);
  }
  await waitForText(page, entry[0], timeoutMs);
}
