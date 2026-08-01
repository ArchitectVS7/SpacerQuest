import { expect, test, type Page } from '@playwright/test';
import { DEMO_FINAL_DAY } from '@spacerquest/content';
import { createInitialState, createSave, startDay, type GameState } from '@spacerquest/engine';
// T-147 · The two denominators below are DERIVED from the manifest, not typed.
// They used to be the literals 44 and 45; the slate grew by fifteen deeds and a
// pair of hand-typed counts would have reddened this spec for no defect — the
// same lesson `progression.spec.ts` records against its port price (T-1603b).
// The claim under test is the DIFFERENCE between the two editions, and that is
// what the derivation preserves.
import { achievementManifest } from '../src/steam';

// ---------------------------------------------------------------------------
// T-1703 · THE DEMO GATE, PROVED THROUGH THE REAL COCKPIT.
//
// This suite runs under `playwright.demo.config.ts`, which is the only place in
// the repo that boots BOTH bundles at once — the full cockpit on :5173 and the
// `--mode demo` cockpit on :5174. That configuration is part of the proof: every
// gate assertion below is paired with the SAME assertion inverted against the
// full build, in the same run, on the same control. A demo-only suite could only
// ever screenshot the demo and hope.
//
// WHY `click({ trial: true })` IS THE PROBE. It runs Playwright's full
// actionability chain — visible, stable, receives events, ENABLED — and then does
// not dispatch. A disabled control fails it. That is a stronger claim than
// absence: a hidden control proves nothing about a control that is merely
// off-screen, and the task's own word is "teased-but-gated", so the controls MUST
// still be on screen. Same technique `action-blocked-parity.spec.ts` established.
//
// WHERE STATE IS INJECTED, AND WHY. Two of the four tests seed a career through
// the store's own save key, because the gated purchases have PRICES (the Sun-3
// port stake and every crew role cost more than a day-1 captain's 1,000cr), so a
// fresh career's buy button is disabled for AFFORDABILITY on both builds and the
// mirror assertion would be vacuous. Injection is the established idiom here
// (`alliance-arcs.spec.ts`, `nemesis-*.spec.ts`) and it is injected through
// `createSave` — the real envelope the real loader reads — never by reaching into
// the store. The CEILING test injects nothing at all: it plays a fresh demo
// career from day 1 to its last dusk with clicks only.
// ---------------------------------------------------------------------------

const FULL = 'http://localhost:5173';
const DEMO = 'http://localhost:5174';
const SEED = 17030;

/** A DAY-phase career at Sun-3 with money in hand — so the two gated purchases
 *  are refused by the GATE and never by the price. */
function affluentSave(edition: 'full' | 'demo', seed = SEED): string {
  const state: GameState = startDay(createInitialState(seed, edition)).state;
  state.player.credits = 500_000;
  return createSave(state, seed);
}

/** Boot an origin with a career already in the autosave slot. */
async function bootWith(page: Page, origin: string, save: string): Promise<void> {
  await page.addInitScript((s) => window.localStorage.setItem('sq.save.v1', s), save);
  await page.goto(`${origin}/`);
  await expect(page.getByTestId('day')).toBeVisible();
}

/** Arm the first unspent die, so every die-costed control is "armed" and its only
 *  remaining reason to be disabled is the rule under test. */
async function armFirstDie(page: Page): Promise<void> {
  const die = page.getByTestId('die').first();
  await die.click();
  await expect(die).toHaveAttribute('aria-pressed', 'true');
}

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
}

async function closeSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toHaveCount(0);
}

/** Read the CONQUEROR capstone row out of Records → Registry. */
async function capstoneLock(page: Page): Promise<string | null> {
  await page.getByTestId('records-toggle').click();
  const row = page.getByTestId('registry-capstone');
  await expect(row).toBeVisible();
  const lock = await row.getAttribute('data-demo-locked');
  await page.getByTestId('records-close').click();
  return lock;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// ---------------------------------------------------------------------------
// 1 · THE GATE HOLDS — and the full build proves it is a gate, not a wall.
// ---------------------------------------------------------------------------

test('the demo gates ports, crew hiring and the Conqueror capstone; the full build does not', async ({
  page,
}) => {
  // ---- the DEMO build --------------------------------------------------
  await bootWith(page, DEMO, affluentSave('demo'));
  await armFirstDie(page);

  // The build says what it is, without dev tools.
  await openSettings(page);
  await expect(page.getByTestId('build-edition')).toHaveAttribute('data-edition', 'demo');
  // The achievement denominator is edition-scoped: the demo is the full set MINUS
  // the Conqueror capstone — the player-visible half of the Conqueror lock.
  const demoAchievements = (await page.getByTestId('steam-achievements').textContent()) ?? '';
  expect(achievementManifest('demo')).toHaveLength(achievementManifest('full').length - 1);
  expect(demoAchievements).toContain(`of ${achievementManifest('demo').length}`);
  await closeSettings(page);

  // The licence itself is on screen, counting down.
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(page.getByTestId('demo-banner')).toHaveAttribute(
    'data-demo-days-remaining',
    String(DEMO_FINAL_DAY),
  );

  // PORTS. The control is still there, still priced, still explained — and dead.
  const buyPort = page.getByTestId('buy-port');
  await expect(buyPort).toBeVisible();
  await expect(buyPort).toHaveAttribute('data-demo-locked', 'port-ownership');
  await expect(buyPort).toBeDisabled();
  await expect(buyPort.click({ trial: true, timeout: 2000 })).rejects.toThrow();
  await expect(page.getByTestId('port-reason')).toBeVisible();

  // CREW. Same treatment, and the roster still shows what the full game buys.
  const hire = page.getByTestId('hire-crew').first();
  await expect(hire).toBeVisible();
  await expect(hire).toHaveAttribute('data-demo-locked', 'crew-progression');
  await expect(hire).toBeDisabled();
  await expect(hire.click({ trial: true, timeout: 2000 })).rejects.toThrow();

  // CONQUEROR.
  expect(await capstoneLock(page)).toBe('conqueror');

  // THE HANGOUT IS NOT GATED. "Hangout progression" means the crew progression
  // bought there, not the venue — PRD §7.3/§7.5 set two Tour One beats inside it,
  // and a demo that shut the door would cut them out of its own Tour One.
  await expect(page.getByTestId('hangout-toggle')).toBeEnabled();

  // ---- the FULL build, same controls, same career --------------------------
  await page.context().clearCookies();
  await bootWith(page, FULL, affluentSave('full'));
  await armFirstDie(page);

  await openSettings(page);
  await expect(page.getByTestId('build-edition')).toHaveAttribute('data-edition', 'full');
  expect((await page.getByTestId('steam-achievements').textContent()) ?? '').toContain(
    `of ${achievementManifest('full').length}`,
  );
  await closeSettings(page);

  // No licence banner at all — the full cockpit is unchanged.
  await expect(page.getByTestId('demo-banner')).toHaveCount(0);

  // THE NEGATIVE HALF. These are the assertions that make the block above a GATE
  // rather than a screenshot: the same two controls, with the same money and the
  // same armed die, are actionable here.
  const fullBuyPort = page.getByTestId('buy-port');
  await expect(fullBuyPort).not.toHaveAttribute('data-demo-locked', /.*/);
  await expect(fullBuyPort).toBeEnabled();
  await fullBuyPort.click({ trial: true });

  const fullHire = page.getByTestId('hire-crew').first();
  await expect(fullHire).not.toHaveAttribute('data-demo-locked', /.*/);
  await expect(fullHire).toBeEnabled();
  await fullHire.click({ trial: true });

  expect(await capstoneLock(page)).toBeNull();
});

// ---------------------------------------------------------------------------
// 2 · THE CEILING HOLDS — played, not injected.
// ---------------------------------------------------------------------------

test('a demo career plays Tour One plus three days and then ends the cockpit', async ({ page }) => {
  test.slow(); // 33 real dusks, one click each.

  await page.goto(`${DEMO}/`);
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(SEED));
  await page.getByRole('button', { name: 'Roll' }).click();
  await expect(page.getByTestId('day')).toHaveText('1');
  await expect(page.getByTestId('demo-banner')).toBeVisible();

  const readDay = async (): Promise<number> =>
    Number(((await page.getByTestId('day').textContent()) ?? '0').trim());

  // Every day the cockpit was actually alive for, recorded rather than assumed —
  // the end card's own "DAYS FLOWN" row is rendered from the CONSTANT, so it
  // cannot be the evidence that 33 days were played.
  const daysLived: number[] = [];
  let sawCeremony = false;

  for (let guard = 0; guard < DEMO_FINAL_DAY + 5; guard += 1) {
    // The end card replaces the whole cockpit, so its arrival is the loop's exit.
    if ((await page.getByTestId('demo-end-card').count()) > 0) break;

    // The day-30 resolution ceremony forces itself at the dawn of day 31 — the
    // beat the three teaser days exist to follow, so it must be ACKNOWLEDGED, not
    // dodged.
    if ((await page.getByTestId('resolution-ceremony').count()) > 0) {
      sawCeremony = true;
      await expect(page.getByTestId('campaign-era')).toHaveText('Veteran');
      if ((await page.getByTestId('resolution-choice-lock').count()) > 0) {
        await armFirstDie(page);
      }
      await page.getByTestId('resolution-choice-btn').first().click();
      await expect(page.getByTestId('resolution-ceremony')).toHaveCount(0);
    }

    const before = await readDay();
    daysLived.push(before);
    // The banner counts down in lockstep with the day — the licence's own arithmetic
    // checked once per day rather than once per run.
    await expect(page.getByTestId('demo-banner')).toHaveAttribute(
      'data-demo-days-remaining',
      String(DEMO_FINAL_DAY - before + 1),
    );
    await page.getByTestId('end-day').click();
    await expect
      .poll(async () =>
        (await page.getByTestId('demo-end-card').count()) > 0 ? before + 1 : readDay(),
      )
      .toBe(before + 1);
  }

  // EXACTLY Tour One plus three: days 1..33 were each playable, and day 34 never
  // was. This — not the end card's rendered constant — is the ceiling's evidence.
  expect(daysLived).toEqual(Array.from({ length: DEMO_FINAL_DAY }, (_unused, i) => i + 1));
  // …and the Tour One resolution really happened inside the demo, three days
  // before it ended. A demo that stopped at day 30 would never have seen it.
  expect(sawCeremony).toBe(true);

  // THE TERMINUS. The cockpit is gone; the end card is what remains.
  const card = page.getByTestId('demo-end-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('demo-end-stat').filter({ hasText: 'DAYS FLOWN' })).toContainText(
    String(DEMO_FINAL_DAY),
  );
  // No cockpit affordance survives — the engine refuses every verb from here, so
  // a live control would be a dead click.
  await expect(page.getByTestId('end-day')).toHaveCount(0);
  await expect(page.getByTestId('hand')).toHaveCount(0);
  await expect(page.getByTestId('buy-port')).toHaveCount(0);
  await expect(page.getByTestId('hire-crew')).toHaveCount(0);
  await expect(page.getByTestId('demo-banner')).toHaveCount(0);
  // The one way forward is the carry.
  await expect(page.getByTestId('demo-end-export')).toBeEnabled();
});

// ---------------------------------------------------------------------------
// 3 · THE CARRY WORKS FULL-SIDE — export from the demo, import into the game.
// ---------------------------------------------------------------------------

test('a demo career exports and the full build imports it, past the ceiling with the locks lifted', async ({
  page,
}) => {
  // A demo career standing ON the last day, with money — so after the carry there
  // is both a day to play and a purchase to make.
  const state = startDay(createInitialState(SEED + 1, 'demo')).state;
  state.day = DEMO_FINAL_DAY;
  state.player.credits = 500_000;
  await bootWith(page, DEMO, createSave(state, SEED + 1));
  await expect(page.getByTestId('day')).toHaveText(String(DEMO_FINAL_DAY));

  // Export through the real Settings control the player uses.
  await openSettings(page);
  const download = page.waitForEvent('download');
  await page.getByTestId('export-career').click();
  const file = await (await download).path();
  expect(file).toBeTruthy();

  // ---- the FULL build receives it -----------------------------------------
  await page.goto(`${FULL}/`);
  await openSettings(page);
  await page.getByTestId('import-career-input').setInputFiles(file);

  // The career resumed — same day, same credits, and the promotion was reported.
  await expect(page.getByTestId('day')).toHaveText(String(DEMO_FINAL_DAY));
  await expect(page.getByTestId('notice')).toContainText('upgraded');
  // The licence is gone with the demo it belonged to.
  await expect(page.getByTestId('demo-banner')).toHaveCount(0);
  // Settings is a real panel over the cockpit, so it has to come down before the
  // cockpit controls below are reachable by a pointer — which is the point of
  // driving this through the UI rather than the store.
  await closeSettings(page);

  // IT PLAYS PAST THE CEILING. This is the claim the whole task turns on: the
  // demo's last day is no longer anyone's last day.
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('day')).toHaveText(String(DEMO_FINAL_DAY + 1));
  await expect(page.getByTestId('demo-end-card')).toHaveCount(0);

  // AND THE LOCKS ARE LIFTED. Same controls, same career, now live.
  await armFirstDie(page);
  const buyPort = page.getByTestId('buy-port');
  await expect(buyPort).not.toHaveAttribute('data-demo-locked', /.*/);
  await expect(buyPort).toBeEnabled();
  await buyPort.click({ trial: true });

  const hire = page.getByTestId('hire-crew').first();
  await expect(hire).not.toHaveAttribute('data-demo-locked', /.*/);
  await expect(hire).toBeEnabled();

  expect(await capstoneLock(page)).toBeNull();
});

// ---------------------------------------------------------------------------
// 4 · THE HOLE IS CLOSED — the carry only runs one way.
// ---------------------------------------------------------------------------

test('the demo build refuses to open a full-game career', async ({ page }) => {
  // Without this refusal, a player who owns the full game could fly veteran
  // content on a demo licence simply by handing the demo a save file.
  await bootWith(page, FULL, affluentSave('full', SEED + 2));
  await openSettings(page);
  const download = page.waitForEvent('download');
  await page.getByTestId('export-career').click();
  const file = await (await download).path();
  expect(file).toBeTruthy();

  await page.goto(`${DEMO}/`);
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(SEED + 3));
  await page.getByRole('button', { name: 'Roll' }).click();
  await expect(page.getByTestId('day')).toHaveText('1');

  await openSettings(page);
  await page.getByTestId('import-career-input').setInputFiles(file);

  // Refused, said so, and NOTHING was adopted: the demo career the player was
  // flying is untouched, still on day 1, still under its licence.
  await expect(page.getByTestId('notice')).toContainText('demo cannot open it');
  await closeSettings(page);
  await expect(page.getByTestId('day')).toHaveText('1');
  await expect(page.getByTestId('demo-banner')).toHaveAttribute(
    'data-demo-days-remaining',
    String(DEMO_FINAL_DAY),
  );
  await armFirstDie(page);
  await expect(page.getByTestId('buy-port')).toHaveAttribute('data-demo-locked', 'port-ownership');
});
