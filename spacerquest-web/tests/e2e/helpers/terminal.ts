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
  'pub-wof',
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
  [/SpacerQuest Authentication/i, 'login'],
  [/CREATE NEW SPACER/i, 'character-create'],
  [/JAIL|BRIG/i, 'jail'],
  [/COMBAT|Intruder Alert|A\]ttack.*S\]urrender/i, 'combat'],
  [/MAIN MENU|Port Accounts/i, 'main-menu'],
  [/Star Port Facilities|Docking Fee.*pay it/i, 'rim-port'],
  [/ALLIANCE INVESTMENT CENTER/i, 'alliance-invest'],
  [/Manifest Board/i, 'traders-cargo'],
  // Buy/sell fuel: actual headers are "BUY TRANSCEND FUEL" and "SELL TRANSCEND FUEL"
  [/BUY TRANSCEND FUEL|units to buy/i, 'traders-buy-fuel'],
  [/SELL TRANSCEND FUEL|TRANSFER TRANSCEND FUEL|units to sell/i, 'traders-sell-fuel'],
  [/Enter amount to deposit/i, 'bank-deposit'],
  [/Enter amount to withdraw/i, 'bank-withdraw'],
  [/GALACTIC BANK|BANKING MENU/i, 'bank'],
  [/GALACTIC SHIPYARD|SHIP.*STATUS|SHIPYARD MENU/i, 'shipyard'],
  [/COMPONENT UPGRADE|Select a component to upgrade|Upgrade failed|Invalid component selection/i, 'shipyard-upgrade'],
  [/Special Equipment/i, 'shipyard-special'],
  [/LONELY ASTEROID PUB|PUB MENU/i, 'pub'],
  [/How many rolls\?|Bet amount\? \(1-/i, 'pub-wof'],
  [/The wheel spins|WINNER! Number|No luck\. Number|closed for renovations/i, 'pub-result'],
  [/INTERGALACTIC TRADERS|TRADERS MENU/i, 'traders'],
  [/SPACE REGISTRY|REGISTRY/i, 'registry'],
  [/SPACE PATROL HEADQUARTERS|Space Patrol Orders/i, 'space-patrol'],
  [/NAVIGATE|DESTINATION/i, 'navigate'],
  [/END YOUR TURN|End your turn\?/i, 'end-turn'],
];

/**
 * Detect which screen is currently displayed by matching terminal text
 * against known headers.
 *
 * Only checks the most recent 2000 characters to avoid false matches
 * against xterm.js scrollback buffer content from past screens.
 */
export async function detectScreen(page: Page): Promise<string | null> {
  const text = await getTerminalText(page);
  // Use only recent content — xterm.js scrollback retains old screens after \x1b[2J clears
  // the visible area, so checking the full buffer causes stale screen mis-detection.
  const recent = text.slice(-3000);
  for (const [pattern, name] of SCREEN_PATTERNS) {
    if (pattern.test(recent)) {
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
