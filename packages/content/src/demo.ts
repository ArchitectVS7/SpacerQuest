/**
 * ============================================================================
 *  T-1703 · THE DEMO CONFIGURATION — data only, no logic (standing constraint 4)
 * ============================================================================
 *
 * The demo is "Tour One + 3 post-resolution days, veteran features
 * teased-but-gated". This file owns the NUMBERS and the PROSE of that shape.
 * Every predicate that reads them lives in `packages/engine/src/demo.ts`; there
 * is not one `if` here, deliberately.
 *
 * ---------------------------------------------------------------------------
 *  THE READING OF THE GATE LIST, AND ITS EVIDENCE
 * ---------------------------------------------------------------------------
 * The task names three gated things: "Hangout progression, ports, and Conqueror
 * content". Two of those are unambiguous. The first is not, so the reading is
 * recorded here rather than left implicit — an undocumented reading of a gate is
 * a review failure.
 *
 * "HANGOUT PROGRESSION" MEANS THE CREW/DICE PROGRESSION BOUGHT AT THE HANGOUT,
 * NOT THE HANGOUT ITSELF. This is the repo's own vocabulary:
 *   - engine `types.ts` documents `PlayerAction.Crew` as "PRD §7 dice
 *     progression … at the Hangout/port";
 *   - sim `protocol.ts` calls crew "the dice-progression source";
 *   - `App.tsx` labels the crew grant "Crew-granted dawn-hand progression".
 * And gating the HANGOUT wholesale is ruled out on evidence, not taste:
 * `e2e/hangout.spec.ts` proves the launcher open at Sun-3 from day 1, the
 * `first-loan` onboarding coach fires INSIDE the open Hangout panel during Tour
 * One, and PRD §7.3/§7.5 set two Tour-One sample turns there (the Day-23
 * Spacer's Dare; the bad-day Penny Wise loan). A demo that shut the Hangout
 * would cut two authored Tour One beats out of Tour One.
 *
 * So in the demo: dare / meet / befriend / insult / rumor / borrow / repay all
 * stay OPEN. Crew HIRE is locked (dismiss stays legal — you may always let go of
 * crew you carried in from a promoted save).
 *
 * ---------------------------------------------------------------------------
 *  WHY ONLY THREE LOCKS FOR A GAME WITH A WHOLE VETERAN HALF
 * ---------------------------------------------------------------------------
 * The DAY CEILING is the mechanism, not a pile of per-feature flags. A demo
 * career ends at the dusk of {@link DEMO_FINAL_DAY}; everything gated behind
 * career DEPTH — the Nemesis crossing, the alliance arcs, the Registry ladder
 * above a handful of deeds — is unreachable because 33 days is not enough, which
 * is honest by construction and cannot rot as content is added.
 *
 * The three named locks exist because those three ARE reachable inside 33 days
 * and would otherwise leak:
 *   - the cheapest crew role is 2,000cr (`crew.ts` — a Tour One captain can
 *     clear that in a week of good manifests);
 *   - the cheapest port stake is 7,150cr (`ports.ts`, Denebola-5);
 *   - CONQUEROR is a Steam achievement and a Registry row, so it is "reachable"
 *     as CONTENT regardless of how many days are played.
 */

/** The day Tour One resolves (PRD §5.1 — the Merchant Guild marker is due on day
 *  30). MIRRORS the day-30 check in engine `day.ts`'s dusk block; the coupling is
 *  deliberate and asserted in `engine/src/__tests__/demo.test.ts` so the two
 *  cannot drift. Not imported BY day.ts: content must not become the place the
 *  full game's resolution day is configured from — the demo merely counts from
 *  it. */
export const TOUR_ONE_RESOLUTION_DAY = 30;

/** The task's "3 post-resolution days" — days 31, 32 and 33. THE POINT of the
 *  demo's tail: day 30's dusk still fires `TourOneResolved`, still flips the era
 *  to VETERAN and still sets `veteran.unlocked`, so the player sees the veteran
 *  lanes open and the Signal hook land before the demo concludes. */
export const DEMO_POST_RESOLUTION_DAYS = 3;

/** The last day a demo career plays. DERIVED, never a literal — change either
 *  constant above and this follows. */
export const DEMO_FINAL_DAY = TOUR_ONE_RESOLUTION_DAY + DEMO_POST_RESOLUTION_DAYS;

/**
 * The gate list, one id per named feature. THIS IS THE TASK'S LIST, one-to-one:
 * "Hangout progression" → `crew-progression` (see the header for the reading),
 * "ports" → `port-ownership`, "Conqueror content" → `conqueror`.
 */
export type DemoLockedFeature = 'crew-progression' | 'port-ownership' | 'conqueror';

/** READERS: engine `demoLocks` (the single predicate every enforcement site goes
 *  through) and the cockpit's `demoLockNotice`. */
export const DEMO_LOCKED_FEATURES: readonly DemoLockedFeature[] = [
  'crew-progression',
  'port-ownership',
  'conqueror',
];

/**
 * The tease. Authored period-voice, one line per lock — TEASED-BUT-GATED is the
 * task's own phrasing, so each line has to make the locked thing sound like
 * something worth buying the game for rather than a wall.
 *
 * READER: the cockpit's `demoLockNotice` (format.ts), rendered beside the
 * disabled control that carries the lock.
 */
export const DEMO_TEASE: Record<DemoLockedFeature, string> = {
  'crew-progression':
    'The berth is there and the crimp knows your face — but signing hands is veteran work. The full game hires them, and the hand you roll at dawn grows to match.',
  'port-ownership':
    'The authority would take your money and hand you the launch fees for the rest of your life. Not on a demo licence. The full game lets you buy the dock you are standing on.',
  conqueror:
    'Conqueror sits at the top of the Registry ladder, and past it the Signal, the shear and whatever is waiting on the far side. The full game is where that file gets opened.',
};

/**
 * The demo's closing card — what replaces the cockpit at the dawn after
 * {@link DEMO_FINAL_DAY}. Mirrors the shape of the crossing ending's authored
 * copy (`CROSSING_ENDING`) so the cockpit renders it through the same kind of
 * view, and says the two things the player needs: the career is not lost, and
 * where it goes next.
 *
 * READER: the cockpit's `demoEndCard` (format.ts) → `DemoEndCard` (App.tsx).
 */
export const DEMO_END_CARD: {
  kicker: string;
  title: string;
  body: readonly string[];
  cta: string;
} = {
  kicker: 'DEMO LICENCE EXPIRED',
  title: 'The Rim Goes On Without You',
  body: [
    'Thirty-three days. The Guild marker is behind you one way or the other, the veteran lanes are lit, and somewhere out past the charted rim a Signal is still repeating into the dark.',
    'Your licence — the ship, the charts, the Registry, the debts, every name that remembers yours — is written down and ready to travel. Export it, and the full game picks the career up on the morning after this one.',
  ],
  cta: 'Export career',
};
