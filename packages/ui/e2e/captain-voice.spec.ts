import { test, expect, type Locator, type Page } from '@playwright/test';
import { signOpeningMarker, skipFirstTurnWalkthrough } from './support/career';
import { DARE_MIN_WAGER, LIARS_DICE_OPPONENTS, NPC_PROFILES } from '@spacerquest/content';

// ---------------------------------------------------------------------------
// T-255 · A NAMED CAPTAIN'S VOICE, PROVED IN REAL DOM.
//
// WHAT THIS FILE EXISTS FOR. T-207 shipped four player-visible surfaces and left
// them with UNIT coverage only. Its own block recorded "no e2e change was needed
// or made", and that was wrong on the facts: `combat.spec.ts`'s two seeds are
// both ANONYMOUS encounters (a raider has no catchphrases at all — T-205's
// deliberate shape), and `liars-dice-roster.spec.ts` asserts `dare-table-talk` on
// the ROSTER seat, which is the OTHER arm of a mutually-exclusive pair. So not one
// of the four elements below had ever been rendered by a test:
//
//   `combat-enemy-bark`         · App.tsx · CombatInstrument, `readout?.enterLine`
//   `combat-enemy-battle-bark`  · App.tsx · CombatInstrument, `readout?.battleLine`
//   `combat-aftermath-bark`     · App.tsx · CombatAftermathPanel, `aftermath.opponentLine`
//   `dare-dealer-table-talk`    · App.tsx · LiarsDiceScene, `view?.dealerTableTalk`
//
// `liars-dice-pane.test.ts`'s own T-221 header names the standard this file meets:
// a node-env projection suite guards VALUES, and "the copy itself is asserted
// through the real DOM … which is where a claim about what a player can see can
// actually be proved." This is that proof for the captain's voice.
//
// SCOPE. UI/TEST-ONLY. Nothing under `packages/engine`, `packages/content` or
// `packages/ui/src` is touched by this task, so `rulesFingerprint` cannot move, no
// capstone is owed, `CURRENT_SAVE_VERSION` is untouched and no migration is owed.
// The only new bytes in the repo are this file.
//
// NEITHER EXISTING SPEC IS TOUCHED. The Accept criterion requires `combat.spec.ts`'s
// anonymous seeds and `liars-dice-roster.spec.ts`'s ROSTER-seat assertions left
// intact, so both files stay byte-identical: the anonymous walk is RE-WALKED here
// (test 5) and the roster negative control is a NEW test here (test 6), rather than
// either being edited into place over there.
//
// EVERY ASSERTED STRING IS READ FROM CONTENT. Not one authored line is typed into
// this file. A literal quote would be a second copy of the content that keeps
// passing while the cockpit prints something else — the exact failure the unit
// suite (`combat-catchphrases.test.ts`) already refuses, using the same
// `expect(pool).toContain(rendered)` membership idiom used below. Which line of a
// pool the engine picks is seeded, so membership — not identity — is the honest
// claim.
//
// ---------------------------------------------------------------------------
// THE FIXTURES — FOUND AND PINNED, NOT LEFT TO CHANCE
// ---------------------------------------------------------------------------
// Derived OFFLINE by replaying the engine exactly as the store does
// (`startDay(createInitialState(seed)).state` → `applyPlayerAction`, the idiom
// `combat.spec.ts`'s header documents) and feeding each resulting state through
// `packages/ui/src/format.ts`'s own `encounterReadout` / `combatAftermathSummary` /
// `dareScene`. The sweep and its predicate are recorded here so a future maintainer
// whose seed goes stale can RE-HUNT rather than patch a literal.
//
//  SWEEP: seeds 1..400 × jump-die INDEX 0..4 × destination 2..12, keeping the first
//  hit where `encounter.interceptor.source === 'named'` AND `enemyHull >= 2` (so a
//  landed hit does not end the fight before round 2 can show a battle line) AND the
//  drawn profile carries `catchphrases`. NOTE: `spendDie` is a HAND INDEX, not a die
//  value — the sweep and the clicks below both address dice by index.
//
//  FIXTURE A — the NAMED interceptor (seed 30). Dawn hand [15,15,15,10,1] on Sol,
//  tank 300. Jump die INDEX 0 → Altair-3 (system 3) draws `npc-zero-risk`,
//  "Zero Risk", source 'named', tier 2, enemyHull 2, round 1, leaving 215 fuel —
//  far clear of the 50-fuel fight cost, so no weapons-offline band muddies the
//  header. Zero Risk is one of the three OWNER-RULED FIXED ARCHETYPE ASSIGNMENTS in
//  `packages/content/src/cast.ts` ("Zero Risk trader"), so this profile cannot be
//  silently re-cut out from under the fixture.
//    - round 1 · `enterLine` set, `battleLine` null.
//    - FIGHT with die INDEX 1 → hull 2→1, round 2 · `enterLine` null (the enter line
//      owns the opening), `battleLine` set (the timing rule is "even rounds only").
//    - FIGHT with die INDEX 2 → killing volley → the post-kill retreat carries the
//      captain off: resolution 'interceptor-escaped', which `CAPTAIN_OUTCOME` reads
//      from the CAPTAIN's side as a `loss` — so the aftermath speaks their loss line.
//  The named draw at seed 30 held for every die index 0–4 and every core destination
//  tried, so the pin is robust rather than a knife-edge; index 0 / dest 3 is pinned
//  anyway to match the derivation byte for byte.
//
//  FIXTURE B — the ROAMING named captain at the table (seed 1, `npc-iron-vex`). The
//  same fixture `liars-dice.spec.ts` already documents and relies on: Iron Vex is
//  seated at Sol-3 on ANY seed (`createInitialState` seats NPCs at `(index % 20) + 1`
//  and `startDay` never moves them — movement is a dusk step), and is solvent at
//  5000cr. A proven-reachable path that had simply never been asserted for its bark.
//
//  FIXTURE C — the ANONYMOUS negative control (seed 43). RE-DERIVED here, not copied:
//  dawn hand [20,18,16,14,1]; jump die INDEX 1 → Altair-3 draws `anon-patrol-4`,
//  "Capt.Brutus", source 'anonymous', tier 2, hull 2; the value-14 die (INDEX 3)
//  fights to round 2; the natural-20 die (INDEX 0) runs, and a nat-20 is an
//  unconditional PILOT auto-escape → resolution 'escaped'. All three bark fields are
//  null at every step, which is what makes the absences below a real claim.
//
// Reduced motion is emulated in `beforeEach`: it puts the Liar's Dice scene on its
// INSTANT rail (the GSAP reveal timeline is never created, so the settled DOM exists
// on the very next render) and settles the dawn-roll scramble so a die's displayed
// face equals its dealt value the instant it is read.
// ---------------------------------------------------------------------------

const SEED_NAMED = 30;
const NAMED_JUMP_DIE_INDEX = 0; // value 15
const NAMED_DEST = 3; // Altair-3
const NAMED_FIGHT_DIE_INDEX = 1; // value 15 — to round 2
const NAMED_KILL_DIE_INDEX = 2; // value 15 — the killing volley

const SEED_DARE = 1;
const DARE_DEALER = 'npc-iron-vex';
const SUN_3 = 1;
const ROSTER_SEAT = LIARS_DICE_OPPONENTS[SUN_3][0];

const SEED_ANON = 43;
const ANON_JUMP_DIE_INDEX = 1; // value 18
const ANON_DEST = 3; // Altair-3
const ANON_FIGHT_DIE_INDEX = 3; // value 14 — to round 2
const ANON_RUN_DIE_INDEX = 0; // value 20 — nat-20 auto-escape
const ANON_ENEMY_NAME = 'Capt.Brutus';

// The authored pools, read from content. Non-null asserted at module scope AND
// re-guarded per use in `proveBarkNotVacuous`: a membership assertion over an empty
// pool is precisely the vacuity this task exists to rule out.
const ZERO_RISK = NPC_PROFILES.find((p) => p.id === 'npc-zero-risk')!;
const IRON_VEX = NPC_PROFILES.find((p) => p.id === DARE_DEALER)!;
const VOICE = ZERO_RISK.catchphrases!;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // T-187 · This spec is NOT testing the first-time flow — retire the scripted
  // first-turn walkthrough before the app boots, or its rails would make the panes
  // below inert. See `support/career.ts`.
  await skipFirstTurnWalkthrough(page);
});

/** Start a fresh, deterministic career on a chosen seed, entirely through the UI. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
  // T-200 · Sign the Guild marker this new career opened under. `newGame` arms it
  // unconditionally (every career has its own), so this is the click a player makes
  // too; it calls no engine action, so the pinned RNG stream is unmoved.
  await signOpeningMarker(page);
}

/** Jump from the starmap: assign the given hand die, click the destination, commit.
 *  Identical in shape to `combat.spec.ts`'s helper — the idiom is copied, not
 *  reinvented, so both files drive the cockpit the same way. */
async function jumpInto(page: Page, dieIndex: number, dest: number): Promise<void> {
  await page.getByTestId('die').nth(dieIndex).click();
  await page.locator(`[data-testid="starmap-system"][data-system-id="${dest}"]`).click();
  await page.getByTestId('confirm-jump').click();
}

/** Commit a FIGHT with a die addressed BY HAND INDEX, and wait for that die to
 *  register spent so the next read sees the settled re-render.
 *
 *  BY INDEX, NEVER BY VALUE: fixture A's hand holds three 15s, so
 *  `[data-die-value="15"].first()` is ambiguous and would silently drift. */
async function fightWithDie(page: Page, dieIndex: number): Promise<void> {
  const die = page.locator(`[data-testid="combat-die"][data-die-index="${dieIndex}"]`);
  await die.click();
  await page.getByTestId('combat-fight').click();
}

/** Open the Hangout and deal a Liar's Dice hand against a chosen dealer — every
 *  step a real click. `rowTestId` selects which POOL the dealer is drawn from:
 *  the roaming captains in port, or the port's fixed authored roster. */
async function dealHandAgainst(
  page: Page,
  seed: number,
  rowTestId: 'hangout-npc' | 'hangout-roster-opponent',
  opponentId: string,
): Promise<void> {
  await newGameSeed(page, seed);
  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();
  await page.locator(`[data-testid="${rowTestId}"][data-npc-id="${opponentId}"]`).click();
  await page.getByTestId('dare-wager').fill(String(DARE_MIN_WAGER));
  // T-197 · No die is armed to open a hand — the open is a Free Action.
  await expect(page.getByTestId('dare-commit')).toBeEnabled();
  await page.getByTestId('dare-commit').click();
  await expect(page.getByTestId('dare-scene')).toBeVisible();
}

/**
 * THE NON-VACUITY PROBE — the Accept clause "each assertion is shown to fail with
 * the bark rendering suppressed", discharged in-run rather than asserted in prose.
 *
 * It (1) guards the authored pool against emptiness, (2) asserts the DOM line is one
 * this captain is authored to say, then (3) SUPPRESSES that element's rendering and
 * re-runs the IDENTICAL assertion, REQUIRING it to go red. An assertion that still
 * passes with the bark gone is asserting nothing, and this makes that mechanically
 * checkable instead of a claim in a comment.
 *
 * MUST BE THE LAST ACT OF ITS TEST. Every bark is a conditional child of a
 * still-mounted parent (`{readout?.enterLine && <span/>}`), so if React later
 * re-renders that parent with the condition flipped it will call `removeChild` on a
 * node this probe already detached and throw. Each probe below therefore ends its
 * test — do not inline one mid-encounter.
 *
 * The 1s timeout is deliberate and explicit: the config's expect timeout is 10s, and
 * four probes waiting it out would add 40s of dead wall-clock to prove an absence
 * that is already settled.
 */
async function proveBarkNotVacuous(
  bark: Locator,
  pool: readonly string[] | undefined,
  what: string,
): Promise<void> {
  expect(
    pool?.length ?? 0,
    `${what}: empty authored pool — the check would be vacuous`,
  ).toBeGreaterThan(0);
  await expect(bark).toBeVisible();
  const shown = (await bark.textContent())!.trim();
  expect(pool!, `${what}: the DOM line is not one this captain is authored to say`).toContain(
    shown,
  );

  await bark.evaluate((node) => node.remove());
  let failed = false;
  try {
    await expect(bark).toHaveText(shown, { timeout: 1000 });
  } catch {
    failed = true;
  }
  expect(failed, `${what}: the assertion passed with the bark suppressed — it is vacuous`).toBe(
    true,
  );
}

// ---------------------------------------------------------------------------
// 1–3 · THE COMBAT VOICE, on the named interceptor seed
// ---------------------------------------------------------------------------

test('a named captain speaks on arrival — the intercept line, in the DOM', async ({ page }) => {
  await newGameSeed(page, SEED_NAMED);
  await jumpInto(page, NAMED_JUMP_DIE_INDEX, NAMED_DEST);

  // Scope every read to the overlay: the covered cockpit panes stay MOUNTED behind
  // it, so an unscoped testid could resolve against the wrong surface.
  const overlay = page.getByTestId('combat-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByTestId('combat-enemy-name')).toHaveText(ZERO_RISK.name);
  await expect(overlay.getByTestId('combat-enemy-tier')).toHaveText(`TIER ${ZERO_RISK.tier}`);
  await expect(overlay.getByTestId('combat-round')).toHaveText('ROUND 1');
  // A NAMED captain has a record, so the header is NOT the anonymous one — the
  // difference that makes the bark below reachable at all.
  await expect(overlay.getByTestId('combat-enemy-history')).not.toContainText('Unknown raider');

  // Round 1 belongs to the ENTER line alone. The mid-fight line must be absent, not
  // merely different: two barks in one header is the noise the timing rule forbids.
  await expect(overlay.getByTestId('combat-enemy-battle-bark')).toHaveCount(0);

  await proveBarkNotVacuous(
    overlay.getByTestId('combat-enemy-bark'),
    VOICE.enter,
    'combat-enemy-bark',
  );
});

test('the captain talks through the fight — the mid-fight line, in the DOM', async ({ page }) => {
  await newGameSeed(page, SEED_NAMED);
  await jumpInto(page, NAMED_JUMP_DIE_INDEX, NAMED_DEST);
  const overlay = page.getByTestId('combat-overlay');
  await expect(overlay).toBeVisible();

  // Press the attack: the hit lands, the hull drops and the round advances to 2 —
  // an EVEN round, which is where the timing rule places the mid-fight bark.
  await fightWithDie(page, NAMED_FIGHT_DIE_INDEX);
  await expect(overlay.getByTestId('combat-round')).toHaveText('ROUND 2');
  await expect(overlay.getByTestId('combat-enemy-hull')).toHaveAttribute('data-hull', '1');

  // …and the ENTER line has stood down. This is the half a unit test cannot see:
  // the opening line is not merely re-picked at round 2, its ELEMENT is gone.
  await expect(overlay.getByTestId('combat-enemy-bark')).toHaveCount(0);

  await proveBarkNotVacuous(
    overlay.getByTestId('combat-enemy-battle-bark'),
    VOICE.duringBattle,
    'combat-enemy-battle-bark',
  );
});

test('the captain gets a parting word — the aftermath line, in the DOM', async ({ page }) => {
  await newGameSeed(page, SEED_NAMED);
  await jumpInto(page, NAMED_JUMP_DIE_INDEX, NAMED_DEST);
  const overlay = page.getByTestId('combat-overlay');
  await expect(overlay).toBeVisible();

  await fightWithDie(page, NAMED_FIGHT_DIE_INDEX);
  await expect(overlay.getByTestId('combat-round')).toHaveText('ROUND 2');

  // The killing volley. The interceptor slips it under its own power (the post-kill
  // retreat roll), so the encounter resolves 'interceptor-escaped' — which
  // `CAPTAIN_OUTCOME` reads from THE CAPTAIN's side of the fight as a LOSS. That
  // inversion is the whole reason this surface is worth proving in the DOM: the
  // panel must speak their `loss` pool, not the resolution's name.
  await fightWithDie(page, NAMED_KILL_DIE_INDEX);
  await expect(overlay.getByTestId('combat-aftermath')).toBeVisible();
  await expect(overlay.getByTestId('combat-aftermath-resolution')).toHaveAttribute(
    'data-resolution',
    'interceptor-escaped',
  );

  await proveBarkNotVacuous(
    overlay.getByTestId('combat-aftermath-bark'),
    VOICE.loss,
    'combat-aftermath-bark',
  );
});

// ---------------------------------------------------------------------------
// 4 · THE TABLE VOICE, on the roaming named dealer
// ---------------------------------------------------------------------------

test('a roaming captain speaks at the Liar’s Dice table — their table talk, in the DOM', async ({
  page,
}) => {
  await dealHandAgainst(page, SEED_DARE, 'hangout-npc', DARE_DEALER);

  await expect(page.getByTestId('dare-dealer-name')).toHaveText(IRON_VEX.name.toUpperCase());
  // Their STANDING with you is up too (T-203), which is what tells the two dealer
  // pools apart at the table: a roster seat has no disposition to report.
  await expect(page.getByTestId('dare-dealer-history')).toBeVisible();
  // The roster seat's line is the OTHER arm of a mutually-exclusive pair and must be
  // absent here — the reason `liars-dice-roster.spec.ts` could never have covered
  // this surface no matter how many seats it sat down against.
  await expect(page.getByTestId('dare-table-talk')).toHaveCount(0);

  await proveBarkNotVacuous(
    page.getByTestId('dare-dealer-table-talk'),
    IRON_VEX.tableTalk,
    'dare-dealer-table-talk',
  );
});

// ---------------------------------------------------------------------------
// 5–6 · THE NEGATIVE CONTROLS — where the render is genuinely suppressed
// ---------------------------------------------------------------------------
//
// The probe above suppresses a bark artificially. These two prove the SHIPPED
// suppression: on an anonymous raider and on a roster seat the guards in `App.tsx`
// emit nothing at all. Each asserts the surrounding pane really rendered, so the
// absence is a claim about the bark rather than about a pane that never mounted.

test('an anonymous raider says nothing — the negative control', async ({ page }) => {
  await newGameSeed(page, SEED_ANON);
  await jumpInto(page, ANON_JUMP_DIE_INDEX, ANON_DEST);
  const overlay = page.getByTestId('combat-overlay');
  await expect(overlay).toBeVisible();

  const enterBark = overlay.getByTestId('combat-enemy-bark');
  const battleBark = overlay.getByTestId('combat-enemy-battle-bark');

  // Round 1 — the pane is fully up (name and record both rendered), and neither
  // combat bark exists.
  await expect(overlay.getByTestId('combat-enemy-name')).toHaveText(ANON_ENEMY_NAME);
  await expect(overlay.getByTestId('combat-enemy-history')).toContainText('Unknown raider');
  await expect(overlay.getByTestId('combat-round')).toHaveText('ROUND 1');
  await expect(enterBark).toHaveCount(0);
  await expect(battleBark).toHaveCount(0);

  // Round 2 — the EVEN round on which a named captain would speak mid-fight. The
  // timing rule must not leak a bark onto a raider who has none.
  await fightWithDie(page, ANON_FIGHT_DIE_INDEX);
  await expect(overlay.getByTestId('combat-round')).toHaveText('ROUND 2');
  await expect(overlay.getByTestId('combat-enemy-hull')).toHaveAttribute('data-hull', '1');
  await expect(enterBark).toHaveCount(0);
  await expect(battleBark).toHaveCount(0);

  // And the resolution: run on the natural 20 (an unconditional PILOT auto-escape).
  // The aftermath panel renders — headline and all — with no parting word, because
  // an `anon-*` id is not in the cast and finds no pool to speak from.
  await page.locator(`[data-testid="combat-die"][data-die-index="${ANON_RUN_DIE_INDEX}"]`).click();
  await page.getByTestId('combat-run').click();
  await expect(overlay.getByTestId('combat-aftermath')).toBeVisible();
  await expect(overlay.getByTestId('combat-aftermath-resolution')).toHaveAttribute(
    'data-resolution',
    'escaped',
  );
  await expect(overlay.getByTestId('combat-aftermath-bark')).toHaveCount(0);
});

test('a roster seat carries no roaming captain’s voice — the negative control', async ({
  page,
}) => {
  await dealHandAgainst(page, SEED_DARE, 'hangout-roster-opponent', ROSTER_SEAT.id);

  // The seat is dealt and its own authored line is up, so the dealer side of the
  // table genuinely rendered.
  await expect(page.getByTestId('dare-dealer-name')).toHaveText(ROSTER_SEAT.name.toUpperCase());
  await expect(page.getByTestId('dare-table-talk')).toBeVisible();

  // Pool A has no `NpcState`, so it has neither a standing to report nor a roaming
  // captain's bark to speak. Both elements are absent, never placeholders.
  await expect(page.getByTestId('dare-dealer-table-talk')).toHaveCount(0);
  await expect(page.getByTestId('dare-dealer-history')).toHaveCount(0);
});
