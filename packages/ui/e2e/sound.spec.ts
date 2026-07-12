import { test, expect } from '@playwright/test';

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
  // A second gesture (opening the mixer) fires a relay cue on an unlocked context.
  await page.getByTestId('audio-toggle').click();
  await expect(page.getByTestId('audio-panel')).toBeVisible();

  const offenders = noise.filter((m) =>
    /AudioContext|autoplay|was not allowed to start|user gesture/i.test(m),
  );
  expect(offenders, `unexpected audio console noise: ${offenders.join(' | ')}`).toEqual([]);
});

test('mute persists across reload', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('audio-toggle').click();
  const mute = page.getByTestId('audio-mute');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');

  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  // Backed by localStorage — the source of truth for persistence.
  expect(await page.evaluate(() => window.localStorage.getItem('sq.audio.muted'))).toBe('true');

  await page.reload();
  await page.getByTestId('audio-toggle').click();
  // Still muted after a full reload.
  await expect(page.getByTestId('audio-mute')).toHaveAttribute('aria-pressed', 'true');
});

test('volume sliders work and persist', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('audio-toggle').click();

  // Set each slider to a known value through its native input event (what a real
  // drag produces), then assert the persisted key matches.
  const set = async (testid: string, key: string, value: string) => {
    const slider = page.getByTestId(testid);
    // Drive the range through its native value setter so React's own value
    // tracker sees the change and fires onChange — the same path a real drag hits.
    await slider.evaluate((el, v) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await expect
      .poll(() => page.evaluate((k) => window.localStorage.getItem(k), key))
      .toBe(value);
  };

  await set('vol-master', 'sq.vol.master', '0.42');
  await set('vol-sfx', 'sq.vol.sfx', '0.9');
  await set('vol-ambient', 'sq.vol.ambient', '0.1');

  // Reopen the panel and confirm the sliders reflect the persisted values.
  await page.getByTestId('audio-toggle').click(); // close
  await page.getByTestId('audio-toggle').click(); // reopen
  await expect(page.getByTestId('vol-master')).toHaveValue('0.42');
  await expect(page.getByTestId('vol-sfx')).toHaveValue('0.9');
  await expect(page.getByTestId('vol-ambient')).toHaveValue('0.1');
});
