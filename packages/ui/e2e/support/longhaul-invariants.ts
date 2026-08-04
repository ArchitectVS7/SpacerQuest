// ---------------------------------------------------------------------------
// T-162 · The long-haul invariant battery — the PURE half.
//
// WHAT THIS IS. `docs/TESTING-STRATEGY.md`'s bridge-blind-spot warning names one
// failure class no tier of this repo owned: the *unanticipated* client-side
// crash deep into a career. A scripted spec asserts only what it was written to
// see, so it cannot catch a bug nobody thought of; a protocol-level pilot
// (Tier 2, `packages/sim/src/pilot.ts`) never loads the client at all. The
// counterpart is a BLANKET check — a small set of claims that must hold after
// EVERY action, whatever the action was — held over randomized-but-legal play
// through the real DOM for ≥30 in-game days.
//
// WHY THIS FILE IMPORTS NOTHING. There is no `@playwright/test` import and no
// `page` here on purpose: the battery is a pure function of a snapshot pair plus
// the step's console/pageerror tape, so it can be proven against seeded-bad
// fixtures in `e2e/long-haul-invariants.spec.ts` WITHOUT launching a browser.
// That is the same discipline T-153 used on the sweep gate — a mechanism that
// claims to catch regressions has to be shown catching one.
//
// THE DISCIPLINE EVERY CHECK FOLLOWS (`gate.ts`'s): a check emits violations
// carrying its OWN name, so a violation is always traceable to the claim it
// broke, and `evaluateInvariants` is a map over `LONGHAUL_INVARIANTS` rather
// than a hand-written sequence of `if`s — a ninth entry added to the array is
// wired by construction, and the totality guard in the spec proves it.
// ---------------------------------------------------------------------------

/** The eight named claims. The doc quotes this union; keep the two in step. */
export type InvariantName =
  | 'inv_no_uncaught_exception'
  | 'inv_no_console_error'
  | 'inv_no_crash_screen'
  | 'inv_cockpit_reachable'
  | 'inv_no_dead_affordance'
  | 'inv_blocked_shows_reason'
  | 'inv_no_placeholder_text'
  | 'inv_day_monotonic';

/** One disabled (or `aria-disabled`) probe control and the reason it exposes.
 *  `reason` is null when the control offered NO reason surface at all — no
 *  `title`, no `data-reason`, no `aria-describedby` target, no sibling
 *  `*-reason` node and no text of its own. */
export interface DisabledControl {
  testid: string;
  /** Index among same-testid elements, so a violation names WHICH row. */
  index: number;
  reason: string | null;
  /** Where the reason came from — reported so a reviewer can weigh it. */
  reasonSource: 'title' | 'data-reason' | 'aria-describedby' | 'sibling-reason' | 'own-text' | null;
}

/** A rendered token that should never reach a player's eyes. */
export interface SuspiciousText {
  /** The nearest enclosing `data-testid`, or `<screen>` when there is none. */
  where: string;
  token: string;
  snippet: string;
}

/** One `page.evaluate()` worth of DOM facts. Everything the battery reads. */
export interface CockpitSnapshot {
  day: number | null;
  credits: number | null;
  /** The depot's `N/M` hold readout, verbatim. */
  fuel: string | null;
  dockedAt: string | null;
  /** The bezel's Guild-marker chip, verbatim; null once cleared. */
  debt: string | null;
  spentDice: number;
  totalDice: number;
  /** testid -> how many are mounted. */
  present: Record<string, number>;
  /** testid -> how many are mounted, hittable and NOT disabled. */
  enabled: Record<string, number>;
  /** The screen that has REPLACED the cockpit, or null when the cockpit is up.
   *  Only three screens do this (`App.tsx`'s early returns + the error
   *  boundary); overlays like combat or the ceremony leave the cockpit mounted,
   *  which is why they are deliberately NOT listed here. */
  modalOwner: string | null;
  disabledControls: DisabledControl[];
  suspiciousText: SuspiciousText[];
  /** A stable hash over every `data-testid` element's text and state attributes
   *  — the "did anything player-visible move?" fingerprint. */
  digest: string;
  noticeText: string | null;
}

/** Everything one dispatched step hands the battery. */
export interface StepContext {
  step: number;
  /** The move the driver chose, e.g. `end-day` or `jump`. */
  actionLabel: string;
  /** True when the control passed `click({ trial: true })` and was then really
   *  clicked — i.e. the step is eligible for the dead-affordance claim. A step
   *  that only READ the cockpit sets this false. */
  trialPassed: boolean;
  /** True when the step deliberately restarted the career (the ending screen's
   *  own `ending-return` control boots a fresh day-1 game). The day counter
   *  legitimately resets here, so `inv_day_monotonic` stands down — declared by
   *  the driver, never inferred, so it can never be used to hide a real reset. */
  careerRestart: boolean;
  consoleErrors: readonly string[];
  pageErrors: readonly string[];
  before: CockpitSnapshot;
  after: CockpitSnapshot;
}

export interface Violation {
  invariant: InvariantName;
  step: number;
  actionLabel: string;
  /** The day the cockpit read AFTER the step, for the report's day column. */
  day: number | null;
  detail: string;
}

interface Invariant {
  name: InvariantName;
  /** The claim, in one sentence. Rendered into the run report. */
  claim: string;
  check: (ctx: StepContext) => string[];
}

function preview(values: readonly string[], limit = 3): string {
  const head = values.slice(0, limit).join(' | ');
  return values.length > limit ? `${head} (+${values.length - limit} more)` : head;
}

/**
 * THE NAMED SET. `docs/playtests/T-162-dom-longhaul.md` §2 and
 * `docs/TESTING-STRATEGY.md`'s "Tier 3, as built" block quote these names; the
 * doc and the code must agree, which is why the claims live here and are
 * rendered into the artifact rather than re-typed by hand.
 */
export const LONGHAUL_INVARIANTS: readonly Invariant[] = [
  {
    name: 'inv_no_uncaught_exception',
    claim: 'no uncaught exception reached the page during the step',
    check: (ctx) =>
      ctx.pageErrors.length === 0
        ? []
        : [`${ctx.pageErrors.length} uncaught page error(s): ${preview(ctx.pageErrors)}`],
  },
  {
    name: 'inv_no_console_error',
    claim:
      'the step logged no console error (no allowlist — real noise is a finding, not a filter)',
    check: (ctx) =>
      ctx.consoleErrors.length === 0
        ? []
        : [`${ctx.consoleErrors.length} console error(s): ${preview(ctx.consoleErrors)}`],
  },
  {
    name: 'inv_no_crash_screen',
    claim: "the ErrorBoundary's crash screen never mounts",
    check: (ctx) =>
      (ctx.after.present['crash-screen'] ?? 0) === 0
        ? []
        : ['crash-screen is mounted — the React tree threw and the boundary caught it'],
  },
  {
    name: 'inv_cockpit_reachable',
    claim:
      'the cockpit stays takeable (end-day + hand mounted) unless a declared screen replaces it',
    check: (ctx) => {
      if (ctx.after.modalOwner !== null) return [];
      const missing: string[] = [];
      if ((ctx.after.present['end-day'] ?? 0) === 0) missing.push('end-day');
      if ((ctx.after.present.hand ?? 0) === 0) missing.push('hand');
      return missing.length === 0
        ? []
        : [`the cockpit lost ${missing.join(' + ')} with no screen owning the view — a soft-lock`];
    },
  },
  {
    name: 'inv_no_dead_affordance',
    claim: 'a control that passed the actionability trial and was clicked moved the cockpit',
    check: (ctx) => {
      if (!ctx.trialPassed) return [];
      if (ctx.after.digest !== ctx.before.digest) return [];
      return [
        `clicking "${ctx.actionLabel}" changed nothing player-visible (digest ${ctx.before.digest} ` +
          `unchanged; notice before=${JSON.stringify(ctx.before.noticeText)} ` +
          `after=${JSON.stringify(ctx.after.noticeText)}; dice ${ctx.before.spentDice}/` +
          `${ctx.before.totalDice} -> ${ctx.after.spentDice}/${ctx.after.totalDice}) — a dead click`,
      ];
    },
  },
  {
    name: 'inv_blocked_shows_reason',
    claim: 'every disabled control exposes a non-empty reason a player can read',
    check: (ctx) => {
      const silent = ctx.after.disabledControls.filter(
        (c) => c.reason === null || c.reason.trim() === '',
      );
      return silent.length === 0
        ? []
        : [
            `${silent.length} disabled control(s) offer no reason: ` +
              preview(silent.map((c) => `${c.testid}[${c.index}]`)),
          ];
    },
  },
  {
    name: 'inv_no_placeholder_text',
    claim: 'no NaN / undefined / [object Object] / Infinity is rendered to the player',
    check: (ctx) =>
      ctx.after.suspiciousText.length === 0
        ? []
        : [
            `${ctx.after.suspiciousText.length} placeholder token(s) on screen: ` +
              preview(
                ctx.after.suspiciousText.map((s) => `${s.token} in ${s.where}: "${s.snippet}"`),
              ),
          ],
  },
  {
    name: 'inv_day_monotonic',
    claim: 'the day never goes backwards and never advances by more than one per step',
    check: (ctx) => {
      if (ctx.careerRestart) return [];
      const { day: before } = ctx.before;
      const { day: after } = ctx.after;
      if (before === null || after === null) return [];
      if (after < before) return [`the day went backwards: ${before} -> ${after}`];
      if (after - before > 1)
        return [`the day jumped ${after - before} days: ${before} -> ${after}`];
      return [];
    },
  },
];

/**
 * Run the whole battery on one step. Every entry in `LONGHAUL_INVARIANTS` is
 * evaluated — the map is the wiring, so nothing can be added to the array and
 * silently never run (the spec's totality guard pins that).
 */
export function evaluateInvariants(ctx: StepContext): Violation[] {
  const out: Violation[] = [];
  for (const invariant of LONGHAUL_INVARIANTS) {
    for (const detail of invariant.check(ctx)) {
      out.push({
        invariant: invariant.name,
        step: ctx.step,
        actionLabel: ctx.actionLabel,
        day: ctx.after.day,
        detail,
      });
    }
  }
  return out;
}

/** How many claims one step costs — the report's `checksRun` arithmetic. */
export const INVARIANTS_PER_STEP = LONGHAUL_INVARIANTS.length;
