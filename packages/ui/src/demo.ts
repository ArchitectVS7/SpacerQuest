// ============================================================================
//  T-1703 · Demo build gate (Tour One) — the pure predicate layer
// ============================================================================
//
// ARCHITECTURE: the demo boundary is a BUILD/PACKAGING concern, NOT a simulation
// rule, so it lives ENTIRELY in this UI/config layer — the pure engine
// (`packages/engine`) and content (`packages/content`) are NOT touched. Rationale
// (Standing constraint 1 + the engine's "no I/O / no env" purity): the engine must
// stay unaware of demo-vs-full. A day-33 demo career is a clean, full-game-loadable
// `GameState`; nothing about "this is a demo" is ever written into engine state, so
// there is NO new GameState field, NO save migration, and a demo `.sav` continues
// verbatim in the full build (which sets `DEMO_BUILD = false`, lifting every gate).
//
// The gate is expressed here as PURE, headlessly-unit-tested predicates (demo.test.ts)
// so the "reachable headlessly" obligation (Standing constraint 2) is honest — the
// rule is a tested function, not logic buried in JSX. The store and App consume these
// as thin CLIENTS (Standing constraint 2: UI never OWNS a rule). Every predicate takes
// `demoBuild` as an explicit parameter so a test drives it with no env/browser; the
// live readers call the no-arg default, which reads the baked-in `DEMO_BUILD`.

/**
 * The build flag. Vite statically replaces `import.meta.env.VITE_SQ_DEMO` at build
 * time, so in the FULL/web build this is a compile-time `false` and every demo branch
 * downstream is dead code (the web bundle is unaffected — the T-1702 "web build
 * byte-for-byte unchanged" ethos). Set to `'1'` only by `vite build --mode demo`,
 * which loads `.env.demo` (T-1705: a mode file, not inline `VAR=1` script syntax,
 * because npm runs scripts through cmd.exe on Windows where that does not parse).
 * READERS: `store.endDay` (the day-33 wall), `App.tsx` (the three feature teasers +
 * the DemoWall ceremony), and the defense-in-depth store guards on the gated verbs.
 */
export const DEMO_BUILD: boolean = import.meta.env.VITE_SQ_DEMO === '1';

/**
 * The last day the demo is playable. Tour One runs days 1–30 (the resolution ceremony
 * fires at dawn of day 31 off dusk of day 30); the demo grants 3 post-resolution days
 * (T-1703), so day 33 is the final playable day and ending it hits the wall.
 *
 * DIVERGENCE NOTE (Standing constraint 5 — PRD wins, comment at the definition site):
 * the "3 post-resolution days" budget is a T-1703 demo-packaging decision layered on
 * top of the PRD's 30-day Tour One; the full game has no such cap (DEMO_BUILD gates it).
 */
export const DEMO_FINAL_DAY = 33;

/**
 * Would being on `day` be past the demo's playable budget? True only in the demo build
 * and only strictly beyond `DEMO_FINAL_DAY`. `store.endDay` calls this with the
 * PROSPECTIVE next day (`currentDay + 1`) BEFORE advancing the engine, so the demo can
 * never reach day 34: days 30 (resolution) and 31–33 (the three teased post-resolution
 * days) remain playable; ending day 33 is refused and raises the DemoWall instead.
 * READER: `store.endDay` (the wall guard) + `App.DemoWall` (renders on the raised flag).
 */
export function demoWallReached(day: number, demoBuild = DEMO_BUILD): boolean {
  return demoBuild && day > DEMO_FINAL_DAY;
}

/** The three veteran systems the demo teases-but-gates (the T-1703 gate list). */
export type DemoGatedFeature = 'ports' | 'hangout-progression' | 'conqueror';

/**
 * Is a veteran feature locked in this build? All three are locked in the demo and
 * open in the full game — a single boolean, but expressed per-feature so each reader
 * names the exact surface it gates (Standing constraint 7) and so a future build could
 * unlock them independently without touching the call sites.
 * READERS: `App.tsx` — `ports` gates the Port Authority buy button; `hangout-progression`
 * gates crew hiring + Penny Wise borrowing (the dawn-hand dice progression); `conqueror`
 * gates the Conqueror capstone rung in the Registry of Deeds.
 */
export function demoFeatureLocked(_feature: DemoGatedFeature, demoBuild = DEMO_BUILD): boolean {
  return demoBuild;
}

/**
 * Teaser copy for each gated surface — DATA, not logic (Standing constraint 4 in
 * spirit: strings live apart from the components that render them, so the gate's
 * player-facing wording is auditable in one place and never inlined into JSX).
 */
export const DEMO_LOCK_COPY: Record<DemoGatedFeature, { badge: string; body: string }> = {
  ports: {
    badge: 'FULL GAME',
    body: 'Buying port authority — collect launch-fee income across the rim — is a veteran feature, unlocked in the full game.',
  },
  'hangout-progression': {
    badge: 'FULL GAME',
    body: 'Hiring crew and borrowing at Penny Wise’s desk — the dawn-hand dice progression — unlocks in the full game.',
  },
  conqueror: {
    badge: 'FULL GAME',
    body: 'The Conqueror capstone rank — thirty deeds and the Nemesis crossing beyond — awaits in the full game.',
  },
};

/**
 * The DemoWall ceremony copy — the un-dismissable "demo complete" certificate raised
 * when the player ends the final demo day. It advertises the gated veteran arcs and
 * offers ONLY external wishlist/buy CTAs — no control that reaches veteran content —
 * so ending day 33 is a true terminus. READER: `App.DemoWall`.
 */
export const DEMO_WALL_COPY = {
  kicker: 'DEMO COMPLETE',
  title: 'End of the Tour One demo',
  lede: 'You flew the whole of Tour One and three days past its resolution. The full career — and everything the rim keeps behind the Guild marker — opens in the full game.',
  unlocksHead: 'The full game unlocks',
  unlocks: [
    'Ports & property — buy authority and draw launch-fee income across the rim.',
    'Crew & lending — the dawn-hand dice progression at the Hangout.',
    'The Conqueror capstone — thirty deeds, the alliance arcs, and the Nemesis Signal crossing.',
  ],
  carry: 'This demo save carries into the full game — pick up exactly where you left off.',
  cta: 'Wishlist Spacer Quest: Rimward',
} as const;
