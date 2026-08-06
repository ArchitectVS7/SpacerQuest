import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOTION_SCALE, MOTION_TIERS } from '../motion';

// ---------------------------------------------------------------------------
// T-252 · "NO BEAT IS LEFT CINEMATIC-ONLY", AS A SCAN INSTEAD OF AN INSPECTION.
//
// `tabletop-ui` §8 is an owner standing rule: animation intensity is a player
// menu option (Cinematic / Snappy / Instant) and "Never ship cinematic-only."
// T-252's accept clause demands the retrofit list be "proven complete by a scan
// of the animation rails rather than by inspection" — because a hand-checked
// list is exactly the thing a later task silently breaks by adding one more
// `animation: foo 400ms` somewhere in a 6,000-line stylesheet.
//
// So the classification IS the test. Every animation/transition declaration in
// `theme.css` must fall into exactly one of four buckets:
//
//   (a) it is `none` (a rail that switches motion OFF);
//   (b) every time component is a `var(--dur-*)` / `var(--del-*)` token — i.e.
//       it is a BEAT and it rides `--motion-scale`;
//   (c) its keyframe name is on the AMBIENT allowlist below — an `infinite`
//       loop, which deliberately does NOT scale;
//   (d) its selector is on the RESPONSE allowlist below — a sub-250ms hover /
//       state transition, which deliberately does NOT scale.
//
// Anything else is a beat someone forgot to tokenise, and it fails HERE rather
// than shipping as a cinematic-only beat. (c) and (d) are then discharged by the
// Instant kill-switch assertion, so every declaration in the file is either
// scaled by the knob or killed outright at Instant.
//
// Same shape and same precedent as `visual-identity.test.ts`: this reads
// `theme.css` and `App.tsx` as SOURCE. The complementary claims on the RUNNING
// page — computed `animation-duration` per tier off a real click on the Settings
// segment — live in `e2e/motion-tiers.spec.ts`, because "the live UI renders it"
// is a claim a source file cannot make. Neither file replaces the other.
// ---------------------------------------------------------------------------

const UI_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
// Scoped to `src/` on purpose: `packages/ui/dist*` carries STALE bundled copies
// of this stylesheet, and a scan that wandered in there would assert against a
// previous build rather than against the working tree.
const THEME_RAW = readFileSync(join(UI_SRC, 'theme.css'), 'utf8');
const THEME = THEME_RAW.replace(/\/\*[\s\S]*?\*\//g, '');
const APP = readFileSync(join(UI_SRC, 'App.tsx'), 'utf8');

/**
 * AMBIENT — the five `infinite` loops. Speeding ambience up is a bug, not a
 * tier: §8's "durations ... scene staging trimmed" is about beats. Each is
 * killed outright at Instant by the blanket kill-switch.
 */
const AMBIENT: Record<string, string> = {
  flicker: 'the CRT effect layer’s phosphor flicker — the tube is always alive',
  'ring-pulse': 'the fuel ring’s idle breath — a state indicator, not an event',
  pulse: 'the live-dot heartbeat — it means "running", so it cannot be trimmed',
  tick: 'the 40s news marquee — a scroll SPEED; 0.4x would make it unreadable',
  'wt-pulse': 'the starmap rails-target beacon — an idle "you are aimed here" mark',
};

/**
 * RESPONSE — sub-250ms hover/state transitions. That is UI responsiveness, not
 * cinema; trimming them would make the interface feel broken rather than snappy.
 * Also killed outright at Instant.
 */
const RESPONSE: Record<string, string> = {
  '.contract': 'contract-card hover: 200ms border/background, a pointer response',
  '.mb-toggle::after': 'the manifest disclosure caret: 180ms rotate on open/close',
  '.die': 'dawn-hand die hover/select: 180ms lift, colour and glow',
};

/** Every `<prop>: <value>;` declaration of a motion property, with its selector. */
interface Decl {
  prop: string;
  value: string;
  selector: string;
  line: number;
}

/**
 * A brace walk over the comment-stripped stylesheet. Deliberately NOT a
 * line-regex: `transition:` and `box-shadow:` are both written multi-line here,
 * and a line-based reader mis-attributes a wrapped value to the wrong selector
 * (which is how the first draft of this test read `.die`'s transition as
 * belonging to a `box-shadow` fragment). Depth is tracked so a declaration
 * inside an `@media` block still reports the RULE's selector, not the query's.
 */
function scanDeclarations(css: string): Decl[] {
  const out: Decl[] = [];
  const stack: string[] = [];
  let buf = '';
  let line = 1;
  let bufStartLine = 1;
  const flush = (isDecl: boolean) => {
    const text = buf.trim();
    buf = '';
    if (!isDecl || text === '') return;
    const colon = text.indexOf(':');
    if (colon < 0) return;
    const prop = text.slice(0, colon).trim();
    if (!/^(animation|transition)(-duration|-delay)?$/.test(prop)) return;
    out.push({
      prop,
      value: text
        .slice(colon + 1)
        .replace(/\s+/g, ' ')
        .trim(),
      // The innermost non-at-rule selector — the one the declaration applies to.
      selector: [...stack].reverse().find((sel) => !sel.startsWith('@')) ?? '',
      line: bufStartLine,
    });
  };
  for (const ch of css) {
    if (ch === '\n') line++;
    if (ch === '{') {
      stack.push(buf.trim().replace(/\s+/g, ' '));
      buf = '';
      bufStartLine = line;
    } else if (ch === '}') {
      flush(true);
      stack.pop();
      bufStartLine = line;
    } else if (ch === ';') {
      flush(true);
      bufStartLine = line;
    } else {
      if (buf.trim() === '') bufStartLine = line;
      buf += ch;
    }
  }
  return out;
}

const DECLS = scanDeclarations(THEME);

describe('T-252 · the knob is declared exactly once, per tier', () => {
  it('declares `--motion-scale` for the base and for all three tiers, and nothing else', () => {
    const decls = [...THEME_RAW.matchAll(/([^{}]*)\{[^{}]*--motion-scale:\s*([^;]+);/g)].map(
      (m) => [m[1].trim().split('\n').pop()!.trim(), m[2].trim()] as const,
    );
    expect(decls).toEqual([
      [':root', '1'],
      [":root[data-motion='cinematic']", '1'],
      [":root[data-motion='snappy']", '0.4'],
      [":root[data-motion='instant']", '0'],
      [':root:not([data-motion])', '0'], // the pre-hydration OS-query guard
    ]);
  });

  it('the CSS scale factors ARE `motion.ts`’s — one vocabulary, not two', () => {
    for (const tier of MOTION_TIERS) {
      const re = new RegExp(
        `:root\\[data-motion='${tier}'\\]\\s*\\{\\s*--motion-scale:\\s*([^;]+);`,
      );
      const m = re.exec(THEME_RAW);
      expect(m, `no --motion-scale block for ${tier}`).not.toBeNull();
      expect(Number(m![1].trim())).toBe(MOTION_SCALE[tier]);
    }
  });

  it('knows no fourth `data-motion` value — the old `full`/`reduced` binary is gone', () => {
    const values = new Set([...THEME_RAW.matchAll(/data-motion='([^']*)'/g)].map((m) => m[1]));
    expect([...values].sort()).toEqual(['cinematic', 'instant', 'snappy']);
  });
});

describe('T-252 · every BEAT token is a calc() off the one knob', () => {
  const tokens = [...THEME_RAW.matchAll(/(--(?:dur|del)-[a-z0-9-]+):\s*([^;]+);/g)];

  it('finds the token block at all', () => {
    expect(tokens.length).toBeGreaterThanOrEqual(20);
  });

  it.each(tokens.map((m) => [m[1], m[2].trim()]))('%s = %s', (_name, value) => {
    // A token that hard-coded a time, or that multiplied by anything other than
    // the knob, would be a second implementation of the tiers.
    expect(value).toMatch(/^calc\(\s*\d+(\.\d+)?m?s\s*\*\s*var\(--motion-scale\)\s*\)$/);
  });
});

describe('T-252 · THE COMPLETENESS SCAN — no beat is left cinematic-only', () => {
  it('finds every motion declaration in the stylesheet', () => {
    // A parser that silently matched nothing would make this whole file vacuous.
    expect(DECLS.length).toBeGreaterThanOrEqual(30);
  });

  it.each(DECLS.map((d) => [`${d.selector} { ${d.prop}: ${d.value} }  (line ${d.line})`, d]))(
    '%s',
    (_label, d) => {
      const v = d.value;

      // (a) an explicit OFF rail.
      if (/^none(\s*!important)?$/.test(v)) return;

      // (b) a BEAT: every time component is a token off `--motion-scale`.
      const literalTimes = v.match(/(^|[\s(,])\d+(\.\d+)?m?s\b/g) ?? [];
      const varTimes = v.match(/var\(--(?:dur|del)-[a-z0-9-]+\)/g) ?? [];
      if (varTimes.length > 0 && literalTimes.length === 0) return;

      // (c) AMBIENT: an infinite loop, by keyframe name.
      const name = v.split(/\s+/)[0];
      if (name in AMBIENT) {
        expect(v, `${name} is allowlisted as AMBIENT, so it must be infinite`).toMatch(/infinite/);
        return;
      }

      // (d) RESPONSE: a sub-250ms hover/state transition, by selector.
      if (d.selector in RESPONSE && d.prop.startsWith('transition')) {
        for (const t of literalTimes) {
          const ms = t.trim().endsWith('ms') ? Number.parseFloat(t) : Number.parseFloat(t) * 1000;
          expect(ms, `${d.selector} is allowlisted as RESPONSE, so it must be <250ms`).toBeLessThan(
            250,
          );
        }
        return;
      }

      throw new Error(
        `UNCLASSIFIED MOTION DECLARATION at theme.css:${d.line} — "${d.selector} { ${d.prop}: ${v} }".\n` +
          'A new beat must take a `--dur-*` / `--del-*` token off `--motion-scale` (T-252, ' +
          '`tabletop-ui` §8: never ship cinematic-only). If it is genuinely an infinite ambient ' +
          'loop or a sub-250ms hover response, add it to AMBIENT / RESPONSE in this file with a ' +
          'one-line justification — that is a deliberate, reviewable exception, not a default.',
      );
    },
  );

  it('every allowlisted exception is present in the stylesheet (no dead entries)', () => {
    for (const name of Object.keys(AMBIENT)) {
      expect(THEME, `AMBIENT allowlist entry '${name}' matches nothing`).toContain(
        `@keyframes ${name}`,
      );
    }
    for (const sel of Object.keys(RESPONSE)) {
      expect(DECLS.some((d) => d.selector === sel && d.prop.startsWith('transition'))).toBe(true);
    }
  });
});

describe('T-252 · the Instant rail reaches what the knob deliberately does not', () => {
  it('kills every animation and transition on every element at Instant', () => {
    const block =
      /:root\[data-motion='instant'\] \*,\s*:root\[data-motion='instant'\] \*::before,\s*:root\[data-motion='instant'\] \*::after \{([^}]*)\}/.exec(
        THEME,
      );
    expect(block, 'the Instant kill-switch is missing').not.toBeNull();
    expect(block![1]).toMatch(/animation:\s*none\s*!important/);
    expect(block![1]).toMatch(/transition:\s*none\s*!important/);
  });

  // Together with the scan above this is the accept clause's "no beat is left
  // cinematic-only": every declaration is either (b) scaled to 0 by the knob, or
  // (a)/(c)/(d) switched off outright by the selector asserted here.
  it('leaves no motion category outside {scaled-to-zero} u {killed}', () => {
    const unaccounted = DECLS.filter((d) => {
      const v = d.value;
      if (/^none(\s*!important)?$/.test(v)) return false;
      if ((v.match(/var\(--(?:dur|del)-[a-z0-9-]+\)/g) ?? []).length > 0) return false;
      const name = v.split(/\s+/)[0];
      return !(name in AMBIENT) && !(d.selector in RESPONSE);
    });
    expect(unaccounted).toEqual([]);
  });
});

describe('T-252 · App.tsx speaks the same vocabulary', () => {
  it('stamps `data-motion` from the resolved tier, never from a literal', () => {
    expect(APP).toContain("document.documentElement.setAttribute('data-motion', tier)");
    expect(APP).not.toMatch(/data-motion['"]?\s*,\s*['"](?:full|reduced)['"]/);
    expect(APP).not.toContain("'sq.reduced-motion'");
  });

  it('resolves the tier against the OS query at every entry point', () => {
    // The cockpit root, the Liar's Dice scene and the hand dock.
    expect((APP.match(/resolveMotionTier\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('routes every scaled JS timer through the one knob', () => {
    // The dawn scramble interval, the Liar's Dice dealer beat and the die-bloom
    // clear. NOT the ship-diagram `.focused` window (700ms): that one holds a
    // STATE MARK rather than playing a beat, and scaling it would delete "which
    // row did I land on?" at Instant — see the comment at its call site.
    for (const ms of [55, 620, 750]) {
      expect(APP).toMatch(new RegExp(`scaleMs\\(\\s*${ms}\\s*,\\s*tier\\s*\\)`));
    }
    expect((APP.match(/scaleMs\(/g) ?? []).length).toBe(3);
  });

  it('retrofits the Liar’s Dice GSAP timeline with the knob rather than new literals', () => {
    expect(APP).toContain('tl.timeScale(1 / MOTION_SCALE[tier]);');
  });

  it('has no `reducedMotion` boolean left anywhere in the cockpit source', () => {
    const STORE = readFileSync(join(UI_SRC, 'store.ts'), 'utf8');
    expect(APP).not.toContain('state.reducedMotion');
    expect(STORE).not.toContain('reducedMotion:');
    expect(STORE).toContain('function readMotionTier()');
    expect(STORE).toContain('export function setMotionTier(');
  });

  it('offers all three tiers in Settings — the rule is a MENU, not a default', () => {
    expect(APP).toContain('data-testid="set-motion"');
    expect(APP).toContain('data-testid={`set-motion-${tier}`}');
    expect(APP).toContain('MOTION_TIERS.map');
  });
});
