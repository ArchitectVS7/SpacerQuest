// ---------------------------------------------------------------------------
// T-252 · THE THREE MOTION TIERS.
//
// `tabletop-ui` §8 (owner correction, 2026-07-18) is a standing rule: animation
// intensity is a PLAYER MENU OPTION with three tiers — Cinematic (default, full
// scene moments), Snappy (~0.4x durations, scene staging trimmed) and Instant
// (the synchronous rail; sound still plays). Verbatim: "Never ship
// cinematic-only." Until this task SpacerQuest shipped a BINARY (a
// `reducedMotion` boolean OR'd with the OS media query), which is exactly the
// divergence `docs/design/T-201-dawn-hand-roll.md` §3.6 named as Q4.
//
// THE ONE KNOB. §8 also fixes the implementation shape: "Presets read a global
// speed/intensity setting rather than hard-coding durations, so the tiers are one
// knob, not three implementations." That knob is {@link MOTION_SCALE}. In CSS it
// is the `--motion-scale` custom property and every BEAT duration is
// `calc(<cinematic-ms> * var(--motion-scale))`; in JS it is {@link scaleMs} and
// the GSAP `timeScale(1 / MOTION_SCALE[tier])` at the Liar's Dice reveal. There
// is no second knob and no per-beat tier table — adding one would re-create the
// three-implementations shape the rule forbids.
//
// WHAT SCALES AND WHAT DOES NOT (the classification is enforced mechanically by
// `src/__tests__/motion-tiers.test.ts`, not by inspection):
//
//   * BEAT    — finite, event-triggered, dramatises a game event. SCALES.
//               (`sweep`, `comp-focus`, `mb-post`, `tp-*`, `cb-*`, `bloom`,
//               `ob-fade*`, `ld-settle`, the `.d6` face turn, `om-*`.)
//   * AMBIENT — `infinite` loops (`flicker`, `ring-pulse`, `pulse`, `tick`,
//               `wt-pulse`). Does NOT scale: speeding up ambience is a bug, not
//               a tier — §8's "durations ... scene staging trimmed" is about
//               beats. Killed outright at Instant.
//   * RESPONSE — sub-250ms hover/state transitions. Does NOT scale: that is UI
//               responsiveness, not cinema. Killed outright at Instant.
//
// WHY INSTANT IS `0` AND NOT A KILL-SWITCH ALONE. `animation-duration: 0s` with
// `forwards`/`both` still applies the END STATE, so a zeroed beat is
// instant-AND-correct rather than "animated then skipped" (UI-23). The blanket
// `:root[data-motion='instant'] *` kill-switch in `theme.css` remains, because it
// is what reaches the AMBIENT and RESPONSE declarations that deliberately keep
// their literals.
//
// NO SAVE-SHAPE CHANGE. The tier is a `KeyValueStore` local preference
// (`sq.motion-tier`), never part of the save envelope, exactly like `sq.fx` and
// `sq.text-size`. `CURRENT_SAVE_VERSION` does not move and no migration is owed.
// ---------------------------------------------------------------------------

/** The player-facing animation intensity, `tabletop-ui` §8's three tiers. */
export type MotionTier = 'cinematic' | 'snappy' | 'instant';

/** Menu order, and the only place the tier vocabulary is enumerated. */
export const MOTION_TIERS: readonly MotionTier[] = ['cinematic', 'snappy', 'instant'] as const;

/**
 * THE KNOB. Multiplier applied to every BEAT duration and delay, in CSS via
 * `--motion-scale` and in JS via {@link scaleMs}. `0.4` is §8's own figure
 * ("Snappy (~0.4x durations)"); `0` is the synchronous rail.
 */
export const MOTION_SCALE: Record<MotionTier, number> = {
  cinematic: 1,
  snappy: 0.4,
  instant: 0,
};

/** Human labels for the Settings segmented control. */
export const MOTION_TIER_LABELS: Record<MotionTier, string> = {
  cinematic: 'Cinematic',
  snappy: 'Snappy',
  instant: 'Instant',
};

/** Narrowing guard, used by the store's total reader and by the tests. */
export function isMotionTier(v: unknown): v is MotionTier {
  return v === 'cinematic' || v === 'snappy' || v === 'instant';
}

/**
 * THE OS-QUERY MAPPING. `prefers-reduced-motion: reduce` FORCES Instant whatever
 * the setting says — WCAG 2.3.3 (Animation from Interactions) treats the OS
 * preference as an accessibility need, not a default to be overridden, and it
 * preserves the pre-T-252 `setting || media` semantics exactly (the old binary's
 * "reduced" is the new Instant). The setting only chooses among the tiers when
 * the OS has expressed no preference.
 */
export function resolveMotionTier(setting: MotionTier, osPrefersReduced: boolean): MotionTier {
  return osPrefersReduced ? 'instant' : setting;
}

/**
 * Scale a cinematic-authored duration in milliseconds to the active tier. Returns
 * `0` at Instant — callers on the Instant rail must take the SYNCHRONOUS branch
 * ({@link isInstant}) rather than schedule a 0ms timer, so the settled DOM is
 * final on the very render that produced it.
 */
export function scaleMs(ms: number, tier: MotionTier): number {
  return Math.round(ms * MOTION_SCALE[tier]);
}

/** The synchronous rail: no timeline is created, no interval is started. */
export function isInstant(tier: MotionTier): boolean {
  return tier === 'instant';
}

/**
 * THE LEGACY FALLBACK, as a pure rule rather than three `if`s inside a try/catch.
 *
 * Before T-252 the preference was a BINARY persisted at `sq.reduced-motion`
 * (`'on' | 'off'`). A player who had turned it on must boot into Instant — that
 * is exactly what "on" meant — and must never be silently promoted back to full
 * cinematic motion by a version upgrade. Three steps, in order:
 *
 *   1. the new key, if it names one of the three tiers — it always wins, so a
 *      stale legacy value can never contradict a deliberate later choice;
 *   2. else the legacy binary: `'on'` -> Instant;
 *   3. else Cinematic, `tabletop-ui` §8's default.
 *
 * Total over any input, including `null` and garbage — the callers in `store.ts`
 * run at module scope where a throw could not be caught by an error boundary.
 *
 * NB this is a LOCAL-PREFERENCE fallback, not a save migration: neither key is
 * in the save envelope, so `CURRENT_SAVE_VERSION` does not move.
 */
export function motionTierFromStorage(tierRaw: unknown, legacyRaw: unknown): MotionTier {
  if (isMotionTier(tierRaw)) return tierRaw;
  return legacyRaw === 'on' ? 'instant' : 'cinematic';
}
