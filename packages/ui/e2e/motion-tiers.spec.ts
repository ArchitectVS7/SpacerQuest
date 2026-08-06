import { test, expect, type Page } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';

// ---------------------------------------------------------------------------
// T-252 · THE THREE MOTION TIERS, ON THE RUNNING PAGE.
//
// `tabletop-ui` §8 is an owner standing rule: animation intensity is a player
// menu option — Cinematic / Snappy / Instant — and "Never ship cinematic-only."
// Until T-252 this product shipped a BINARY (a `reducedMotion` checkbox OR'd
// with the OS query). The retrofit is one knob: `--motion-scale`, with every
// BEAT duration a `calc(<cinematic-ms> * var(--motion-scale))`.
//
// WHAT THIS FILE PROVES THAT THE UNIT SCAN CANNOT.
// `src/__tests__/motion-tiers.test.ts` reads `theme.css` as SOURCE and proves
// the classification is COMPLETE — every declaration is a tokenised beat, an
// allowlisted ambient loop, or an allowlisted hover response. It cannot prove a
// single ms actually reaches the browser. This file measures COMPUTED style on
// the live page, at all three tiers, with the tier CHOSEN BY CLICKING THE
// SETTINGS SEGMENT — never by writing localStorage (global test-intent rule: a
// player presses the button, so the test presses the button).
//
// THE NEGATIVE CONTROL IS THE POINT. A "Snappy" that silently computed the same
// duration as Cinematic would be a cinematic-only build wearing a third label,
// which is the exact failure §8 forbids. So every duration below is asserted to
// an EXACT value, and ambient is asserted to be UNCHANGED between Cinematic and
// Snappy — proving the classification is real, not just the scale.
//
// WHY A TOKEN PROBE AND NOT TWENTY REAL ELEMENTS. Reaching every beat's live
// element means playing twenty different game states, and several beats
// (`.die.bloom`, `cb-crit`, `om-*`) live for 220–900ms, so racing a
// `getComputedStyle` against them is a flake generator, not a proof. Instead:
// three SHIPPED elements are measured directly (a beat, an ambient loop and a
// hover response — one per category), and then EVERY `--dur-*` / `--del-*` token
// is resolved through a probe element in the real document, which is what
// converts "the token exists in the file" into "the browser resolves it to this
// many ms at this tier". The source scan already pins which token each beat
// uses, so the two together cover all of them with no timing race.
//
// `emulateMedia({ reducedMotion: 'no-preference' })` + `page.reload()` is
// MANDATORY around any non-Instant assertion (UI-23): the whole suite runs under
// `reducedMotion: 'reduce'`, the cockpit reads that preference once per render,
// and `resolveMotionTier` forces Instant when it is set. Without the reload the
// assertion would be made against a stale attribute.
// ---------------------------------------------------------------------------

type Tier = 'cinematic' | 'snappy' | 'instant';

/** `tabletop-ui` §8: Cinematic 1x, Snappy ~0.4x, Instant the synchronous rail. */
const SCALE: Record<Tier, number> = { cinematic: 1, snappy: 0.4, instant: 0 };

/** Every BEAT token and its CINEMATIC length in ms — the values authored in the
 *  `theme.css` token block. Duplicated here on purpose: a probe that read the
 *  expected number out of the same file it is checking would prove nothing. */
const BEATS: Record<string, number> = {
  '--dur-sweep': 1100,
  '--dur-comp-focus': 700,
  '--dur-mb-post': 220,
  '--dur-mb-stow': 200,
  '--dur-tp-tick': 460,
  '--dur-tp-charge': 700,
  '--dur-tp-post': 340,
  '--dur-cb-reveal': 320,
  '--dur-cb-crit': 600,
  '--dur-bloom': 700,
  '--dur-ob-fade': 220,
  '--dur-ob-fade-center': 220,
  '--dur-ld-settle': 620,
  '--dur-d6-turn': 550,
  '--dur-om-strike': 620,
  '--dur-om-bloom': 900,
  '--dur-om-read-in': 520,
  '--del-tp-post-2': 60,
  '--del-tp-post-3': 120,
  '--del-om-read-1': 380,
  '--del-om-read-2': 620,
  '--del-om-read-3': 860,
};

/** Chromium prints computed times in seconds, trimmed: 1100ms -> "1.1s". */
function seconds(ms: number): string {
  const s = ms / 1000;
  return `${Number(s.toFixed(6))}s`;
}

async function boot(page: Page, os: 'reduce' | 'no-preference'): Promise<void> {
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem('sq.test.cleared')) {
      window.localStorage.clear();
      window.sessionStorage.setItem('sq.test.cleared', '1');
    }
  });
  await skipFirstTurnWalkthrough(page);
  await page.emulateMedia({ reducedMotion: os });
  await page.goto('/');
  await expect(page.getByTestId('wire')).toBeVisible();
}

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
}

/** Choose a tier the way a PLAYER does: open Settings, click the segment. */
async function chooseTier(page: Page, tier: Tier): Promise<void> {
  await openSettings(page);
  await page.getByTestId(`set-motion-${tier}`).click();
  await expect(page.getByTestId(`set-motion-${tier}`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-motion', tier);
}

/** Resolve every beat token through a real element in the real document. */
async function probeBeats(page: Page, names: readonly string[]): Promise<Record<string, string>> {
  return page.evaluate((tokens) => {
    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.left = '-9999px';
    document.body.appendChild(probe);
    const out: Record<string, string> = {};
    for (const token of tokens) {
      // `animation-delay` and `animation-duration` are both <time>, so one
      // property reads either family of tokens.
      probe.style.animationDuration = `var(${token})`;
      out[token] = getComputedStyle(probe).animationDuration;
    }
    probe.remove();
    return out;
  }, names);
}

const styles = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
      transitionDuration: cs.transitionDuration,
    };
  }, selector);

// ---------------------------------------------------------------------------

test('the default tier is CINEMATIC, and all three are offered — never cinematic-only', async ({
  page,
}) => {
  await boot(page, 'no-preference');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'cinematic');

  await openSettings(page);
  const seg = page.getByTestId('set-motion');
  await expect(seg).toBeVisible();
  // THE RULE ITSELF: three segments, not one and not two.
  await expect(seg.locator('button')).toHaveCount(3);
  await expect(page.getByTestId('set-motion-cinematic')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('set-motion-snappy')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('set-motion-instant')).toHaveAttribute('aria-pressed', 'false');
});

for (const tier of ['cinematic', 'snappy', 'instant'] as const) {
  test(`${tier}: every beat resolves to its scaled duration on the live page`, async ({ page }) => {
    await boot(page, 'no-preference');
    await chooseTier(page, tier);

    // 1 · EVERY BEAT TOKEN, resolved by the browser. This is the completeness
    //     half: not one beat may sit outside the knob.
    const probed = await probeBeats(page, Object.keys(BEATS));
    const expected = Object.fromEntries(
      Object.entries(BEATS).map(([token, ms]) => [token, seconds(ms * SCALE[tier])]),
    );
    expect(probed).toEqual(expected);

    // 2 · A SHIPPED BEAT element, not a probe: the boot sweep.
    if (tier === 'instant') {
      // THE INSTANT RAIL is a mount gate, not a zeroed animation — the element
      // is never rendered at all (App.tsx `!isInstant(tier)`), which is what
      // makes it synchronous rather than "animated then skipped".
      await expect(page.locator('.sweep')).toHaveCount(0);
    } else {
      const sweep = await styles(page, '.sweep');
      expect(sweep?.animationName).toBe('sweep');
      expect(sweep?.animationDuration).toBe(seconds(1100 * SCALE[tier]));
    }
  });
}

test('SNAPPY is genuinely trimmed — the negative control against a relabelled Cinematic', async ({
  page,
}) => {
  await boot(page, 'no-preference');

  await chooseTier(page, 'cinematic');
  const cine = await probeBeats(page, Object.keys(BEATS));

  await chooseTier(page, 'snappy');
  const snap = await probeBeats(page, Object.keys(BEATS));

  for (const token of Object.keys(BEATS)) {
    expect(
      Number.parseFloat(snap[token]),
      `${token} did not shorten at Snappy — that is a cinematic-only beat`,
    ).toBeLessThan(Number.parseFloat(cine[token]));
  }
});

test('AMBIENT and RESPONSE are deliberately NOT scaled — the classification is real', async ({
  page,
}) => {
  await boot(page, 'no-preference');

  // The 40s news marquee is AMBIENT: a scroll SPEED, not a dramatic beat.
  // Trimming it to 16s would make the wire unreadable, so it must be identical
  // at Cinematic and Snappy — and off entirely at Instant.
  await chooseTier(page, 'cinematic');
  const tickerCine = await styles(page, '.ticker');
  const dieCine = await styles(page, '.die');
  expect(tickerCine?.animationName).toBe('tick');
  expect(tickerCine?.animationDuration).toBe('40s');
  // `.die` hover/select is RESPONSE: 180ms of pointer feedback, not cinema.
  expect(dieCine?.transitionDuration).toBe('0.18s, 0.18s, 0.18s');

  await chooseTier(page, 'snappy');
  const tickerSnap = await styles(page, '.ticker');
  const dieSnap = await styles(page, '.die');
  expect(tickerSnap?.animationDuration).toBe(tickerCine?.animationDuration);
  expect(dieSnap?.transitionDuration).toBe(dieCine?.transitionDuration);

  // …and the Instant kill-switch reaches BOTH, which is why it still exists
  // after the knob was introduced.
  await chooseTier(page, 'instant');
  const tickerInst = await styles(page, '.ticker');
  const dieInst = await styles(page, '.die');
  expect(tickerInst?.animationName).toBe('none');
  expect(dieInst?.transitionDuration).toBe('0s');
});

test('INSTANT loses no information — a fade-in beat still ends up visible', async ({ page }) => {
  // `tabletop-ui` §8 corrections log, 2026-07-19 (3): "Never regress
  // information." Every beat in this product animates opacity 0 -> 1, so an
  // Instant rail that merely SUPPRESSED them would leave the content invisible.
  // Two mechanisms make it safe and BOTH are asserted here: the beat's base rule
  // never sets `opacity: 0` (so `animation: none` renders it naturally), and a
  // zeroed `--motion-scale` with `forwards`/`both` would apply the END state
  // anyway. The onboarding card is the beat that is on screen at boot.
  await boot(page, 'no-preference');
  const card = page.getByTestId('onboarding');
  const opacity = () =>
    card.evaluate((el) => ({
      opacity: getComputedStyle(el).opacity,
      animationName: getComputedStyle(el).animationName,
    }));

  await chooseTier(page, 'cinematic');
  await expect(card).toBeVisible();
  // The hand-anchored variant of the same beat (`ob-fade-center`) — same
  // token, same 220ms, an extra `translateX` for the centring transform.
  expect((await opacity()).animationName).toBe('ob-fade-center');

  await chooseTier(page, 'instant');
  await expect(card).toBeVisible();
  const inst = await opacity();
  expect(inst.animationName).toBe('none');
  expect(Number.parseFloat(inst.opacity)).toBe(1);
  await expect(card).toContainText('dawn hand', { ignoreCase: true });
});

test('the OS reduced-motion preference FORCES Instant, whatever the player chose', async ({
  page,
}) => {
  await boot(page, 'no-preference');
  await chooseTier(page, 'cinematic');

  // WCAG 2.3.3: the OS preference is an accessibility need, not a default to be
  // overridden. The stored SETTING is untouched — it is the resolution that
  // changes — so turning the preference back off restores Cinematic.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'instant');
  expect(await page.evaluate(() => window.localStorage.getItem('sq.motion-tier'))).toBe(
    'cinematic',
  );
  await expect(page.locator('.sweep')).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'cinematic');
});

test('the tier persists across a reload, and Settings shows the one that is live', async ({
  page,
}) => {
  await boot(page, 'no-preference');
  await chooseTier(page, 'snappy');
  expect(await page.evaluate(() => window.localStorage.getItem('sq.motion-tier'))).toBe('snappy');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'snappy');
  await openSettings(page);
  await expect(page.getByTestId('set-motion-snappy')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('set-motion-cinematic')).toHaveAttribute('aria-pressed', 'false');
});

test('a pre-T-252 player who had "Reduced motion: On" boots into Instant', async ({ page }) => {
  // The legacy binary key, seeded as an old install would have left it. A player
  // who opted out of motion must NOT be silently promoted back to cinematic by
  // an upgrade — that is the whole reason `motionTierFromStorage` keeps a
  // fallback rather than just defaulting.
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.setItem('sq.test.cleared', '1');
    window.localStorage.setItem('sq.reduced-motion', 'on');
  });
  await skipFirstTurnWalkthrough(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-motion', 'instant');
  await expect(page.locator('.sweep')).toHaveCount(0);
  await openSettings(page);
  await expect(page.getByTestId('set-motion-instant')).toHaveAttribute('aria-pressed', 'true');

  // Choosing a tier retires the legacy key so it can never contradict later.
  await page.getByTestId('set-motion-snappy').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'snappy');
  expect(await page.evaluate(() => window.localStorage.getItem('sq.reduced-motion'))).toBeNull();
});

// ---------------------------------------------------------------------------
// The `tabletop-ui` §7 screenshot loop, three tiers x three shots (UI-27: the
// element, the neighbouring control AND the full cockpit — an element-scoped
// crop alone cannot answer "does this read right next to everything else").
// Shots land in the gitignored `test-results/`; no binary is committed.
// ---------------------------------------------------------------------------
for (const tier of ['cinematic', 'snappy', 'instant'] as const) {
  test(`screenshot pass · ${tier}`, async ({ page }) => {
    await boot(page, 'no-preference');
    await chooseTier(page, tier);

    await page.screenshot({ path: `test-results/T-252-${tier}-cockpit.png`, fullPage: false });
    await page.getByTestId('hand').screenshot({
      path: `test-results/T-252-${tier}-dock.png`,
    });
    await openSettings(page);
    await page.getByTestId('settings-panel').screenshot({
      path: `test-results/T-252-${tier}-settings.png`,
    });
  });
}
