import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// T-218 · "ONE PHOSPHOR, TWO MATERIALS", AS A TEST INSTEAD OF A COMMENT.
//
// `theme.css` has carried a prose design law at the top of the file since T-302.
// T-216 proved prose is not a gate: the file asserted "one phosphor colour,
// never a second hue" while three live rules rendered teal (`--accent`,
// undefined, so its `#4fd1c5` FALLBACK painted), blue-grey (`--line`, same
// failure mode) and orange-red (`.as-hostile`, a hardcoded literal). All three
// were shipping in production, in a component the player actually opens.
//
// So the T-186 ruling that T-218 implements is pinned MECHANICALLY here:
//
//   1. the five amber tokens still hold their EXACT pre-T-218 values — the
//      ruling's "additive, not a re-hue" clause;
//   2. the steel/chassis family is fully declared;
//   3. NO `var(--x)` anywhere in the file lacks a declaration — this is the
//      T-216 bug class, made unrepeatable;
//   4. NO literal hex outside the sanctioned families — the one-phosphor law
//      itself, checkable;
//   5. the two RULED reverse-video edits (`.slot.ready`, `.die.sel`) are still
//      the outlined/lit treatment the owner approved, not the reverse-video fill
//      they replaced;
//   6. the sanctioned reverse-video sites DO still invert — the rule is
//      "reserved to", not "removed", and a pass that quietly de-inverted the
//      DEBT chip would be just as wrong as one that re-inverted the die.
//
// These assertions read `theme.css` as SOURCE. The complementary assertions on
// the RUNNING page (computed colours, the armed die driven through a real click,
// the T-217 wire geometry) live in `e2e/visual-identity.spec.ts`, because "the
// live UI renders it" is the accept clause's own wording and a source file
// cannot prove that. Neither file replaces the other.
// ---------------------------------------------------------------------------

const UI_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEME = readFileSync(join(UI_SRC, 'theme.css'), 'utf8');

/** `theme.css` with every comment removed — prose about a bug must never be
 *  mistaken for the bug. (§3 and §4 both scan for tokens/hex that this file
 *  legitimately NAMES in its own explanatory comments.) */
const THEME_CODE = THEME.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every custom property DECLARED at the head of a declaration. */
function declaredProps(css: string): Set<string> {
  return new Set([...css.matchAll(/(?:^|[;{]|\s)(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
}

/** Every custom property REFERENCED through `var()`. */
function referencedProps(css: string): string[] {
  return [...css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((m) => m[1]);
}

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb {
  const h =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

function spread({ r, g, b }: Rgb): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
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

/** The channel spread below which a colour carries no perceptible hue — this is
 *  the numeric meaning of "steel is an ABSENCE of hue, not a second one". */
const ACHROMATIC_MAX_SPREAD = 12;
/** Below this luminance the chroma of a near-black is not perceptible either, so
 *  the very dark warm greys the file has always used are not hue violations. */
const NEAR_BLACK_MAX_CHANNEL = 40;
/** The amber phosphor's own hue window. The five tokens sit at 33.5°–41.4°. */
const AMBER_HUE_MIN = 25;
const AMBER_HUE_MAX = 50;

function classifyHex(hex: string): 'achromatic' | 'near-black' | 'amber' | 'off-system' {
  const rgb = parseHex(hex);
  if (spread(rgb) <= ACHROMATIC_MAX_SPREAD) return 'achromatic';
  if (Math.max(rgb.r, rgb.g, rgb.b) <= NEAR_BLACK_MAX_CHANNEL) return 'near-black';
  const h = hueDeg(rgb);
  if (rgb.r >= rgb.g && rgb.g >= rgb.b && h >= AMBER_HUE_MIN && h <= AMBER_HUE_MAX) return 'amber';
  return 'off-system';
}

/** Pull one rule's declaration block out of the stylesheet by exact selector. */
function ruleBody(selector: string): string {
  // Match the selector only when it is the WHOLE selector list of the rule, so
  // `.die.sel` never accidentally resolves through `.die.sel .dv`.
  const re = new RegExp(
    `(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
  );
  const m = re.exec(THEME_CODE);
  expect(m, `no rule found for selector \`${selector}\``).not.toBeNull();
  return m![1];
}

describe('T-218 · the amber tokens are untouched (additive, not a re-hue)', () => {
  // The bake-off's engineering reviewer's finding, and the ruling's own words:
  // the steel family is ADDED alongside these; none of these five moves.
  const AMBER_TOKENS: Record<string, string> = {
    '--ember': '#ffb000',
    '--ember-hi': '#ffe1a6',
    '--amber': '#c0781a',
    '--amber-dim': '#5e3b0e',
    '--hair': '#3a2408',
  };

  for (const [token, value] of Object.entries(AMBER_TOKENS)) {
    it(`${token} is still exactly ${value}`, () => {
      const re = new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{3,6})\\s*;`);
      const m = re.exec(THEME_CODE);
      expect(m, `${token} is not declared`).not.toBeNull();
      expect(m![1].toLowerCase()).toBe(value);
    });
  }
});

describe('T-218 · the steel/chassis family exists', () => {
  const STEEL_FAMILY = [
    '--steel-hi',
    '--steel',
    '--steel-lo',
    '--steel-deep',
    '--etch',
    '--etch-dim',
    '--well',
    '--edge',
    '--bevel',
    '--recess',
  ];

  it('every chassis token is declared', () => {
    const declared = declaredProps(THEME_CODE);
    expect(STEEL_FAMILY.filter((t) => !declared.has(t))).toEqual([]);
  });

  it('every colour token in the family is near-achromatic — steel is an absence of hue', () => {
    const offenders: string[] = [];
    for (const token of [
      '--steel-hi',
      '--steel',
      '--steel-lo',
      '--steel-deep',
      '--etch',
      '--etch-dim',
      '--well',
      '--edge',
    ]) {
      const m = new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{3,6})`).exec(THEME_CODE);
      expect(m, `${token} is not declared as a hex`).not.toBeNull();
      if (spread(parseHex(m![1].slice(1))) > ACHROMATIC_MAX_SPREAD) offenders.push(token);
    }
    expect(offenders).toEqual([]);
  });
});

describe('T-218/T-216 · no undefined custom property is ever referenced', () => {
  // THIS IS T-216's ROOT CAUSE, GATED. `var(--accent, #4fd1c5)` renders teal in
  // production precisely because `--accent` does not exist: the fallback is not
  // a safety net, it is the thing that ships.
  it('every var(--x) resolves to a declaration in this file', () => {
    const declared = declaredProps(THEME_CODE);
    const missing = [...new Set(referencedProps(THEME_CODE))].filter((p) => !declared.has(p));
    expect(missing).toEqual([]);
  });

  it('no var() reference carries a colour fallback, which would hide a missing token', () => {
    const withFallback = [
      ...THEME_CODE.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*,\s*(#[0-9a-fA-F]{3,6})/g),
    ].map((m) => `${m[1]} → ${m[2]}`);
    expect(withFallback).toEqual([]);
  });
});

describe('T-218/T-216 · one phosphor: every literal hex is on-system', () => {
  it('is amber-family, near-achromatic, or near-black — nothing else', () => {
    const offenders = new Map<string, number>();
    for (const m of THEME_CODE.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) {
      if (classifyHex(m[1]) !== 'off-system') continue;
      const line = THEME_CODE.slice(0, m.index).split('\n').length;
      offenders.set(`#${m[1]}`, line);
    }
    // Deliberately reported with the value, so a failure names the leak.
    expect([...offenders.keys()]).toEqual([]);
  });

  it('the classifier itself rejects the three hues T-216 actually found', () => {
    // A guard on the guard: if this ever passes, the check above is vacuous.
    expect(classifyHex('4fd1c5')).toBe('off-system'); // the --accent teal
    expect(classifyHex('2b3a44')).toBe('off-system'); // the --line blue-grey
    expect(classifyHex('e0562a')).toBe('off-system'); // .as-hostile orange-red
    expect(classifyHex('ffb000')).toBe('amber');
    expect(classifyHex('1d1e1a')).toBe('achromatic');
  });
});

describe('T-218 · the two RULED reverse-video edits', () => {
  // The owner approved candidate D plus EXACTLY these two selector changes
  // (`docs/design/T218-reference/chassis-rvrule.html`, a two-selector diff
  // against `chassis.html`). Both directions are pinned: they must not revert to
  // a fill, and the sanctioned inversions below must not be removed with them.
  it('`.slot.ready` is an outlined lit badge, not a solid ember fill', () => {
    const body = ruleBody('.slot.ready');
    expect(body).toMatch(/background:\s*var\(--well\)/);
    expect(body).toMatch(/color:\s*var\(--ember\)/);
    expect(body).not.toMatch(/background:\s*var\(--ember\)/);
    expect(body).not.toMatch(/color:\s*var\(--tube\)/);
  });

  it("`.die.sel` keeps the die's dark steel body and lights its ring", () => {
    const body = ruleBody('.die.sel');
    expect(body).toMatch(/inset 0 0 0 2px var\(--ember\)/);
    expect(body).toMatch(/color:\s*var\(--ember\)/);
    // The rejected treatment was a light-amber gradient fill with dark numerals.
    expect(body).not.toMatch(/#ffd57a/);
    expect(body).not.toMatch(/background:\s*(linear-gradient\([^)]*)?var\(--ember\)/);
  });

  it('the die keeps its selection LIFT — an app affordance, not part of the ruling', () => {
    expect(ruleBody('.die.sel')).toMatch(/transform:\s*translateY\(-8px\)/);
  });
});

describe('T-218 · reverse video is RESERVED, not removed', () => {
  // "Reserved to real urgency" cuts both ways. These four are the ruling's own
  // named survivors (`.ship-region.critical` is this app's dead-system callout,
  // the reference build's `.ship-region.damaged .rg-v`).
  const SANCTIONED: Array<[string, string]> = [
    ['.chip.rev', 'the DEBT marker'],
    ['.flag.urgent', 'an URGENT contract'],
    ['.ledger-block .due-soon b', 'a marker about to come due'],
    ['.ship-region.critical', 'a dead ship system'],
  ];

  for (const [selector, why] of SANCTIONED) {
    it(`${selector} still inverts (${why})`, () => {
      expect(ruleBody(selector)).toMatch(/background:\s*var\(--ember\)/);
    });
  }

  it('`.as-hostile .as-value` is separable from neutral WITHOUT relying on hue', () => {
    // T-216's severity amendment: an amber value alone does not discharge the
    // finding, because hostile and neutral then collapse under deuteranopia and
    // protanopia. Hostile inverts AND carries a glyph — two non-hue channels.
    const hostile = ruleBody('.as-hostile .as-value');
    expect(hostile).toMatch(/background:\s*var\(--ember\)/);
    expect(hostile).toMatch(/color:\s*var\(--well\)/);
    expect(THEME_CODE).toMatch(/\.as-hostile \.as-value::before\s*\{[^}]*content:/);
    // …and neutral does none of that, so the two cannot converge.
    expect(ruleBody('.as-neutral .as-value')).not.toMatch(/background:/);
  });
});

describe('T-217 · the wire ticker no longer clears the cap with a magic number', () => {
  it('`.ticker` has no hardcoded left padding sized to `.cap`', () => {
    expect(ruleBody('.ticker')).not.toMatch(/padding:[^;]*138px/);
  });

  it('`.wire` is a flex row and `.wire-track` is the flexible scroll window', () => {
    expect(ruleBody('.wire')).toMatch(/display:\s*flex/);
    const track = ruleBody('.wire-track');
    expect(track).toMatch(/flex:\s*1/);
    expect(track).toMatch(/min-width:\s*0/);
    expect(track).toMatch(/overflow:\s*hidden/);
  });

  it('`.wire .cap` is in normal flow, not absolutely positioned', () => {
    expect(ruleBody('.wire .cap')).not.toMatch(/position:\s*absolute/);
  });
});
