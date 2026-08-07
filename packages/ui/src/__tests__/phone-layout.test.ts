import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// T-219 · THE NARROW-COCKPIT RULES, GUARDED INSIDE `npm test`.
//
// The geometry itself is proved where geometry lives — `e2e/cockpit-phone-
// layout.spec.ts` measures real bounding boxes at `devices['Pixel 5']` and is
// the reader for UI-41. But `npm test` is VITEST ONLY: the e2e suite is not in
// the mandatory gate, so a regression in these declarations would land green and
// only surface in a separate run. This file closes that hole.
//
// It is deliberately NOT a transcription of the media blocks. Only three things
// are pinned, and each one is a bug that has already happened:
//
//   1. `.col.left` must not carry a FIXED PIXEL `grid-template-rows` under the
//      900px block. That single declaration (`200px auto`) is what forced a
//      200px starmap row into a 66.4px column and made the panes overlap. Any
//      pixel row here is the same bug with a different number.
//   2. `.screen` and `.main` must take `minmax(0, 1fr)` columns under that
//      block. A bare `1fr` (or an absent `grid-template-columns` on `.screen`)
//      restores the `min-content` automatic minimum that blew the masthead's
//      control cluster 31px past the right edge of the viewport.
//   3. The phone overlay anchors must come AFTER the base anchors they override.
//      They have identical specificity, so source order is the only thing that
//      decides them — the first cut of T-219 put the override 500 lines too
//      early, `bottom: 132px` survived, and an absolutely-positioned box with
//      both `top` and `bottom` resolved STRETCHED to 567px tall.
// ---------------------------------------------------------------------------

const UI_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEME = readFileSync(join(UI_SRC, 'theme.css'), 'utf8');

/** `theme.css` with every comment removed — these blocks are heavily commented,
 *  and prose ABOUT a declaration must never be mistaken for the declaration. */
const THEME_CODE = THEME.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The body of every `@media` rule whose prelude matches, brace-balanced.
 * `theme.css` has more than one block per breakpoint, so this returns all of
 * them and the assertions look at the union.
 */
function mediaBlocks(css: string, prelude: RegExp): { at: number; body: string }[] {
  const out: { at: number; body: string }[] = [];
  for (const m of css.matchAll(/@media[^{]*/g)) {
    if (!prelude.test(m[0])) continue;
    let depth = 0;
    let i = m.index + m[0].length;
    const start = i + 1;
    for (; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push({ at: m.index, body: css.slice(start, i) });
  }
  return out;
}

/** The declaration body of `selector` inside `block`, or `null`. */
function ruleBody(block: string, selector: string): string | null {
  // Selectors are matched as a whole comma-separated list member.
  const re = new RegExp(
    `(?:^|[};])\\s*(?:[^{};]*,\\s*)*${selector.replace(/[.[\]='*]/g, '\\$&')}\\s*(?:,\\s*[^{};]*)*\\{([^}]*)\\}`,
    'm',
  );
  return re.exec(block)?.[1] ?? null;
}

describe('T-219 · the cockpit at narrow widths', () => {
  const narrow = mediaBlocks(THEME_CODE, /max-width:\s*900px/)
    .map((b) => b.body)
    .join('\n');

  it('has a 900px block at all', () => {
    expect(narrow).toContain('.main');
  });

  it('gives .col.left no fixed pixel row track — the overlap bug itself', () => {
    const body = ruleBody(narrow, '.col.left');
    expect(body, '.col.left is no longer addressed under 900px').not.toBeNull();
    const rows = /grid-template-rows\s*:\s*([^;]+)/.exec(body!)?.[1] ?? '';
    expect(
      rows,
      'a pixel row height here forces a fixed-size pane into a collapsed column',
    ).not.toMatch(/\d+px/);
  });

  it('gives .screen and .main a minmax(0, 1fr) column, not a min-content track', () => {
    for (const selector of ['.screen', '.main']) {
      const body = ruleBody(narrow, selector);
      expect(body, `${selector} is not addressed under 900px`).not.toBeNull();
      expect(body, `${selector} must not inherit a min-content automatic minimum`).toMatch(
        /grid-template-columns\s*:\s*minmax\(\s*0\s*,\s*1fr\s*\)/,
      );
    }
  });

  it('makes .main the scroll container rather than the document', () => {
    // Scrolling `<body>` instead would move every absolutely-positioned overlay
    // off its anchor and break the standing `scrollWidth <= clientWidth` claim.
    const body = ruleBody(narrow, '.main')!;
    expect(body).toMatch(/overflow-y\s*:\s*auto/);
    expect(THEME_CODE).toMatch(/body\s*\{[^}]*overflow\s*:\s*hidden/);
  });
});

describe('T-219 · the phone overlay anchors', () => {
  const ANCHORS = [
    ".onboarding[data-onboarding-anchor='hand']",
    ".walkthrough[data-walkthrough-anchor='hand']",
    '.storylet-panel',
  ] as const;

  const blocks = mediaBlocks(THEME_CODE, /max-width:\s*560px/);
  const phone = blocks.map((b) => b.body).join('\n');
  /** The 560px block that carries the anchor overrides, wherever it is homed. */
  const anchorBlock = blocks.find((b) => /bottom\s*:\s*auto/.test(b.body));

  it('unpins the three bottom-anchored overlays from the dawn-hand tray', () => {
    for (const selector of ANCHORS) {
      const body = ruleBody(phone, selector);
      expect(body, `${selector} is not re-anchored at phone width`).not.toBeNull();
      expect(body, `${selector} must release its bottom anchor, not just add a top`).toMatch(
        /bottom\s*:\s*auto/,
      );
      expect(body).toMatch(/top\s*:/);
    }
  });

  it('declares those overrides AFTER the base anchors they override', () => {
    // Identical specificity — source order is the whole mechanism.
    expect(anchorBlock, 'no 560px block releases a bottom anchor').toBeDefined();
    for (const base of ANCHORS) {
      const declaredAt = THEME_CODE.indexOf(base);
      expect(declaredAt, `${base} has no base rule at all`).toBeGreaterThan(0);
      expect(declaredAt, `${base} is declared AFTER its phone override`).toBeLessThan(
        anchorBlock!.at,
      );
    }
  });
});
