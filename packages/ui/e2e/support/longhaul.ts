// ---------------------------------------------------------------------------
// T-162 · The long-haul invariant sweep — the DOM half (the driver).
//
// A plain support module, NOT a spec: Playwright's `testMatch` is
// `**/*.@(spec|test).?(c|m)[jt]s?(x)`, so nothing under `e2e/support/` is
// collected as a suite. Its spec is `e2e/long-haul.spec.ts`; the battery it
// feeds is `e2e/support/longhaul-invariants.ts`, and the proof that the battery
// catches what it claims is `e2e/long-haul-invariants.spec.ts`.
//
// WHAT THIS DRIVES, AND WHY IT IS NOT `career.ts`. `career.ts` plays ONE pinned
// career competently and asserts a scripted story. This plays a RANDOM-BUT-LEGAL
// career badly, for at least thirty in-game days, and asserts nothing about the
// story at all — only that eight blanket claims survive every single action. The
// two are complements: a scripted spec can only catch what its author foresaw;
// this one exists for the bug nobody foresaw (`docs/TESTING-STRATEGY.md`'s
// bridge-blind-spot warning, and the worldbreaker precedent behind it).
//
// DO NOT MERGE THIS WITH `career.ts`. That file's header states the seed-21 Tour
// One pin "depends on this file byte for byte"; this module therefore imports
// exactly ONE thing from it (`skipFirstTurnWalkthrough`) and copies anything
// else it needs, with the copy marked. Nothing here may change that file.
//
// DETERMINISM, STATED HONESTLY. Two independent seeds are recorded: the GAME
// seed (typed into the New game control, so the engine stream is pinned) and the
// CHOICE seed (this module's own `mulberry32`, which picks the moves). Given
// both, the intended move sequence is reproducible. The RUN is not byte-
// reproducible, because move AVAILABILITY depends on Playwright actionability
// timing against a live React tree. A run is reviewable evidence, not a pin —
// which is why nothing in the spec asserts a pinned outcome, only invariants.
// ---------------------------------------------------------------------------

import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { signOpeningMarker, skipFirstTurnWalkthrough } from './career';
import {
  evaluateInvariants,
  INVARIANTS_PER_STEP,
  LONGHAUL_INVARIANTS,
  type CockpitSnapshot,
  type StepContext,
  type Violation,
} from './longhaul-invariants';

// ---- the choice stream ----------------------------------------------------

/** mulberry32 — inlined rather than added as a dependency, and seeded
 *  INDEPENDENTLY of the game seed so the two are separable in the report. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length) % items.length];
}

function pickInt(rnd: () => number, min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

// ---- the probe table ------------------------------------------------------
//
// Every testid the snapshot counts. `CONTROLS` are things a player clicks;
// `WATCHED` are the screens, panels and readouts that tell the driver what is on
// screen. The two are unioned into `present` / `enabled`.

const CONTROLS = [
  'die',
  'die-reroll',
  'end-day',
  'starmap-system',
  'confirm-jump',
  'explore-sweep',
  'contract',
  'haggle',
  'abandon-contract',
  'manifest-toggle',
  'buy-fuel',
  'pay-debt',
  'buy-port',
  'repair-all',
  'repair-component',
  'buy-pods',
  'buy-equipment',
  'upgrade-component',
  'hire-crew',
  'dismiss-crew',
  'storylet-open',
  'storylet-choice-btn',
  'storylet-close',
  'hangout-toggle',
  'hangout-close',
  'hangout-social',
  'hangout-npc',
  'dare-commit',
  'dare-move',
  'dare-leave',
  'loan-borrow',
  'loan-repay',
  'records-toggle',
  'records-close',
  'records-tab-registry',
  'records-tab-nemesis',
  'wire-log-toggle',
  'wire-log-close',
  'settings-toggle',
  'combat-die',
  'combat-fight',
  'combat-talk',
  'combat-run',
  'combat-stand-down',
  'combat-dismiss',
  'resolution-choice-btn',
  'succession-ack',
  'ending-return',
  'recovery-dismiss',
  'onboarding-dismiss',
  'walkthrough-skip',
  // T-200 · the opening marker's one control.
  'opening-marker-dismiss',
] as const;

const WATCHED = [
  'crash-screen',
  'ending-screen',
  'demo-end-card',
  'succession-notice',
  'resolution-ceremony',
  'resolution-choice-lock',
  'combat-overlay',
  'combat-aftermath',
  'dare-scene',
  'dare-reveal',
  'dare-wager',
  'dare-wager-bounds',
  'storylet-panel',
  'hangout-panel',
  'records-overlay',
  'settings-panel',
  'wire-log',
  'notice',
  'recovery-notice',
  'save-write-failed-notice',
  'onboarding',
  'walkthrough',
  'opening-marker',
  'hand',
  'day-end',
  'active-contract',
  'active-contract-empty',
  'route-preview',
  'fuel-amount',
  'debt-amount',
  'loan-repay-amount',
  'explore-panel',
  'exploration-outcome',
  'social-outcome',
  'manifest-stowed',
  'debt-chip',
] as const;

/** The three screens that REPLACE the cockpit (`App.tsx`'s early returns plus
 *  the error boundary). Everything else — combat, the ceremony, the succession
 *  notice, Records, the Hangout — leaves `end-day` and `hand` mounted, which is
 *  why they are deliberately not listed: `inv_cockpit_reachable` must not be
 *  handed an excuse it does not need. */
const SCREEN_OWNERS = ['crash-screen', 'ending-screen', 'demo-end-card'] as const;

// ---- the snapshot ---------------------------------------------------------

/**
 * ONE `page.evaluate()` per read. This is the performance decision of the whole
 * module: a snapshot built from thirty locator round-trips would cost more than
 * the play does. Everything the battery needs comes back in a single payload.
 */
async function snapshot(page: Page): Promise<CockpitSnapshot> {
  return page.evaluate(
    ({
      controls,
      watched,
      screens,
    }: {
      controls: string[];
      watched: string[];
      screens: string[];
    }): CockpitSnapshot => {
      const all = Array.from(new Set([...controls, ...watched]));
      const els = (testid: string): Element[] =>
        Array.from(document.querySelectorAll(`[data-testid="${CSS.escape(testid)}"]`));
      const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
      const hittable = (el: Element): boolean => el.getClientRects().length > 0;
      const inert = (el: Element): boolean => el.closest('[inert]') !== null;
      const disabled = (el: Element): boolean =>
        el.hasAttribute('disabled') ||
        el.getAttribute('aria-disabled') === 'true' ||
        (el instanceof HTMLButtonElement && el.disabled) ||
        (el instanceof HTMLInputElement && el.disabled);
      // "A disabled BUTTON must say why" — a STRUCTURAL rule, not an allowlist:
      // button-like controls are what a player expects to press. SVG map nodes
      // (`<g data-testid="starmap-system" aria-disabled>`) communicate
      // cartographically and are excluded by the same structural rule, so no
      // hand-maintained exception list can drift.
      const buttonLike = (el: Element): boolean =>
        el instanceof HTMLButtonElement ||
        el instanceof HTMLInputElement ||
        el.getAttribute('role') === 'button';

      const reasonFor = (
        el: Element,
      ): {
        reason: string | null;
        source: CockpitSnapshot['disabledControls'][number]['reasonSource'];
      } => {
        const title = norm(el.getAttribute('title'));
        if (title) return { reason: title, source: 'title' };
        const data = norm(el.getAttribute('data-reason'));
        if (data) return { reason: data, source: 'data-reason' };
        const described = el.getAttribute('aria-describedby');
        if (described) {
          const text = described
            .split(/\s+/)
            .map((id) => norm(document.getElementById(id)?.textContent))
            .filter(Boolean)
            .join(' ');
          if (text) return { reason: text, source: 'aria-describedby' };
        }
        // The cockpit's own convention: a sibling `*-reason` node beside the
        // control (`repair-all-reason`, `crew-reason`, `port-reason`, …).
        for (const scope of [el.parentElement, el.parentElement?.parentElement]) {
          if (!scope) continue;
          const sibling = scope.querySelector('[data-testid$="-reason"], [data-testid$="-lock"]');
          const text = norm(sibling?.textContent);
          if (text) return { reason: text, source: 'sibling-reason' };
        }
        // Weakest source, accepted because the cockpit deliberately uses
        // reason-BEARING LABELS on several controls (`explore-sweep` becomes
        // "Pick a die to sweep"). Reported by source so the artifact shows how
        // much weight the weak source carries.
        const own = norm(el.textContent);
        if (own) return { reason: own, source: 'own-text' };
        return { reason: null, source: null };
      };

      const present: Record<string, number> = {};
      const enabled: Record<string, number> = {};
      const disabledControls: CockpitSnapshot['disabledControls'] = [];
      for (const testid of all) {
        const found = els(testid);
        present[testid] = found.length;
        let live = 0;
        found.forEach((el, index) => {
          if (inert(el)) return;
          if (disabled(el)) {
            if (buttonLike(el)) {
              const { reason, source } = reasonFor(el);
              disabledControls.push({ testid, index, reason, reasonSource: source });
            }
            return;
          }
          if (hittable(el)) live += 1;
        });
        enabled[testid] = live;
      }

      // ---- placeholder tokens rendered to the player ----------------------
      // `SPZ.Infinity` is a real ship name in `packages/content/src/cast.ts`, so
      // the Infinity probe requires the token NOT be preceded by a word char or
      // a dot. That is a content fact, not a filter over a bug.
      const patterns: { token: string; re: RegExp }[] = [
        { token: 'NaN', re: /(?<![\w.])NaN\b/ },
        { token: 'undefined', re: /(?<![\w.])undefined\b/ },
        { token: '[object Object]', re: /\[object Object\]/ },
        { token: 'Infinity', re: /(?<![\w.])Infinity\b/ },
      ];
      const suspiciousText: CockpitSnapshot['suspiciousText'] = [];
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const own = norm(
          Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent ?? '')
            .join(' '),
        );
        if (!own) continue;
        for (const { token, re } of patterns) {
          if (!re.test(own)) continue;
          suspiciousText.push({
            where:
              el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName.toLowerCase(),
            token,
            snippet: own.slice(0, 120),
          });
        }
      }

      // ---- the digest -----------------------------------------------------
      // Every `data-testid` element's normalised text plus the state attributes
      // a player can see change (pressed, spent, expanded, outcome, input
      // value). Hashed IN THE BROWSER so the payload stays small.
      const stateAttrs = [
        'aria-pressed',
        'aria-expanded',
        'aria-disabled',
        'disabled',
        'data-spent',
        'data-outcome',
        'data-face',
        'data-hidden',
        'data-actor',
        'data-locked',
        'data-reachable',
        'data-here',
        'data-hand-spent',
        'data-verdict',
        'data-resolution',
        // T-162 · F-162-2 · the notice's RAISE counter. Without it a second
        // identical refusal is indistinguishable from no refusal at all, and
        // `inv_no_dead_affordance` would call a working control dead.
        'data-notice-key',
      ];
      let hash = 0x811c9dc5;
      const feed = (s: string): void => {
        for (let i = 0; i < s.length; i += 1) {
          hash ^= s.charCodeAt(i);
          hash = Math.imul(hash, 0x01000193) >>> 0;
        }
      };
      for (const el of Array.from(document.querySelectorAll('[data-testid]'))) {
        feed(el.getAttribute('data-testid') ?? '');
        feed('|');
        feed(norm(el.textContent).slice(0, 400));
        for (const attr of stateAttrs) {
          const v = el.getAttribute(attr);
          if (v !== null) feed(`|${attr}=${v}`);
        }
        if (el instanceof HTMLInputElement) feed(`|value=${el.value}`);
        feed('\n');
      }

      const text = (testid: string): string | null => {
        const el = els(testid)[0];
        return el ? norm(el.textContent) : null;
      };
      const num = (testid: string): number | null => {
        const raw = text(testid);
        if (raw === null) return null;
        const parsed = Number.parseInt(raw.replace(/[^\d-]/g, ''), 10);
        return Number.isNaN(parsed) ? null : parsed;
      };

      const dice = els('die');
      return {
        day: num('day'),
        credits: num('credits'),
        fuel: text('fuel-hold'),
        dockedAt: text('docked-at'),
        debt: text('debt-chip'),
        spentDice: dice.filter((d) => d.getAttribute('data-spent') === '1').length,
        totalDice: dice.length,
        present,
        enabled,
        modalOwner: screens.find((s) => (present[s] ?? 0) > 0) ?? null,
        disabledControls,
        suspiciousText,
        digest: hash.toString(16).padStart(8, '0'),
        noticeText: text('notice'),
      };
    },
    {
      controls: [...CONTROLS],
      watched: [...WATCHED, ...SCREEN_OWNERS],
      screens: [...SCREEN_OWNERS],
    },
  );
}

function enabledCount(snap: CockpitSnapshot, testid: string): number {
  return snap.enabled[testid] ?? 0;
}
function presentCount(snap: CockpitSnapshot, testid: string): number {
  return snap.present[testid] ?? 0;
}
function unspentDice(snap: CockpitSnapshot): number {
  return snap.totalDice - snap.spentDice;
}

// ---- moves ----------------------------------------------------------------

interface Move {
  label: string;
  /** Could this move plausibly run against this snapshot? */
  available: (snap: CockpitSnapshot) => boolean;
  /**
   * Do the preparatory, RNG-free work (arm a die, fill an input, open a
   * pane) and return the ONE control the driver will trial-click and then
   * click. Returning null means "this move turned out not to be takeable" and
   * the step is recorded as skipped, never as a violation.
   */
  prepare: (page: Page, rnd: () => number, snap: CockpitSnapshot) => Promise<Locator | null>;
}

async function firstOf(page: Page, selector: string, rnd: () => number): Promise<Locator | null> {
  const all = page.locator(selector);
  const count = await all.count();
  if (count === 0) return null;
  return all.nth(Math.floor(rnd() * count) % count);
}

/** Arm an unspent die if none is armed. Selection is store-local, so this is
 *  free of engine RNG — the same asymmetry `career.ts` documents. */
async function ensureArmed(page: Page, rnd: () => number): Promise<boolean> {
  if ((await page.locator('[data-testid="die"][aria-pressed="true"]').count()) > 0) return true;
  const die = await firstOf(page, '[data-testid="die"][data-spent="0"]', rnd);
  if (die === null) return false;
  await die.click({ timeout: 2000 }).catch(() => undefined);
  return (await page.locator('[data-testid="die"][aria-pressed="true"]').count()) > 0;
}

async function enabledLocator(
  page: Page,
  testid: string,
  rnd: () => number,
): Promise<Locator | null> {
  const control = await firstOf(page, `[data-testid="${testid}"]:not([disabled])`, rnd);
  if (control === null) return null;
  return (await control.isEnabled().catch(() => false)) ? control : null;
}

interface SimpleMoveOptions {
  /** The control is die-gated: arm one first, then check it went live. */
  needsDie?: boolean;
  /** Extra preparation (filling an input) before the terminal control. */
  prep?: (page: Page, rnd: () => number, snap: CockpitSnapshot) => Promise<void>;
  /** Availability override; defaults to "at least one is enabled". */
  available?: (snap: CockpitSnapshot) => boolean;
}

function simpleMove(label: string, testid: string, opts: SimpleMoveOptions = {}): Move {
  return {
    label,
    available:
      opts.available ??
      (opts.needsDie
        ? // A die-gated control renders DISABLED until a die is armed, so its
          // availability is presence + a die to spend, not `enabled`.
          (snap) => presentCount(snap, testid) > 0 && unspentDice(snap) > 0
        : (snap) => enabledCount(snap, testid) > 0),
    prepare: async (page, rnd, snap) => {
      if (opts.needsDie && !(await ensureArmed(page, rnd))) return null;
      if (opts.prep) await opts.prep(page, rnd, snap);
      return enabledLocator(page, testid, rnd);
    },
  };
}

/** The cockpit moves. Every one is a real player click through the real DOM. */
const MOVES: Move[] = [
  {
    label: 'arm-die',
    available: (snap) => unspentDice(snap) > 0,
    prepare: (page, rnd) => firstOf(page, '[data-testid="die"][data-spent="0"]', rnd),
  },
  {
    label: 'preview-route',
    available: (snap) => enabledCount(snap, 'starmap-system') > 0,
    prepare: (page, rnd) =>
      firstOf(
        page,
        '[data-testid="starmap-system"][data-reachable="1"][data-here="0"]:not(.sel)',
        rnd,
      ),
  },
  {
    label: 'jump',
    available: (snap) => unspentDice(snap) > 0 && enabledCount(snap, 'starmap-system') > 0,
    prepare: async (page, rnd) => {
      const node = await firstOf(
        page,
        '[data-testid="starmap-system"][data-reachable="1"][data-here="0"]:not(.sel)',
        rnd,
      );
      if (node === null) return null;
      await node.click({ timeout: 2000 }).catch(() => undefined);
      if (!(await ensureArmed(page, rnd))) return null;
      return enabledLocator(page, 'confirm-jump', rnd);
    },
  },
  simpleMove('sign-contract', 'contract', { needsDie: true }),
  simpleMove('haggle', 'haggle', { needsDie: true }),
  simpleMove('abandon-contract', 'abandon-contract', { needsDie: true }),
  simpleMove('buy-fuel', 'buy-fuel', {
    needsDie: true,
    prep: async (page, rnd) => {
      await page
        .getByTestId('fuel-amount')
        .fill(String(pickInt(rnd, 5, 80)), { timeout: 2000 })
        .catch(() => undefined);
    },
  }),
  simpleMove('pay-debt', 'pay-debt', {
    prep: async (page, rnd) => {
      await page
        .getByTestId('debt-amount')
        .fill(String(pickInt(rnd, 1, 900)), { timeout: 2000 })
        .catch(() => undefined);
    },
  }),
  simpleMove('explore-sweep', 'explore-sweep', { needsDie: true }),
  simpleMove('repair-all', 'repair-all', { needsDie: true }),
  simpleMove('repair-component', 'repair-component', { needsDie: true }),
  simpleMove('buy-pods', 'buy-pods', { needsDie: true }),
  simpleMove('buy-equipment', 'buy-equipment', { needsDie: true }),
  simpleMove('upgrade-component', 'upgrade-component', { needsDie: true }),
  simpleMove('hire-crew', 'hire-crew', { needsDie: true }),
  simpleMove('dismiss-crew', 'dismiss-crew', { needsDie: true }),
  simpleMove('buy-port', 'buy-port', { needsDie: true }),
  simpleMove('die-reroll', 'die-reroll'),
  simpleMove('storylet-open', 'storylet-open'),
  simpleMove('storylet-choice', 'storylet-choice-btn', { needsDie: true }),
  simpleMove('storylet-close', 'storylet-close'),
  simpleMove('hangout-toggle', 'hangout-toggle'),
  simpleMove('hangout-close', 'hangout-close'),
  simpleMove('hangout-social', 'hangout-social', { needsDie: true }),
  simpleMove('loan-borrow', 'loan-borrow', { needsDie: true }),
  simpleMove('loan-repay', 'loan-repay', {
    needsDie: true,
    prep: async (page, rnd) => {
      await page
        .getByTestId('loan-repay-amount')
        .fill(String(pickInt(rnd, 1, 500)), { timeout: 2000 })
        .catch(() => undefined);
    },
  }),
  {
    // Seat a hand of Liar's Dice: choose a dealer, set the wager to the band's
    // own floor as the pane reports it, arm a die, deal.
    label: 'seat-dare',
    available: (snap) =>
      presentCount(snap, 'dare-commit') > 0 &&
      enabledCount(snap, 'hangout-npc') > 0 &&
      unspentDice(snap) > 0,
    prepare: async (page, rnd) => {
      const npc = await firstOf(page, '[data-testid="hangout-npc"]', rnd);
      if (npc === null) return null;
      await npc.click({ timeout: 2000 }).catch(() => undefined);
      const bounds = await page
        .getByTestId('dare-wager-bounds')
        .textContent()
        .catch(() => null);
      const floor = Number.parseInt((bounds ?? '').replace(/[^\d]/g, '').slice(0, 4), 10);
      if (Number.isFinite(floor) && floor > 0) {
        await page
          .getByTestId('dare-wager')
          .fill(String(floor), { timeout: 2000 })
          .catch(() => undefined);
      }
      if (!(await ensureArmed(page, rnd))) return null;
      return enabledLocator(page, 'dare-commit', rnd);
    },
  },
  // RNG-free panel churn: opening and closing panes costs the engine nothing but
  // exercises a great deal of client code, which is exactly the surface this
  // tier exists to watch.
  simpleMove('records-toggle', 'records-toggle'),
  simpleMove('records-close', 'records-close'),
  {
    label: 'records-tab',
    // Only ever the INACTIVE tab: re-selecting the live tab is a legitimate
    // no-op and would make `inv_no_dead_affordance` fire on correct behaviour.
    available: (snap) => presentCount(snap, 'records-overlay') > 0,
    prepare: (page, rnd) =>
      firstOf(page, '[data-testid^="records-tab-"][aria-pressed="false"]', rnd),
  },
  simpleMove('wire-log-toggle', 'wire-log-toggle'),
  simpleMove('wire-log-close', 'wire-log-close'),
  simpleMove('settings-toggle', 'settings-toggle'),
  simpleMove('manifest-toggle', 'manifest-toggle'),
  simpleMove('end-day', 'end-day'),
];

/**
 * OVERLAY SCOPING — why a random walk needs it, discovered by running one.
 *
 * The first smoke run stalled: the walk clicked `records-toggle`, the Records
 * overlay took the pointer, and every subsequent cockpit pick failed its
 * actionability trial because the overlay was in front of it. That is the
 * cockpit behaving CORRECTLY (it is the same property `action-blocked-parity`
 * asserts), so the fix belongs in the driver: while a surface owns the screen,
 * the walk plays inside that surface — which is what a player does — and the
 * surface's own close control is always in the pool, so it can never trap the
 * run. First match wins; the order is outermost-first.
 */
const OVERLAY_SCOPES: { testid: string; moves: readonly string[] }[] = [
  { testid: 'records-overlay', moves: ['records-tab', 'records-close'] },
  { testid: 'storylet-panel', moves: ['arm-die', 'storylet-choice', 'storylet-close'] },
  {
    testid: 'hangout-panel',
    moves: ['arm-die', 'hangout-social', 'loan-borrow', 'loan-repay', 'seat-dare', 'hangout-close'],
  },
  { testid: 'wire-log', moves: ['wire-log-close'] },
  { testid: 'settings-panel', moves: ['settings-toggle'] },
];

function scopedMoves(snap: CockpitSnapshot): Move[] {
  for (const scope of OVERLAY_SCOPES) {
    if (presentCount(snap, scope.testid) > 0) {
      return MOVES.filter((m) => scope.moves.includes(m.label));
    }
  }
  return MOVES;
}

/** Shut every non-blocking pane the walk may have left open. All RNG-free (the
 *  engine emits nothing for a pane opening), so this costs the career nothing. */
async function closeOverlays(page: Page): Promise<void> {
  for (const closer of ['storylet-close', 'records-close', 'wire-log-close', 'hangout-close']) {
    const control = page.getByTestId(closer).first();
    if ((await control.count()) === 0) continue;
    await control.click({ timeout: 2000 }).catch(() => undefined);
  }
  if ((await page.getByTestId('settings-panel').count()) > 0) {
    await page
      .getByTestId('settings-toggle')
      .click({ timeout: 2000 })
      .catch(() => undefined);
  }
}

/** Dusk, forced: clear whatever is on top first, then roll the day. Used by the
 *  per-day action budget, so an open pane can never eat a whole run. */
const FORCE_DUSK: Move = {
  label: 'end-day',
  available: () => true,
  prepare: async (page, rnd) => {
    await closeOverlays(page);
    return enabledLocator(page, 'end-day', rnd);
  },
};

/**
 * The modal resolver — run BEFORE any cockpit move, in this order. Each returns
 * a `Move` so it goes through the same step machinery (trial, click, snapshot,
 * full invariant battery) as ordinary play: a screen the driver has to clear is
 * still a screen the player clicks.
 */
function modalMove(snap: CockpitSnapshot): Move | null {
  const has = (testid: string): boolean => presentCount(snap, testid) > 0;

  // T-200 · The Guild's opening marker stands in FRONT of the walkthrough on the
  // birth of every career (including the one `ending-return` starts), so it is
  // resolved FIRST — otherwise the driver would spend its budget clicking through
  // a full-bleed overlay that intercepts every pointer event.
  if (has('opening-marker')) return simpleMove('opening-marker-dismiss', 'opening-marker-dismiss');
  if (has('walkthrough')) return simpleMove('walkthrough-skip', 'walkthrough-skip');
  if (has('onboarding')) return simpleMove('onboarding-dismiss', 'onboarding-dismiss');
  if (has('recovery-notice')) return simpleMove('recovery-dismiss', 'recovery-dismiss');
  if (has('ending-screen')) return simpleMove('ending-return', 'ending-return');
  if (has('succession-notice')) return simpleMove('succession-ack', 'succession-ack');
  if (has('resolution-ceremony')) {
    return {
      label: 'resolution-choice',
      available: () => true,
      prepare: async (page, rnd) => {
        if (has('resolution-choice-lock')) await ensureArmed(page, rnd);
        return enabledLocator(page, 'resolution-choice-btn', rnd);
      },
    };
  }
  if (has('combat-aftermath') || enabledCount(snap, 'combat-dismiss') > 0) {
    return simpleMove('combat-dismiss', 'combat-dismiss');
  }
  if (has('combat-overlay')) {
    return {
      label: 'combat-stance',
      available: () => true,
      prepare: async (page, rnd) => {
        const die = await firstOf(page, '[data-testid="combat-die"][data-spent="0"]', rnd);
        if (die === null) return enabledLocator(page, 'combat-stand-down', rnd);
        await die.click({ timeout: 2000 }).catch(() => undefined);
        const stances = ['combat-run', 'combat-talk', 'combat-fight', 'combat-stand-down'];
        const live: string[] = [];
        for (const stance of stances) {
          if ((await enabledLocator(page, stance, () => 0)) !== null) live.push(stance);
        }
        if (live.length === 0) return null;
        return enabledLocator(page, pick(rnd, live), rnd);
      },
    };
  }
  if (has('dare-reveal')) return simpleMove('dare-leave', 'dare-leave');
  if (has('dare-scene')) {
    return {
      // A hand of Liar's Dice FORCES the Hangout pane open and the engine blocks
      // every other verb behind `active-dare-hand`, so it must be resolved
      // before play resumes. CHALLENGE is legal against any standing bid at zero
      // cost, so it always terminates the hand — preferred over a random move
      // whenever it is offered, which bounds the hand rather than hoping.
      label: 'dare-move',
      available: () => true,
      prepare: async (page, rnd) => {
        const terminating = page.locator(
          '[data-testid="dare-move"][data-move="challenge"], [data-testid="dare-move"][data-move="fold"]',
        );
        if ((await terminating.count()) > 0) return terminating.first();
        return enabledLocator(page, 'dare-move', rnd);
      },
    };
  }
  return null;
}

// ---- the run report -------------------------------------------------------

export interface DayLog {
  day: number;
  actions: string[];
}

export interface HittabilityFailure {
  day: number;
  testid: string;
  detail: string;
}

export interface LonghaulRun {
  spec: 'T-162 long-haul DOM invariant sweep';
  gameSeed: number;
  choiceSeed: number;
  targetDays: number;
  daysReached: number;
  steps: number;
  /** `steps × INVARIANTS_PER_STEP` — the battery really ran on every step. */
  checksRun: number;
  stepsWithCandidates: number;
  skippedSteps: number;
  verbCounts: Record<string, number>;
  distinctVerbs: number;
  dailyTrialSweeps: number;
  /** Days whose sweep was skipped because a blocking surface (an encounter, the
   *  ceremony, a succession, a live dare) legitimately owned the pointer —
   *  counted, never silently dropped, so the arithmetic still closes. */
  trialSweepsSkipped: number;
  trialSweepControls: number;
  hittabilityFailures: HittabilityFailure[];
  idleDigestChecks: number;
  idleDigestUnstable: number;
  /** How each disabled control justified itself, summed over the run — so the
   *  artifact shows how much weight the weakest reason source carries. */
  reasonSources: Record<string, number>;
  invariants: { name: string; claim: string }[];
  violations: Violation[];
  days: DayLog[];
  aborted: string | null;
  wallClockMs: number;
}

export interface LonghaulOptions {
  gameSeed: number;
  /** Defaults to `gameSeed * 7919 + 13` so one env var pins both streams. */
  choiceSeed?: number;
  targetDays: number;
  /** Force dusk after this many actions in one in-game day. */
  maxActionsPerDay?: number;
}

const DEFAULT_MAX_ACTIONS_PER_DAY = 25;

/**
 * Drive one randomized-but-legal career through the real DOM for `targetDays`
 * in-game days, holding the whole invariant battery after every single action.
 */
export async function runLongHaul(page: Page, opts: LonghaulOptions): Promise<LonghaulRun> {
  const started = Date.now();
  const choiceSeed = opts.choiceSeed ?? opts.gameSeed * 7919 + 13;
  const maxActionsPerDay = opts.maxActionsPerDay ?? DEFAULT_MAX_ACTIONS_PER_DAY;
  const rnd = mulberry32(choiceSeed);

  const run: LonghaulRun = {
    spec: 'T-162 long-haul DOM invariant sweep',
    gameSeed: opts.gameSeed,
    choiceSeed,
    targetDays: opts.targetDays,
    daysReached: 1,
    steps: 0,
    checksRun: 0,
    stepsWithCandidates: 0,
    skippedSteps: 0,
    verbCounts: {},
    distinctVerbs: 0,
    dailyTrialSweeps: 0,
    trialSweepsSkipped: 0,
    trialSweepControls: 0,
    hittabilityFailures: [],
    idleDigestChecks: 0,
    idleDigestUnstable: 0,
    reasonSources: {},
    invariants: LONGHAUL_INVARIANTS.map((i) => ({ name: i.name, claim: i.claim })),
    violations: [],
    days: [],
    aborted: null,
    wallClockMs: 0,
  };

  // ---- listeners, installed BEFORE the first navigation -------------------
  let consoleErrors: string[] = [];
  let pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 400));
  });
  page.on('crash', () => pageErrors.push('the page process CRASHED'));

  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(opts.gameSeed));
  await page.getByRole('button', { name: 'Roll' }).click();
  // T-200 · Sign the Guild marker this new career opened under. `newGame` arms
  // it unconditionally (every career has its own), so this is the click a player
  // makes too; it calls no engine action, so the pinned RNG stream is unmoved.
  await signOpeningMarker(page);
  await expect(page.getByTestId('hand')).toBeVisible();
  await expect(page.getByTestId('day')).toHaveText('1');

  let snap = await snapshot(page);
  let currentDay = snap.day ?? 1;
  let dayLog: DayLog = { day: currentDay, actions: [] };
  let actionsThisDay = 0;
  let forcedDusks = 0;
  let consecutiveSkips = 0;
  let lastSkipped: string | null = null;

  snap = await dailyChecks(page, run, snap, currentDay);

  // `dayLog.actions.length === 0` keeps the loop running through the FINAL day:
  // arriving at day 30 with nothing played there is 29 days of play, and the
  // Accept criterion asks for thirty days DRIVEN. It also makes the per-day
  // "recorded no dispatched action" guard below a real check rather than a
  // guaranteed failure on the trailing day.
  while (
    (run.daysReached < opts.targetDays || dayLog.actions.length === 0) &&
    run.aborted === null
  ) {
    // A crash screen is terminal: the run stops and the artifact is still
    // written (the caller's `finally`), because that artifact IS the finding.
    if (presentCount(snap, 'crash-screen') > 0) {
      run.aborted = 'crash-screen mounted — the client threw and the boundary caught it';
      break;
    }

    const forceDusk = actionsThisDay >= maxActionsPerDay;
    const modal = modalMove(snap);
    let move: Move | null = modal;
    if (move === null) {
      const scoped = scopedMoves(snap).filter((m) => m.available(snap));
      // Never re-pick the move that just proved untakeable: one miss is enough
      // evidence for this step, and re-picking it burns the budget.
      const candidates = scoped.filter((m) => m.label !== lastSkipped);
      if (scoped.length > 0) run.stepsWithCandidates += 1;
      const pool = candidates.length > 0 ? candidates : scoped;
      move = forceDusk ? FORCE_DUSK : pool.length > 0 ? pick(rnd, pool) : FORCE_DUSK;
    } else {
      run.stepsWithCandidates += 1;
    }
    if (move === null) {
      run.aborted = 'no move was available at all — the cockpit offered nothing';
      break;
    }

    const outcome = await dispatch(page, run, move, rnd, snap, () => {
      const errs = { consoleErrors: [...consoleErrors], pageErrors: [...pageErrors] };
      consoleErrors = [];
      pageErrors = [];
      return errs;
    });
    snap = outcome.after;
    dayLog.actions.push(outcome.skipped ? `${move.label} (not takeable)` : move.label);
    actionsThisDay += 1;
    consecutiveSkips = outcome.skipped ? consecutiveSkips + 1 : 0;
    lastSkipped = outcome.skipped ? move.label : null;
    if (consecutiveSkips >= 15) {
      run.aborted = `15 consecutive steps offered nothing takeable (last move: ${move.label}) — the cockpit is stuck`;
      break;
    }

    const day = snap.day ?? currentDay;
    if (day !== currentDay) {
      // Forward is dusk; backward is a declared career restart (the ending
      // screen's own control boots a fresh day-1 game). BOTH are a new in-game
      // day the driver has to live through, so both count once and both get the
      // day's checks — the counter is days EXPERIENCED, not the day number.
      run.days.push(dayLog);
      run.daysReached += 1;
      currentDay = day;
      dayLog = { day: currentDay, actions: [] };
      actionsThisDay = 0;
      forcedDusks = 0;
      snap = await dailyChecks(page, run, snap, currentDay);
    } else if (forceDusk) {
      forcedDusks += 1;
      if (forcedDusks >= 4) {
        run.aborted = `the day would not advance: ${forcedDusks} forced end-day clicks on day ${currentDay}`;
        break;
      }
    }
  }
  run.days.push(dayLog);
  run.distinctVerbs = Object.keys(run.verbCounts).length;
  run.wallClockMs = Date.now() - started;
  return run;
}

interface StepOutcome {
  after: CockpitSnapshot;
  skipped: boolean;
}

/** One step: prepare, trial, click, settle, then the WHOLE battery. */
async function dispatch(
  page: Page,
  run: LonghaulRun,
  move: Move,
  rnd: () => number,
  current: CockpitSnapshot,
  drainErrors: () => { consoleErrors: string[]; pageErrors: string[] },
): Promise<StepOutcome> {
  const control = await move.prepare(page, rnd, current).catch(() => null);
  // The `before` read is taken AFTER preparation and immediately before the
  // terminal click, so an input fill or a pane open cannot be mistaken for the
  // click's own effect — that would make `inv_no_dead_affordance` vacuous.
  const before = await snapshot(page);

  let trialPassed = false;
  if (control !== null) {
    try {
      await control.click({ trial: true, timeout: 800 });
      trialPassed = true;
    } catch {
      // Reported as a hittability observation on the daily sweep, not here: a
      // single mid-render miss is not a finding, two in a row is.
      trialPassed = false;
    }
  }
  if (trialPassed && control !== null) {
    await control.click({ timeout: 3000 }).catch(() => {
      trialPassed = false;
    });
  }

  const after = trialPassed ? await settle(page, before.digest) : await snapshot(page);
  const { consoleErrors, pageErrors } = drainErrors();

  const ctx: StepContext = {
    step: run.steps + 1,
    actionLabel: move.label,
    trialPassed,
    careerRestart: move.label === 'ending-return',
    consoleErrors,
    pageErrors,
    before,
    after,
  };
  run.steps += 1;
  run.checksRun += INVARIANTS_PER_STEP;
  run.violations.push(...evaluateInvariants(ctx));
  if (trialPassed) run.verbCounts[move.label] = (run.verbCounts[move.label] ?? 0) + 1;
  else run.skippedSteps += 1;
  for (const c of after.disabledControls) {
    const key = c.reasonSource ?? 'none';
    run.reasonSources[key] = (run.reasonSources[key] ?? 0) + 1;
  }
  return { after, skipped: !trialPassed };
}

/**
 * Wait for the click to land. Polls the snapshot until the digest moves or the
 * budget runs out — which makes "did this control do anything?" a bounded
 * question rather than a fixed sleep. When nothing changes the step costs the
 * full budget, which is exactly the step worth spending it on.
 */
async function settle(page: Page, beforeDigest: string): Promise<CockpitSnapshot> {
  let snap = await snapshot(page);
  for (let i = 0; i < 10 && snap.digest === beforeDigest; i += 1) {
    await page.waitForTimeout(60);
    snap = await snapshot(page);
  }
  return snap;
}

/**
 * Once per in-game day: (1) trial-click every present-and-enabled control to
 * catch "enabled but not hittable" at scale — the `action-blocked-parity`
 * failure mode, generalized; (2) confirm the digest is STABLE with no input,
 * because a digest that drifts on its own would make `inv_no_dead_affordance`
 * vacuous and that must be visible in the artifact rather than assumed.
 */
async function dailyChecks(
  page: Page,
  run: LonghaulRun,
  current: CockpitSnapshot,
  day: number,
): Promise<CockpitSnapshot> {
  // A surface that legitimately OWNS the pointer makes a cockpit-wide sweep
  // meaningless — `action-blocked-parity.spec.ts` proves those very controls
  // must refuse a pointer during an encounter, so sweeping them here would
  // assert the opposite of a shipped rule. Skipped days are counted, never
  // dropped, so `dailyTrialSweeps + trialSweepsSkipped === daysReached` closes.
  const BLOCKING = [
    'combat-overlay',
    'resolution-ceremony',
    'succession-notice',
    'dare-scene',
    'ending-screen',
    'crash-screen',
  ];
  let snap = current;
  if (BLOCKING.some((testid) => presentCount(snap, testid) > 0)) {
    run.trialSweepsSkipped += 1;
    return idleDigestCheck(page, run);
  }

  // Sweep the COCKPIT, not a pane's backdrop: shut whatever the walk left open.
  await closeOverlays(page);
  snap = await snapshot(page);
  for (let i = 0; i < 12 && presentCount(snap, 'onboarding') > 0; i += 1) {
    await page
      .getByTestId('onboarding-dismiss')
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
    snap = await snapshot(page);
  }
  snap = await snapshot(page);

  run.dailyTrialSweeps += 1;
  for (const testid of CONTROLS) {
    if (enabledCount(snap, testid) === 0) continue;
    if (testid === 'starmap-system') continue; // an SVG `<g>`, not a button
    // One element per testid keeps the sweep affordable (a 14-node starmap would
    // otherwise dominate it) while still covering every KIND of control.
    const control = page.locator(`[data-testid="${testid}"]:not([disabled])`).first();
    run.trialSweepControls += 1;
    try {
      await control.click({ trial: true, timeout: 700 });
    } catch (first) {
      // Re-check once after a settle: a single miss mid-render is timing, two
      // in a row is a control the cockpit says is live and a pointer cannot use.
      await page.waitForTimeout(120);
      try {
        await control.click({ trial: true, timeout: 700 });
      } catch {
        run.hittabilityFailures.push({
          day,
          testid,
          detail: first instanceof Error ? first.message.slice(0, 200) : String(first),
        });
      }
    }
  }

  return idleDigestCheck(page, run);
}

/** Two reads, no input between them. A digest that drifts on its own would make
 *  `inv_no_dead_affordance` vacuous, so the artifact records it rather than the
 *  reader having to assume it. Returns the second read, which the caller reuses. */
async function idleDigestCheck(page: Page, run: LonghaulRun): Promise<CockpitSnapshot> {
  run.idleDigestChecks += 1;
  const a = await snapshot(page);
  await page.waitForTimeout(150);
  const b = await snapshot(page);
  if (a.digest !== b.digest) run.idleDigestUnstable += 1;
  return b;
}

// ---- the artifact ---------------------------------------------------------

/**
 * Emit the run report three ways (attached, in Playwright's `outputDir`, and at
 * a stable path CI uploads), then assert it is NON-DEGENERATE before it is
 * allowed to count as evidence. Written from a `finally` in the spec, so a red
 * run still leaves the artifact that explains it.
 */
export async function emitLonghaulReport(testInfo: TestInfo, run: LonghaulRun): Promise<void> {
  const json = JSON.stringify(run, null, 2);
  await testInfo.attach(`longhaul-seed-${run.gameSeed}.json`, {
    body: json,
    contentType: 'application/json',
  });
  writeFileSync(testInfo.outputPath('longhaul.json'), json, 'utf8');
  const dir = join(dirname(testInfo.project.testDir), 'test-results', 'longhaul');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `seed-${run.gameSeed}.json`), json, 'utf8');
  writeFileSync(join(dir, `seed-${run.gameSeed}.md`), renderMarkdown(run), 'utf8');
}

/** The non-vacuity guards. A hollow pass is a failure in this repo. */
export function assertNonDegenerate(run: LonghaulRun): void {
  expect(run.aborted, 'the run aborted before it could be evidence').toBeNull();
  expect(
    run.daysReached,
    'the run must reach at least its target in-game days',
  ).toBeGreaterThanOrEqual(run.targetDays);
  expect(
    run.distinctVerbs,
    `a run that only clicked end-day is not a DOM sweep (verbs: ${JSON.stringify(run.verbCounts)})`,
  ).toBeGreaterThanOrEqual(8);
  expect(run.checksRun, 'the battery must have run on every step').toBe(
    run.steps * INVARIANTS_PER_STEP,
  );
  expect(
    run.stepsWithCandidates / Math.max(1, run.steps),
    'the cockpit must have been live (offering moves) on nearly every step',
  ).toBeGreaterThanOrEqual(0.9);
  expect(
    run.dailyTrialSweeps + run.trialSweepsSkipped,
    'every in-game day must be accounted for by a sweep or a recorded skip',
  ).toBe(run.daysReached);
  expect(
    run.dailyTrialSweeps,
    'most days must actually get the hittability sweep, not be skipped past',
  ).toBeGreaterThanOrEqual(Math.floor(run.targetDays / 2));
  expect(run.trialSweepControls, 'the daily sweep must have probed real controls').toBeGreaterThan(
    run.dailyTrialSweeps * 3,
  );
  expect(
    run.idleDigestUnstable,
    'the digest drifted with no input — inv_no_dead_affordance would be vacuous',
  ).toBe(0);
  expect(
    run.hittabilityFailures,
    'a control the cockpit says is live must accept a pointer',
  ).toEqual([]);
  expect(run.days.length, 'the per-day action log must be filled in').toBeGreaterThan(0);
  for (const day of run.days) {
    expect(day.actions.length, `day ${day.day} recorded no dispatched action`).toBeGreaterThan(0);
  }
}

function renderMarkdown(run: LonghaulRun): string {
  const lines: string[] = [];
  lines.push(`# T-162 · long-haul DOM invariant sweep — game seed ${run.gameSeed}`);
  lines.push('');
  lines.push(`- game seed: \`${run.gameSeed}\` · choice seed: \`${run.choiceSeed}\``);
  lines.push(`- in-game days: **${run.daysReached}** (target ${run.targetDays})`);
  lines.push(`- steps dispatched: ${run.steps} (${run.skippedSteps} not takeable)`);
  lines.push(`- invariant checks run: ${run.checksRun}`);
  lines.push(`- distinct verbs: ${run.distinctVerbs}`);
  lines.push(
    `- daily trial sweeps: ${run.dailyTrialSweeps} over ${run.trialSweepControls} controls ` +
      `(${run.trialSweepsSkipped} days skipped behind a blocking surface) · ` +
      `hittability failures: ${run.hittabilityFailures.length}`,
  );
  lines.push(`- idle digest checks: ${run.idleDigestChecks} · unstable: ${run.idleDigestUnstable}`);
  lines.push(`- wall clock: ${(run.wallClockMs / 1000).toFixed(1)}s`);
  lines.push(`- aborted: ${run.aborted ?? 'no'}`);
  lines.push('');
  lines.push('## Invariants held');
  lines.push('');
  for (const i of run.invariants) lines.push(`- \`${i.name}\` — ${i.claim}`);
  lines.push('');
  lines.push(`## Violations (${run.violations.length})`);
  lines.push('');
  if (run.violations.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Step | Day | Invariant | Action | Detail |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const v of run.violations) {
      lines.push(
        `| ${v.step} | ${v.day ?? '—'} | \`${v.invariant}\` | ${v.actionLabel} | ${v.detail} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Verbs dispatched');
  lines.push('');
  for (const [verb, count] of Object.entries(run.verbCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${verb}: ${count}`);
  }
  lines.push('');
  lines.push('## Disabled-control reason sources');
  lines.push('');
  for (const [source, count] of Object.entries(run.reasonSources).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${source}: ${count}`);
  }
  lines.push('');
  lines.push('## Day log');
  lines.push('');
  for (const day of run.days) lines.push(`- day ${day.day}: ${day.actions.join(', ')}`);
  lines.push('');
  return lines.join('\n');
}

/** Re-exported so the spec's `beforeEach` reads as one import. */
export { skipFirstTurnWalkthrough };
