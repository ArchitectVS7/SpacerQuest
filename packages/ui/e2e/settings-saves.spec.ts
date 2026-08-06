import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// T-1704 · The credits the cockpit must show a player. Imported from the SOURCE
// constant (the `storylet-delivery.spec.ts` precedent for reaching into
// `../src`), never re-typed here: a spec that duplicated the list would go on
// passing after a row was removed, which is the one failure this assertion
// exists to catch.
import { CREDITS, creditLine } from '../src/credits';
import { signOpeningMarker, skipFirstTurnWalkthrough } from './support/career';

/** The single source of truth for what this build calls itself. Read off disk
 *  rather than pinned to a literal — see the assertion for the reasoning. */
const ROOT_VERSION: string = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'),
  ) as { version: string }
).version;

// T-312 acceptance: save slots + autosave, seed entry/display, settings
// (audio/CRT/reduced-motion/text-size) and a delete-confirm. Everything is driven
// THROUGH the cockpit UI (never the engine): the player opens Settings, clicks a
// slot, mutates the game via the real controls and reads the displayed state — a
// UX test, not an API test (global test-intent rules). Exactness of load is
// guaranteed by the T-112b createSave/loadSave round-trip; here it is asserted
// via the displayed day / credits / fuel.

/** Start a fresh, deterministic career on a chosen seed, through the UI only. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
  // T-200 · Sign the Guild marker this new career opened under. `newGame` arms
  // it unconditionally (every career has its own), so this is the click a player
  // makes too; it calls no engine action, so the pinned RNG stream is unmoved.
  await signOpeningMarker(page);
}

/** Select the first unspent die in the hand. */
async function selectUnspentDie(page: Page): Promise<void> {
  await page.locator('[data-testid="die"][data-spent="0"]').first().click();
}

/** The save-slot row for slot n, inside the Settings popover. */
function slotRow(page: Page, n: number): Locator {
  return page.locator(`[data-testid="save-slot"][data-slot="${n}"]`);
}

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
}

async function closeSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toHaveCount(0);
}

/** A mutation that moves credits AND fuel and (via the store) rewrites the
 *  autosave. T-1102: the fresh junker starts with a FULL tank (300/300), so
 *  buying fuel alone would clamp to the ceiling and move nothing — first burn
 *  fuel with a jump. On seed 424242 the value-3 die (hand index 4) fails the
 *  pilot check for Aldebaran-1 (system 2), so the ship stays at Sol but the
 *  60-fuel cost is spent, leaving 240/300. Buying `amount` then lifts fuel and
 *  drops credits, both visibly moving.
 *
 *  T-1103: the encounter-rate repair (core 0.08 -> 0.30) makes the bare burn-jump
 *  interdict on seed 424242. A die-free ledger payment first advances the RNG so
 *  the following nav-failed jump clears its encounter roll and stays clean
 *  (re-derived offline). The payment also moves credits, which only reinforces the
 *  "state visibly mutated" intent these callers rely on. */
async function buyFuel(page: Page, amount: number): Promise<void> {
  await page.getByTestId('debt-amount').fill('500');
  await page.getByTestId('pay-debt').click();
  await page.getByTestId('die').nth(4).click();
  await page.locator('[data-testid="starmap-system"][data-system-id="2"]').click();
  await page.getByTestId('confirm-jump').click();
  await selectUnspentDie(page);
  await page.getByTestId('fuel-amount').fill(String(amount));
  await page.getByTestId('buy-fuel').click();
}

test.describe('T-312 settings, saves & new-game UX', () => {
  test('save, mutate, load restores exactly (asserted via displayed state)', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    // T-187 · Not the first-time flow — retire the scripted walkthrough AFTER the
    // clear above (init scripts run in the order they were added), or its rails
    // would make the panes below inert. See `support/career.ts`.
    await skipFirstTurnWalkthrough(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await newGameSeed(page, 424242);

    // Record the pre-save displayed state.
    const day0 = await page.getByTestId('day').innerText();
    const credits0 = await page.getByTestId('credits').innerText();
    const fuel0 = await page.getByTestId('fuel-hold').innerText();

    // Save into slot 1.
    await openSettings(page);
    await slotRow(page, 1).getByTestId('slot-save').click();
    await expect(slotRow(page, 1)).toHaveAttribute('data-empty', '0');
    await closeSettings(page);

    // Mutate through the UI so the displayed state changes: burn fuel (credits +
    // fuel move) and end the day (the day counter moves).
    await buyFuel(page, 10);
    await expect(page.getByTestId('fuel-hold')).not.toHaveText(fuel0);
    await expect(page.getByTestId('credits')).not.toHaveText(credits0);
    await page.getByTestId('end-day').click();
    await expect(page.getByTestId('day')).not.toHaveText(day0);

    // Load slot 1 back.
    await openSettings(page);
    await slotRow(page, 1).getByTestId('slot-load').click();
    await closeSettings(page);

    // Restored EXACTLY to the pre-save displayed state.
    await expect(page.getByTestId('day')).toHaveText(day0);
    await expect(page.getByTestId('credits')).toHaveText(credits0);
    await expect(page.getByTestId('fuel-hold')).toHaveText(fuel0);
  });

  test('autosave survives a hard reload mid-career', async ({ page }) => {
    // Fresh only on the FIRST load — the reload is the very thing under test, so a
    // sessionStorage sentinel (survives reload within the tab) gates the clear.
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('sq.test.cleared')) {
        window.localStorage.clear();
        window.sessionStorage.setItem('sq.test.cleared', '1');
      }
    });
    // T-187 · Not the first-time flow — retire the scripted walkthrough AFTER the
    // clear above (init scripts run in the order they were added), or its rails
    // would make the panes below inert. See `support/career.ts`.
    await skipFirstTurnWalkthrough(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await newGameSeed(page, 424242);

    // Advance the career: burn fuel and close a day. Every action rewrites the
    // autosave (sq.save.v1) the store boots from.
    await buyFuel(page, 10);
    await page.getByTestId('end-day').click();
    const day = await page.getByTestId('day').innerText();
    const credits = await page.getByTestId('credits').innerText();
    const fuel = await page.getByTestId('fuel-hold').innerText();

    // Hard reload — the app must boot straight back into the autosaved career.
    await page.reload();

    await expect(page.getByTestId('day')).toHaveText(day);
    await expect(page.getByTestId('credits')).toHaveText(credits);
    await expect(page.getByTestId('fuel-hold')).toHaveText(fuel);
  });

  test('deleting a slot asks first', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    // T-187 · Not the first-time flow — retire the scripted walkthrough AFTER the
    // clear above (init scripts run in the order they were added), or its rails
    // would make the panes below inert. See `support/career.ts`.
    await skipFirstTurnWalkthrough(page);
    await page.goto('/');
    await newGameSeed(page, 424242);

    // Save into slot 1, confirm it is non-empty and the envelope is on disk.
    await openSettings(page);
    await slotRow(page, 1).getByTestId('slot-save').click();
    await expect(slotRow(page, 1)).toHaveAttribute('data-empty', '0');
    expect(await page.evaluate(() => window.localStorage.getItem('sq.slot.1.v1'))).not.toBeNull();

    // First click on Delete only ASKS — the confirm appears and the data is still
    // present (nothing deleted yet).
    await slotRow(page, 1).getByTestId('slot-delete').click();
    await expect(slotRow(page, 1).getByTestId('delete-confirm')).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem('sq.slot.1.v1'))).not.toBeNull();
    await expect(slotRow(page, 1)).toHaveAttribute('data-empty', '0');

    // Cancel dismisses the confirm and leaves the slot intact.
    await slotRow(page, 1).getByTestId('slot-delete-cancel').click();
    await expect(slotRow(page, 1).getByTestId('delete-confirm')).toHaveCount(0);
    await expect(slotRow(page, 1)).toHaveAttribute('data-empty', '0');

    // Delete → Confirm actually removes it, and the envelope leaves localStorage.
    await slotRow(page, 1).getByTestId('slot-delete').click();
    await slotRow(page, 1).getByTestId('slot-delete-confirm').click();
    await expect(slotRow(page, 1)).toHaveAttribute('data-empty', '1');
    expect(await page.evaluate(() => window.localStorage.getItem('sq.slot.1.v1'))).toBeNull();
  });

  test('settings (motion tier, text size, CRT) persist across reload', async ({ page }) => {
    // NB: no reducedMotion media emulation here — the OS preference would force
    // data-motion='instant' regardless, masking whether the SETTING drives it.
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('sq.test.cleared')) {
        window.localStorage.clear();
        window.sessionStorage.setItem('sq.test.cleared', '1');
      }
    });
    // T-187 · Not the first-time flow — retire the scripted walkthrough AFTER the
    // clear above (init scripts run in the order they were added), or its rails
    // would make the panes below inert. See `support/career.ts`.
    await skipFirstTurnWalkthrough(page);
    await page.goto('/');

    const root = page.locator(':root');
    // T-252 · Cinematic is the default tier (`tabletop-ui` §8).
    await expect(root).toHaveAttribute('data-motion', 'cinematic');

    await openSettings(page);

    // Motion tier. `e2e/motion-tiers.spec.ts` proves all three drive real
    // durations; this one only proves the setting PERSISTS alongside its
    // neighbours, so it takes the far end of the range.
    await page.getByTestId('set-motion-instant').click();
    await expect(root).toHaveAttribute('data-motion', 'instant');
    expect(await page.evaluate(() => window.localStorage.getItem('sq.motion-tier'))).toBe(
      'instant',
    );

    // Text size.
    await page.getByTestId('set-text-size-large').click();
    await expect(root).toHaveAttribute('data-text-size', 'large');
    expect(await page.evaluate(() => window.localStorage.getItem('sq.text-size'))).toBe('large');

    // CRT off.
    await page.getByTestId('set-crt').click();
    await expect(root).toHaveAttribute('data-fx', 'off');

    // A hard reload keeps every setting applied.
    await page.reload();
    await expect(root).toHaveAttribute('data-motion', 'instant');
    await expect(root).toHaveAttribute('data-text-size', 'large');
    await expect(root).toHaveAttribute('data-fx', 'off');
  });

  test('seed entry and display, persisted across reload', async ({ page }) => {
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('sq.test.cleared')) {
        window.localStorage.clear();
        window.sessionStorage.setItem('sq.test.cleared', '1');
      }
    });
    // T-187 · Not the first-time flow — retire the scripted walkthrough AFTER the
    // clear above (init scripts run in the order they were added), or its rails
    // would make the panes below inert. See `support/career.ts`.
    await skipFirstTurnWalkthrough(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // Enter a seed for a new career; the bezel shows it.
    await newGameSeed(page, 777);
    await expect(page.getByTestId('seed')).toContainText('777');
    expect(await page.evaluate(() => window.localStorage.getItem('sq.save.seed'))).toBe('777');

    // The seed survives a hard reload (recovered from sq.save.seed).
    await page.reload();
    await expect(page.getByTestId('seed')).toContainText('777');
  });

  // T-1701a · The web half of the storage row. The DESKTOP half (an absolute
  // app-data path and `data-storage-backend="desktop"`) is asserted in
  // `packages/desktop/e2e/shell.spec.ts`; this is the assertion that the WEB
  // build is unaffected — same cockpit, same Settings panel, and it still
  // reports browser storage.
  //
  // READER asserted here: `storage.ts`'s `storageBackend` and `saveLocation` →
  // `App.tsx`'s `StorageRow` (standing constraint 7).
  test('Settings names where saves live — browser storage on the web build', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    // T-187 · Not the first-time flow — retire the scripted walkthrough AFTER the
    // clear above (init scripts run in the order they were added), or its rails
    // would make the panes below inert. See `support/career.ts`.
    await skipFirstTurnWalkthrough(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await newGameSeed(page, 424242);

    await openSettings(page);
    const row = page.getByTestId('save-location');
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-storage-backend', 'browser');
    await expect(row).toHaveText('Browser storage');

    // T-1701b · The WEB half of the Build section, mirroring exactly how
    // `storageBackend`/`saveLocation` are proved on both backends. The DESKTOP
    // halves are `packages/desktop/e2e/shell.spec.ts` (dev → `unsupported`) and
    // `packages/desktop/e2e/packaged.spec.ts` (a real package → `inert`).
    //
    // READER asserted here: `storage.ts`'s `shellVersion` and `updateStatus` →
    // `App.tsx`'s `BuildRow` (standing constraint 7).
    // T-1704 · The web build is no longer versionless. `shellVersion` is still
    // null here, so the row falls through to the COMPILED `BUILD_VERSION` — and
    // this suite is run against a real `vite build` (see `playwright.config.ts`'s
    // `webServer`: `npm run build && npm run preview`), so what is asserted is the
    // substitution that actually landed in the bundle, not a dev-server value.
    // Read from the root `package.json` rather than pinned to a literal: the
    // version moves every release and a hard-coded number would make that a
    // two-file edit for no gain. `version.test.ts` pins all six manifests to this
    // same string.
    //
    // READER asserted here: `version.ts`'s `BUILD_VERSION` → `App.tsx`'s
    // `BuildRow` (standing constraint 7).
    const version = page.getByTestId('app-version');
    await expect(version).toHaveText(/^\d+\.\d+\.\d+$/);
    await expect(version).toHaveText(ROOT_VERSION);
    // Which of the two sources answered. Without this a shell that happened to
    // agree with the bundle would be indistinguishable from a shell never asked.
    await expect(version).toHaveAttribute('data-version-source', 'bundle');

    const updates = page.getByTestId('update-status');
    await expect(updates).toHaveAttribute('data-update-status', 'web');
    await expect(updates).toHaveText('Updates are handled by your browser.');

    // T-1702a · The WEB half of the Steam section. A browser tab has no Steam
    // client, so `steamStatus` is `null`, the row says so in words, and
    // `unlockAchievement` is a no-op — the web build is completely unaffected by
    // the Steamworks task, which is the criterion this asserts. The DESKTOP
    // halves are `packages/desktop/e2e/shell.spec.ts` (`ready` under the
    // recording client, `unavailable` with no app id) and
    // `packages/desktop/e2e/packaged.spec.ts` (a real package → `unavailable`).
    //
    // READER asserted here: `storage.ts`'s `steamStatus` and `steam.ts`'s
    // `ACHIEVEMENT_MANIFEST` → `App.tsx`'s `SteamRow` (standing constraint 7).
    const steam = page.getByTestId('steam-status');
    await expect(steam).toHaveAttribute('data-steam-status', 'web');
    await expect(steam).toHaveText('Steam achievements are available in the desktop version.');
    // The tally is still true in a browser — Deeds are earned either way — and
    // the count is over the WHOLE manifest (every Deed plus the Conqueror
    // capstone), which is what makes the mirror visible rather than just a
    // connection. Not pinned to a literal, so adding a Deed does not red-light
    // this spec.
    await expect(page.getByTestId('steam-achievements')).toHaveText(
      /^0 of \d+ earned — they will mirror when you play on Steam\.$/,
    );

    // T-1702b · The WEB halves of Cloud & rich presence. A browser tab has no
    // Steam client, so `cloudStatus` is `null`, `cloudRestored` is 0 and
    // `setRichPresence` is a no-op — the web build is completely unaffected by
    // this task too, which is the criterion this asserts. The DESKTOP halves are
    // `packages/desktop/e2e/shell.spec.ts` (the cloud round trip and the
    // presence log under the recording client, plus both `unavailable` with no
    // app id) and `packages/desktop/e2e/packaged.spec.ts` (a real package →
    // `unavailable`).
    //
    // READERS asserted here: `storage.ts`'s `cloudStatus` / `cloudRestored` →
    // `App.tsx`'s `SteamRow` Cloud row, and `steam.ts`'s `presenceLine` →
    // `format.ts`'s `presenceMessage` → the "Shown to friends" row (standing
    // constraint 7).
    const cloud = page.getByTestId('steam-cloud');
    await expect(cloud).toHaveAttribute('data-cloud-status', 'web');
    await expect(cloud).toHaveText('Steam Cloud is available in the desktop version.');
    await expect(page.getByTestId('steam-presence')).toHaveText(
      'Rich presence is available in the desktop version.',
    );

    // T-1704 · THE CREDITS REACH THE PLAYER. The OFL and the MIT licence both
    // require their notice to travel with the distributed work, so a credits list
    // that exists only in the repository discharges nothing — this is the
    // assertion that it is in the artifact. Every row is checked by its
    // structural id (prose may be re-voiced, `data-credit-id` may not), and the
    // three rows whose text is a legal statement are checked by their words.
    //
    // READER asserted here: `credits.ts`'s `CREDITS` → `App.tsx`'s `CreditsPanel`
    // (standing constraints 6 and 7). The PACKAGED half — the artifact a player
    // actually receives — is `packages/desktop/e2e/packaged.spec.ts`.
    await expect(page.getByTestId('credits-panel')).toBeVisible();
    for (const credit of CREDITS) {
      const row = page.locator(`[data-credit-id="${credit.id}"]`);
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(creditLine(credit));
    }
    await expect(page.locator('[data-credit-id="font-chakra-petch"]')).toContainText(
      'Cadson Demak · SIL Open Font License 1.1',
    );
    await expect(page.locator('[data-credit-id="font-ibm-plex-mono"]')).toContainText(
      'IBM Corp. · SIL Open Font License 1.1',
    );
    await expect(page.locator('[data-credit-id="audio"]')).toContainText(
      'The Spacer Quest project · CC0 1.0 Universal',
    );

    // The save slots still render below it — the four Steam rows and the credits
    // must not displace them.
    await expect(page.getByTestId('save-slot')).toHaveCount(3);
  });
});
