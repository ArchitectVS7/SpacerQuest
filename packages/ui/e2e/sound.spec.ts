import { test, expect } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';

// T-310 sound design. These tests exercise the mixer + autoplay policy through
// the real UI (never the audio API directly). Playwright's Chromium has WebAudio,
// so cues construct but produce no observable output in headless — the tests
// assert STATE / PERSISTENCE / CONSOLE-CLEANLINESS, which are the acceptance
// criteria, not audible samples (which the harness cannot observe).
test.beforeEach(async ({ page }) => {
  // Fresh mixer at the START of each test, but NOT on later reloads — the reload
  // is exactly what the persistence test verifies. A sessionStorage sentinel (it
  // survives reload within the tab) gates the one-time clear to the first load.
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem('sq.test.cleared')) {
      window.localStorage.clear();
      window.sessionStorage.setItem('sq.test.cleared', '1');
    }
  });
  // T-187 · This spec is NOT testing the first-time flow — retire the scripted
  // first-turn walkthrough before the app boots, or its rails would make the
  // panes below inert. See `support/career.ts`.
  await skipFirstTurnWalkthrough(page);
});

test('no autoplay-policy console errors on first interaction', async ({ page }) => {
  const noise: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') noise.push(msg.text());
  });
  page.on('pageerror', (err) => noise.push(err.message));

  await page.goto('/');

  // The first genuine gesture: pick a die. The AudioContext is constructed +
  // resumed inside THIS gesture, so the browser must not log the autoplay block.
  await page.getByTestId('die').first().click();
  // A second gesture (opening Settings, which now hosts the mixer) fires a relay
  // cue on an unlocked context — the sliders + mute live inside the Settings panel.
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('audio-mute')).toBeVisible();
  await expect(page.getByTestId('vol-master')).toBeVisible();

  const offenders = noise.filter((m) =>
    /AudioContext|autoplay|was not allowed to start|user gesture/i.test(m),
  );
  expect(offenders, `unexpected audio console noise: ${offenders.join(' | ')}`).toEqual([]);
});

test('mute persists across reload', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('settings-toggle').click();
  const mute = page.getByTestId('audio-mute');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');

  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  // Backed by localStorage — the source of truth for persistence.
  expect(await page.evaluate(() => window.localStorage.getItem('sq.audio.muted'))).toBe('true');

  await page.reload();
  await page.getByTestId('settings-toggle').click();
  // Still muted after a full reload.
  await expect(page.getByTestId('audio-mute')).toHaveAttribute('aria-pressed', 'true');
});

test('volume sliders work and persist', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('settings-toggle').click();

  // Set each slider to a known value through its native input event (what a real
  // drag produces), then assert the persisted key matches.
  const set = async (testid: string, key: string, value: string) => {
    const slider = page.getByTestId(testid);
    // Drive the range through its native value setter so React's own value
    // tracker sees the change and fires onChange — the same path a real drag hits.
    await slider.evaluate((el, v) => {
      const input = el as HTMLInputElement;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- intentionally extracting the native value setter to invoke via .call below
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await expect.poll(() => page.evaluate((k) => window.localStorage.getItem(k), key)).toBe(value);
  };

  await set('vol-master', 'sq.vol.master', '0.42');
  await set('vol-sfx', 'sq.vol.sfx', '0.9');
  // T-185 · The score's own fader. It is the FOURTH bus, and it is the one that
  // caught `setVolume`'s bug: the persistence key used to be picked by a ternary
  // chain ending `: KEY_AMBIENT`, so every bus added after `ambient` wrote its
  // value into `sq.vol.ambient`. The assertion below that `sq.vol.ambient` is
  // still untouched at this point is the one that would have failed.
  await set('vol-music', 'sq.vol.music', '0.33');
  expect(
    await page.evaluate(() => window.localStorage.getItem('sq.vol.ambient')),
    'the Music slider wrote into the Ambient key',
  ).toBeNull();
  await set('vol-ambient', 'sq.vol.ambient', '0.1');
  // …and the music value survived the ambient write, i.e. they are separate keys
  // in both directions.
  expect(await page.evaluate(() => window.localStorage.getItem('sq.vol.music'))).toBe('0.33');

  // Reopen the Settings panel and confirm the sliders reflect the persisted values.
  await page.getByTestId('settings-toggle').click(); // close
  await page.getByTestId('settings-toggle').click(); // reopen
  await expect(page.getByTestId('vol-master')).toHaveValue('0.42');
  await expect(page.getByTestId('vol-sfx')).toHaveValue('0.9');
  await expect(page.getByTestId('vol-music')).toHaveValue('0.33');
  await expect(page.getByTestId('vol-ambient')).toHaveValue('0.1');
});
