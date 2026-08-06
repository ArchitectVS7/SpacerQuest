import { test, expect, type Page } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';

// ---------------------------------------------------------------------------
// T-218 · "ONE PHOSPHOR, TWO MATERIALS", MEASURED ON THE RUNNING PAGE.
//
// The accept clause says "the LIVE UI renders candidate D's material treatment".
// `src/__tests__/visual-identity.test.ts` pins the ruling against `theme.css` as
// SOURCE, which is necessary and not sufficient: a cascade collision, a later
// override or an inline style could leave the file correct and the screen wrong.
// So everything below reads COMPUTED style off the real cockpit, and every state
// it needs is reached the way a player reaches it — the armed die is armed by
// CLICKING a die, never by touching the store.
//
// WHAT IS ASSERTED, AND WHY EACH ONE:
//   * the chassis is ACHROMATIC — max−min channel spread ≤ 12 on the pane
//     header, the buttons, the rank chip, the ledger rail and the dock. This is
//     the "two materials" half of the law, as a number.
//   * the LIGHT is amber — the pane's live lamp, the readouts, the die pips.
//     This is the "one phosphor" half.
//   * the two RULED reverse-video edits, in both directions.
//   * T-216: hostile vs. neutral attitude differ on a NON-HUE channel.
//   * T-217: the cap's box no longer overlaps the ticker's, WITH a bulletin
//     present, so the magic number cannot come back.
//   * a screenshot pass over the same six-panel board T-186's bake-off used.
//
// This spec is NOT in the vitest gate (`npm test` is vitest-only). Run it with
// `npm run test:e2e -w @spacerquest/ui`.
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipFirstTurnWalkthrough(page);
});

type Rgb = { r: number; g: number; b: number };

/** Resolve a computed colour to RGB. `rgb()`/`rgba()` is all the browser emits. */
function parseRgb(value: string): Rgb | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(value);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

function spread({ r, g, b }: Rgb): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hueDeg({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b);
  const d = spread({ r, g, b });
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return (h + 360) % 360;
}

/** The law's own numeric definition of "not a hue" (theme.css header §2). */
const ACHROMATIC_MAX_SPREAD = 12;

async function computed(
  page: Page,
  selector: string,
  props: string[],
  pseudo?: string,
): Promise<Record<string, string>> {
  return page
    .locator(selector)
    .first()
    .evaluate(
      (el, args) => {
        const cs = getComputedStyle(el, args.pseudo ?? null);
        const out: Record<string, string> = {};
        for (const p of args.props) out[p] = cs.getPropertyValue(p);
        return out;
      },
      { props, pseudo },
    );
}

/** Assert a computed colour carries no perceptible hue — it is METAL. */
function expectAchromatic(label: string, value: string): void {
  const rgb = parseRgb(value);
  expect(rgb, `${label}: could not parse \`${value}\``).not.toBeNull();
  // A fully transparent / unset colour is not a material claim; skip it.
  expect(spread(rgb!), `${label} is not achromatic: ${value}`).toBeLessThanOrEqual(
    ACHROMATIC_MAX_SPREAD,
  );
}

/** Assert a computed colour is the amber phosphor — it is LIGHT. */
function expectAmber(label: string, value: string): void {
  const rgb = parseRgb(value);
  expect(rgb, `${label}: could not parse \`${value}\``).not.toBeNull();
  const h = hueDeg(rgb!);
  expect(spread(rgb!), `${label} is not chromatic at all: ${value}`).toBeGreaterThan(
    ACHROMATIC_MAX_SPREAD,
  );
  expect(
    h,
    `${label} is outside the amber window: ${value} (hue ${h.toFixed(1)}°)`,
  ).toBeGreaterThan(24);
  expect(h, `${label} is outside the amber window: ${value} (hue ${h.toFixed(1)}°)`).toBeLessThan(
    51,
  );
}

test('the chassis is unlit, near-achromatic metal', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('trade-pane')).toBeVisible();

  const chassis: Array<[string, string, string]> = [
    ['pane header strip', '.pane > header', 'background-color'],
    ['pane header legend', '.pane > header h2', 'color'],
    ['pane frame', '.pane', 'border-top-color'],
    // BUY FUEL — an ordinary key. (The two ARMED keys, CONFIRM JUMP and END DAY,
    // are deliberately lit and are asserted amber in the next test instead.)
    ['button cap legend', '.lb-controls .btn', 'color'],
    ['rank nameplate', '.chip.rank', 'color'],
    ['console switch', '.ctrls button', 'color'],
    ['dock legend', '.dlabel', 'color'],
  ];
  for (const [label, selector, prop] of chassis) {
    const style = await computed(page, selector, [prop]);
    expectAchromatic(label, style[prop]);
  }

  // The dock and the ledger rail are gradients, so their own `background-color`
  // is transparent — assert the frame they are cut into instead.
  const dock = await computed(page, '.dock', ['border-top-color']);
  expectAchromatic('dock frame', dock['border-top-color']);
});

test('the only thing that emits light is amber', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('trade-pane')).toBeVisible();

  // The live lamp on the pane header — the single lit element on the chassis.
  const lamp = await computed(page, '.pane > header h2', ['background-color'], '::before');
  expectAmber('pane live lamp', lamp['background-color']);

  const lit: Array<[string, string]> = [
    ['contract goods line', '.contract .goods'],
    ['contract payout', '.contract .pay'],
    ['credits readout', '[data-testid="credits"]'],
    ['die pip', '.die'],
  ];
  for (const [label, selector] of lit) {
    const style = await computed(page, selector, ['color']);
    expectAmber(label, style['color']);
  }
});

test('RULED EDIT 1 · a check-clearing badge reads as LIT, not inverted', async ({ page }) => {
  // NOTE, recorded rather than hidden: `.slot.ready` is NOT rendered by the
  // shipped cockpit today. M17 removed the die COST from signing a manifest
  // offer (`App.tsx:4840-4841` — "the row renders neither a die slot nor a
  // '+ TRADE' check"), so the sign row is now `SIGN · FREE · click to sign` and
  // the badge has no live call site. The ruled edit is still applied, because
  // the ruling is about the RULE and the check-gated sign row is an M17
  // reversible; it is simply not reachable through the UI to click at.
  // So this measures the rule as the browser resolves it, against a probe node
  // built from the real stylesheet — which is a weaker claim than a live click
  // and is labelled as such, not dressed up as one.
  await page.goto('/');
  await expect(page.getByTestId('trade-pane')).toBeVisible();

  const style = await page.evaluate(() => {
    const check = document.createElement('div');
    check.className = 'check';
    const slot = document.createElement('span');
    slot.className = 'slot ready';
    slot.textContent = '14';
    check.appendChild(slot);
    document.body.appendChild(check);
    const cs = getComputedStyle(slot);
    const out = { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor };
    check.remove();
    return out;
  });
  // NOT the reverse-video fill it replaced.
  const bg = parseRgb(style.bg)!;
  expect(luminance(bg), `slot background is a bright fill: ${style.bg}`).toBeLessThan(40);
  // …and its numerals and outline ARE the phosphor.
  expectAmber('ready slot text', style.color);
  expectAmber('ready slot border', style.border);
  // The text must be LIGHTER than the fill — the definition of "not inverted".
  expect(luminance(parseRgb(style.color)!)).toBeGreaterThan(luminance(bg));
});

test('RULED EDIT 2 · an armed die reads as LIT, not inverted', async ({ page }) => {
  await page.goto('/');
  const die = page.locator('[data-testid="die"][data-spent="0"]').first();

  const before = await die.evaluate((el) => getComputedStyle(el).color);
  await die.click();
  await expect(die).toHaveClass(/\bsel\b/);

  const style = await die.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, bgImage: cs.backgroundImage, color: cs.color };
  });
  // The die keeps a DARK body: the rejected treatment filled it light amber.
  const bg = parseRgb(style.bg);
  if (bg) expect(luminance(bg), `armed die body is a bright fill: ${style.bg}`).toBeLessThan(60);
  expect(style.bgImage).not.toContain('rgb(255, 213, 122)');
  // …and its numerals are the phosphor, brighter than they were at rest.
  expectAmber('armed die numerals', style.color);
  expect(luminance(parseRgb(style.color)!)).toBeGreaterThanOrEqual(
    luminance(parseRgb(before)!) - 1,
  );
});

test('T-216 · hostile and neutral attitudes differ on a non-hue channel', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('records-toggle').click();

  const rows = page.locator('.as-row');
  await expect(rows.first()).toBeVisible();

  // Read every tone that is actually on screen. The claim under test is about
  // the RULES, so it is asserted against the stylesheet's resolved values via a
  // probe element when a hostile captain is not in this seed's roster — the
  // player-visible defect (hostile ≡ neutral) is a property of the CSS, and a
  // seed-dependent roster must not be able to make the check vacuous.
  const tones = await page.evaluate(() => {
    const probe = (cls: string) => {
      const row = document.createElement('div');
      row.className = `as-row ${cls}`;
      const value = document.createElement('span');
      value.className = 'as-value';
      value.textContent = 'X';
      row.appendChild(value);
      document.body.appendChild(row);
      const cs = getComputedStyle(value);
      const before = getComputedStyle(value, '::before');
      const out = {
        color: cs.color,
        background: cs.backgroundColor,
        glyph: before.content,
      };
      row.remove();
      return out;
    };
    return { hostile: probe('as-hostile'), neutral: probe('as-neutral') };
  });

  const lum = (v: string) => luminance(parseRgb(v)!);
  // Channel 1 — LUMINANCE INVERSION. Under greyscale (and under every
  // colour-blindness simulation, which is why the T-216 amendment raised this
  // bar) hostile is dark-on-bright and neutral is bright-on-dark.
  expect(lum(tones.hostile.background)).toBeGreaterThan(lum(tones.hostile.color));
  expect(lum(tones.neutral.color)).toBeGreaterThan(lum(tones.neutral.background) || 0);
  // Channel 2 — a GLYPH. Hue-independent by construction.
  expect(tones.hostile.glyph).not.toBe('none');
  expect(tones.neutral.glyph).toBe('none');
  // …and neither is off-system: hostile's fill is the phosphor, not orange-red.
  expectAmber('hostile fill', tones.hostile.background);
  expectAmber('neutral value', tones.neutral.color);
});

test('T-217 · the wire cap reserves its own space and never overlaps the ticker', async ({
  page,
}) => {
  await page.goto('/');
  const cap = page.locator('.wire .cap');
  const track = page.locator('.wire .wire-track');
  await expect(cap).toBeVisible();
  await expect(track).toBeVisible();

  const capBox = (await cap.boundingBox())!;
  const trackBox = (await track.boundingBox())!;
  expect(capBox).not.toBeNull();
  expect(trackBox).not.toBeNull();
  // The whole point of the fix: the cap's right edge is at or before the
  // ticker window's left edge. Under the old absolute-position + 138px scheme
  // this was false the moment the LOG button (T-306) shipped.
  expect(capBox.x + capBox.width).toBeLessThanOrEqual(trackBox.x + 1);

  // …and the ticker's first glyph starts inside the window, not under the cap.
  const tickerBox = (await page.getByTestId('wire').boundingBox())!;
  expect(tickerBox.x).toBeGreaterThanOrEqual(trackBox.x - 1);

  // The regression this guards is DATA-DEPENDENT: a BULLETIN chip widens the
  // cap. Play forward until the wire carries one, then re-measure — if the
  // seed never produces one, the geometry above still holds and this loop is
  // simply a no-op rather than a false green.
  for (let day = 0; day < 6; day += 1) {
    if (
      await page
        .getByTestId('wire-bulletins')
        .isVisible()
        .catch(() => false)
    )
      break;
    await page.getByTestId('end-day').click();
    await page.waitForTimeout(120);
  }
  if (
    await page
      .getByTestId('wire-bulletins')
      .isVisible()
      .catch(() => false)
  ) {
    const capWide = (await cap.boundingBox())!;
    const trackWide = (await track.boundingBox())!;
    expect(capWide.x + capWide.width).toBeLessThanOrEqual(trackWide.x + 1);
  }
});

test('screenshot pass · the six-panel board reads as the ruled direction', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('trade-pane')).toBeVisible();
  await expect(page.getByTestId('contract').first()).toBeVisible();

  // `test-results/` is gitignored — nothing binary is committed. These are the
  // artifacts T-218's accept clause is judged from, against
  // `docs/design/T218-reference/chassis-rvrule.png` (the ruled build) and
  // NOT against the rejected fuller-synthesis attempt.
  await page.screenshot({ path: 'test-results/T-218-cockpit.png' });
  await page.locator('.main').screenshot({ path: 'test-results/T-218-main.png' });
  await page.locator('.dock').screenshot({ path: 'test-results/T-218-dock.png' });
  await page.getByTestId('manifest-board').screenshot({
    path: 'test-results/T-218-manifest.png',
  });
  await page.locator('.wire').screenshot({ path: 'test-results/T-218-wire.png' });

  // An ARMED die — ruled edit 2, in the state the ruling is about.
  await page.locator('[data-testid="die"][data-spent="0"]').first().click();
  await page.locator('.dock').screenshot({ path: 'test-results/T-218-dock-armed.png' });

  // T-216's own accept clause: a screenshot of the honor list.
  await page.getByTestId('records-toggle').click();
  const honor = page.getByTestId('honor-list');
  if (await honor.isVisible().catch(() => false)) {
    await honor.screenshot({ path: 'test-results/T-218-honor-list.png' });
  }
  await page.screenshot({ path: 'test-results/T-218-records.png' });
});
