// ---------------------------------------------------------------------------
// T-1602a · The Tour One career driver.
//
// A plain support module, NOT a spec: Playwright's default `testMatch` is
// `**/*.@(spec|test).?(c|m)[jt]s?(x)`, so nothing under `e2e/support/` is ever
// collected as a suite (the same precedent as `packages/sim/src/__tests__/
// support/`). It IS covered by `e2e/tsconfig.json` and by eslint.
//
// WHAT THIS IS: everything below drives the cockpit through the REAL DOM — a
// player's clicks, keystrokes and reads, nothing else. There is deliberately no
// import from `@spacerquest/engine` or `../../src/store` anywhere in this file
// or its spec, not even a type: a career that needs an engine handle to be
// played is not a career a player can play. Every decision the driver makes is a
// pure function of what is on screen.
//
// ---------------------------------------------------------------------------
// DETERMINISM MODEL — READ THIS BEFORE CHANGING ANYTHING HERE
// ---------------------------------------------------------------------------
// The engine's randomness is a pure function of `GameState.rngState` plus the
// number of engine actions already resolved today, and the store issues exactly
// one `applyPlayerAction` per player verb. So the pinned seed depends on the
// ORDERED SEQUENCE OF RNG-PERTURBING CLICKS and on nothing else:
//
//   RNG-PERTURBING (each one moves the stream — adding, removing or reordering
//   any of these invalidates the pin):
//     sign contract · haggle · buy fuel · pay debt · confirm jump · off-lane
//     sweep · a combat stance · stand down · end day · a storylet CHOICE ·
//     hangout / loan / crew / port verbs.
//
//   RNG-FREE (free — add as many as you like, the pin does not care):
//     selecting or deselecting a die · clicking a starmap node to preview a
//     route · opening and closing Records, the Wire log, Settings, the Hangout
//     panel or a storylet panel (opening only, never choosing) · dismissing an
//     onboarding coach · dismissing a combat aftermath · typing into an input.
//
// That asymmetry is what makes the sightseeing pass free: it visits a dozen
// screens without costing the pin a thing.
//
// The corollary, stated bluntly because it is the thing a future maintainer will
// get wrong: THE PINNED SEED DEPENDS ON THIS FILE BYTE FOR BYTE. Changing a
// decision rule, a tiebreak, or the order of RNG-perturbing clicks invalidates
// it. Re-hunt the seed; do not patch the assertion.
// ---------------------------------------------------------------------------

import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The Guild marker every Tour One opens with (PRD §5.1). Asserted at dawn of
 *  day 1 and again on day 30 — nothing in a clean career pays it down early. */
export const GUILD_MARKER = 25000;

// ---- T-187 · the first-turn walkthrough stamp -----------------------------
//
// WHY EVERY SPEC IN THIS SUITE NEEDS THIS. T-187 arms a scripted, on-rails
// seven-step walkthrough for a genuinely first-time player — no save in storage,
// or a New Game on a profile that has never run it. That is EXACTLY the boot
// almost every spec in `e2e/` uses, and while the rails are up the non-scripted
// panes are `inert`, so a spec that goes straight for the manifest or the
// shipyard would be clicking a dead subtree.
//
// The honest repair is to declare, per spec, that it is NOT testing the
// first-time flow — one shared stamp rather than twenty copies of the same
// literal. `e2e/walkthrough.spec.ts` deliberately does not use this: it is the
// one suite that boots the walkthrough armed and drives it.
//
// Applied as an `addInitScript`, so it re-lands on `page.reload()` too; it writes
// ONLY the walkthrough key, so a spec's own persisted save / onboarding record
// survives the reboot untouched (the combat-spec gotcha).

/** The key `store.ts` persists the walkthrough record under. */
export const WALKTHROUGH_KEY = 'sq.walkthrough.v1';

/** Declare this page a returning player's: the first-turn walkthrough is
 *  retired before the app's module scope ever reads storage. Call it in
 *  `beforeEach`, AFTER any `localStorage.clear()` init script (init scripts run
 *  in the order they were added). */
export async function skipFirstTurnWalkthrough(page: Page): Promise<void> {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    WALKTHROUGH_KEY,
    JSON.stringify({ v: 1, status: 'skipped', acked: {}, flags: {} }),
  ] as const);
}

// ---- the run report -------------------------------------------------------

export interface DayRecord {
  day: number;
  /** The system the bezel said we were docked at when the day opened. */
  dockedAt: string;
  credits: number;
  fuel: number;
  /** Payment on the contract signed today, or null on an idle day. */
  signedPayment: number | null;
  signedDestination: string | null;
  signedPods: number | null;
  fuelBought: number;
  jumped: boolean;
  navFailures: number;
  encounter: boolean;
  /** Everything the cockpit refused or warned about today, verbatim. */
  notices: string[];
  /** Candidates the picker skipped, and why — no silent filtering. */
  skipped: string[];
}

export interface EncounterRecord {
  day: number;
  enemy: string;
  rounds: number;
  stances: string[];
  fuelAtContact: number;
  resolution: string;
  aftermath: string;
}

export interface RunReport {
  spec: 'T-1602a Tour One career';
  branch: 'cleared' | 'unpaid';
  seed: number;
  daysElapsed: number;
  screensVisited: string[];
  coachPromptsFired: string[];
  totals: {
    deliveries: number;
    jumps: number;
    navFailures: number;
    encounters: number;
    idleDays: number;
    fuelBought: number;
    creditsFinal: number;
    debtFinal: number;
    /** What was in the till on day 30 with the day's work done and the marker
     *  still outstanding — i.e. what the player COULD have paid with. Asserted
     *  ≥ GUILD_MARKER on both branches, which is what makes the unpaid run a
     *  genuine CHOICE rather than a second, poorer fixture. */
    day30Bankroll: number;
  };
  resolution: {
    outcome: string;
    rankLabel: string;
    veteranUnlocked: boolean;
    deedTitle: string | null;
    eraAfter: string;
  } | null;
  days: DayRecord[];
  encounters: EncounterRecord[];
  wallClockMs: number;
}

export function createReport(branch: 'cleared' | 'unpaid', seed: number): RunReport {
  return {
    spec: 'T-1602a Tour One career',
    branch,
    seed,
    daysElapsed: 0,
    screensVisited: [],
    coachPromptsFired: [],
    totals: {
      deliveries: 0,
      jumps: 0,
      navFailures: 0,
      encounters: 0,
      idleDays: 0,
      fuelBought: 0,
      creditsFinal: 0,
      debtFinal: 0,
      day30Bankroll: 0,
    },
    resolution: null,
    days: [],
    encounters: [],
    wallClockMs: 0,
  };
}

function visit(report: RunReport, screen: string): void {
  if (!report.screensVisited.includes(screen)) report.screensVisited.push(screen);
}

// ---- structured DOM reads -------------------------------------------------
//
// Everything below reads a `data-*` attribute or a single-number readout. The
// one place prose is touched is `debtOutstanding`, and that is a fixed-format
// bezel chip.

function toNumber(text: string | null): number {
  return Number.parseInt((text ?? '').replace(/[^\d-]/g, ''), 10);
}

async function readCredits(page: Page): Promise<number> {
  return toNumber(await page.getByTestId('credits').textContent());
}

/** The fuel depot's `N/M` hold readout — the tank and its ceiling. */
async function readFuelHold(page: Page): Promise<{ fuel: number; maxFuel: number }> {
  const raw = (await page.getByTestId('fuel-hold').textContent()) ?? '';
  const [tank, ceiling] = raw.split('/');
  return { fuel: toNumber(tank), maxFuel: toNumber(ceiling) };
}

async function readFuelPrice(page: Page): Promise<number> {
  return toNumber(await page.getByTestId('fuel-price').textContent());
}

async function readDay(page: Page): Promise<number> {
  return toNumber(await page.getByTestId('day').textContent());
}

async function readDockedAt(page: Page): Promise<string> {
  return ((await page.getByTestId('docked-at').textContent()) ?? '').trim();
}

/** The Guild marker still outstanding, from the bezel chip; 0 once cleared. */
export async function debtOutstanding(page: Page): Promise<number> {
  const chip = page.getByTestId('debt-chip');
  if ((await chip.count()) === 0) return 0;
  const raw = (await chip.textContent()) ?? '';
  const matched = /DEBT\s+([\d,]+)/.exec(raw);
  return matched ? toNumber(matched[1]) : 0;
}

interface DieRef {
  index: number;
  value: number;
}

/** The unspent dice of the dawn hand, read from each die's own aria-label
 *  (`die N, value V`) and `data-spent` — the same two things a player reads. */
async function unspentDice(page: Page): Promise<DieRef[]> {
  return page.getByTestId('die').evaluateAll((els) =>
    els
      .map((el, index) => ({
        index,
        spent: el.getAttribute('data-spent') === '1',
        value: Number(/value (\d+)/.exec(el.getAttribute('aria-label') ?? '')?.[1] ?? '0'),
      }))
      .filter((die) => !die.spent)
      .map((die) => ({ index: die.index, value: die.value })),
  );
}

async function unspentCombatDice(page: Page): Promise<DieRef[]> {
  return page.getByTestId('combat-die').evaluateAll((els) =>
    els
      .map((el, index) => ({
        index,
        spent: el.getAttribute('data-spent') === '1',
        value: Number(el.getAttribute('data-die-value') ?? '0'),
      }))
      .filter((die) => !die.spent)
      .map((die) => ({ index: die.index, value: die.value })),
  );
}

function lowest(dice: DieRef[]): DieRef {
  return dice.reduce((a, b) => (b.value < a.value ? b : a));
}
function highest(dice: DieRef[]): DieRef {
  return dice.reduce((a, b) => (b.value > a.value ? b : a));
}

interface ContractRow {
  index: number;
  destination: number;
  payment: number;
  fuelCost: number;
  dc: number;
  pods: number;
  contraband: boolean;
}

async function readContracts(page: Page): Promise<ContractRow[]> {
  return page.getByTestId('contract').evaluateAll((els) =>
    els.map((el, index) => ({
      index,
      destination: Number(el.getAttribute('data-destination-id') ?? '-1'),
      payment: Number(el.getAttribute('data-payment') ?? '0'),
      fuelCost: Number(el.getAttribute('data-fuel-cost') ?? '0'),
      dc: Number(el.getAttribute('data-dc') ?? '99'),
      pods: Number(el.getAttribute('data-pods') ?? '0'),
      contraband: el.getAttribute('data-contraband') === '1',
    })),
  );
}

/** Arm a die from the dawn hand. Selection is RNG-free (a store-local
 *  highlight), so it costs the pin nothing. */
async function armDie(page: Page, index: number): Promise<void> {
  const die = page.getByTestId('die').nth(index);
  await die.click();
  await expect(die).toHaveAttribute('aria-pressed', 'true');
}

async function armCombatDie(page: Page, index: number): Promise<void> {
  const die = page.getByTestId('combat-die').nth(index);
  await die.click();
  await expect(die).toHaveAttribute('aria-pressed', 'true');
}

async function noticeText(page: Page): Promise<string | null> {
  const notice = page.getByTestId('notice');
  if ((await notice.count()) === 0) return null;
  return ((await notice.textContent()) ?? '').trim();
}

// ---- start of career ------------------------------------------------------

/**
 * Boot a genuinely fresh career on `seed` through the New game control — the
 * player's own door, never a save fixture. Asserts the PRD §5.1 opening position
 * (day 1, the 25,000cr Guild marker, the Frontier Era) off the screen itself.
 */
export async function startCareer(page: Page, seed: number, report: RunReport): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();

  await expect(page.getByTestId('day')).toHaveText('1');
  await expect(page.getByTestId('debt-chip')).toContainText('25,000');
  await expect(page.getByTestId('campaign-era')).toHaveText('Frontier Era');
  await expect(page.getByTestId('hand')).toBeVisible();
  expect(await debtOutstanding(page)).toBe(GUILD_MARKER);
  visit(report, 'cockpit');
}

// ---- the sightseeing pass (RNG-free) --------------------------------------

/**
 * Walk every screen the cockpit offers, on day 1, at Sol-3 (the only Tour One
 * Hangout). Every interaction here is RNG-free — panels open and close, nothing
 * is chosen — so the whole tour costs the pinned seed nothing. Storylets are
 * OPENED but never resolved: resolution is already proven by
 * `storylet-delivery.spec.ts` / `npc-chains.spec.ts`, and a choice would both
 * move the RNG stream and make this pin needlessly fragile.
 */
export async function sightseeingPass(page: Page, report: RunReport): Promise<void> {
  // The permanently-mounted instruments.
  await expect(page.getByTestId('starmap-system').first()).toBeVisible();
  visit(report, 'starmap');
  await expect(page.getByTestId('ship-pane')).toBeVisible();
  visit(report, 'ship-pane');
  await expect(page.getByTestId('contract').first()).toBeVisible();
  visit(report, 'manifest-board');
  await expect(page.getByTestId('trade-pane')).toBeVisible();
  visit(report, 'port-ledger');
  await expect(page.getByTestId('wire')).toBeVisible();
  visit(report, 'wire');

  // Records — both tabs.
  await page.getByTestId('records-toggle').click();
  await expect(page.getByTestId('registry')).toBeVisible();
  visit(report, 'records-registry');
  await page.getByTestId('records-tab-nemesis').click();
  await expect(page.getByTestId('nemesis')).toBeVisible();
  visit(report, 'records-nemesis');
  await page.getByTestId('records-close').click();
  await expect(page.getByTestId('records-overlay')).toHaveCount(0);

  // The Galactic Wire log.
  await page.getByTestId('wire-log-toggle').click();
  await expect(page.getByTestId('wire-log')).toBeVisible();
  visit(report, 'wire-log');
  await page.getByTestId('wire-log-close').click();
  await expect(page.getByTestId('wire-log')).toHaveCount(0);

  // The Hangout (Sol-3 is the only one in Tour One) and the lender's terms.
  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();
  await expect(page.getByTestId('loan-terms')).toBeVisible();
  visit(report, 'hangout');
  await settleCoaches(page, report);
  await page.getByTestId('hangout-close').click();
  await expect(page.getByTestId('hangout-panel')).toHaveCount(0);

  // Settings, and the save slots that live inside it.
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await expect(page.getByTestId('audio-mixer')).toBeVisible();
  visit(report, 'settings');
  await expect(page.getByTestId('saves-panel')).toBeVisible();
  visit(report, 'saves');
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toHaveCount(0);

  // A storylet, if the port is offering one — opened from its diegetic surface
  // and closed again WITHOUT choosing.
  const opener = page.getByTestId('storylet-open');
  if ((await opener.count()) > 0) {
    await opener.first().click();
    await expect(page.getByTestId('storylet-panel')).toBeVisible();
    await expect(page.getByTestId('storylet-title')).toBeVisible();
    visit(report, 'storylet');
    await page.getByTestId('storylet-close').click();
    await expect(page.getByTestId('storylet-panel')).toHaveCount(0);
  }
}

// ---- per-day routine ------------------------------------------------------

/** Dismiss every onboarding coach currently up, recording which fired. The
 *  coach is non-modal, so this is politeness rather than necessity — but it
 *  keeps the DOM stable and gives the run report a real teaching-layer trace.
 *  RNG-free (the seen-record is client state, not engine state). */
async function settleCoaches(page: Page, report: RunReport): Promise<void> {
  const currentId = async (): Promise<string | null> => {
    const coach = page.getByTestId('onboarding');
    if ((await coach.count()) === 0) return null;
    return coach.first().getAttribute('data-onboarding-id');
  };
  for (let pass = 0; pass < 12; pass += 1) {
    const id = await currentId();
    if (id === null) return;
    if (!report.coachPromptsFired.includes(id)) report.coachPromptsFired.push(id);
    await page.getByTestId('onboarding-dismiss').first().click();
    await expect.poll(currentId).not.toBe(id);
  }
  throw new Error('onboarding coaches never settled — more than 12 prompts in a single pass');
}

export interface PlayDayOptions {
  /** Day 30 only: clear the Guild marker through the Port Ledger (the cleared
   *  branch) or leave it standing (the unpaid branch). */
  payMarker: boolean;
  report: RunReport;
}

/**
 * Play one day of the career, dawn to dusk, entirely through the cockpit.
 * Returns the day number it played.
 */
export async function playDay(page: Page, opts: PlayDayOptions): Promise<number> {
  const { report } = opts;
  const day = await readDay(page);
  const record: DayRecord = {
    day,
    dockedAt: await readDockedAt(page),
    credits: await readCredits(page),
    fuel: (await readFuelHold(page)).fuel,
    signedPayment: null,
    signedDestination: null,
    signedPods: null,
    fuelBought: 0,
    jumped: false,
    navFailures: 0,
    encounter: false,
    notices: [],
    skipped: [],
  };

  // 1 — clear anything covering the cockpit.
  await settleCoaches(page, report);
  await dismissAftermathIfAny(page, report);

  // 1b — T-112 (fix round 1) · AN INTERDICTION CAN OUTLIVE THE DAY THAT STARTED IT.
  //
  // Standing down IS the dusk (store `standDown` → endDay), but it does NOT end the
  // encounter: the interceptor is still alongside at dawn, the overlay is still
  // mounted, and the new day opens with a fresh hand and the same fight. The driver
  // used to walk straight past that into the manifest and the depot, where every
  // click lands on the overlay's backdrop instead of the cockpit — the day never
  // advances and the run stalls until the test's own timeout. A player finishes the
  // fight; so does this. (Reached only when the hand ran out mid-fight, which is why
  // the seed-21 career never exercised it before the T-1605 / N-series changes moved
  // the economy into it.)
  let duskAlreadyFell = false;
  if ((await page.getByTestId('combat-overlay').count()) > 0) {
    record.encounter = true;
    duskAlreadyFell = await fightThrough(page, record, report);
  }

  // 2 — take a job, if the hold is empty and the board has one worth taking.
  if (!duskAlreadyFell && (await page.getByTestId('active-contract-empty').count()) > 0) {
    await signBestContract(page, record);
  }

  // 3-6 — fuel the route, fly it, fight whatever meets us, retry a nav failure.
  const destination = duskAlreadyFell
    ? null
    : await page.getByTestId('active-contract').getAttribute('data-destination-id');
  if (destination !== null) {
    duskAlreadyFell = await runTheJob(page, Number(destination), record, report);
  }

  // 7 — the marker, on the last day of the Tour.
  //
  // The bankroll gate runs on BOTH branches: the whole point of the unpaid run
  // is that the same career, on the same seed, COULD have discharged the marker
  // and its pilot chose not to. If this ever fires it is the one seed-dependent
  // number in the spec — see the re-hunt note it carries.
  if (day === 30 && !duskAlreadyFell) {
    const outstanding = await debtOutstanding(page);
    expect(outstanding, 'the Guild marker rides untouched until the player pays it').toBe(
      GUILD_MARKER,
    );
    const credits = await readCredits(page);
    report.totals.day30Bankroll = credits;
    expect(
      credits,
      `day-30 bankroll (${credits}cr) must cover the ${GUILD_MARKER}cr marker on seed ` +
        `${report.seed}. If a content or economy change moved this, RE-HUNT the seed with ` +
        'this driver (see the sweep provenance in tour-one-career.spec.ts) — do not lower ' +
        'the gate.',
    ).toBeGreaterThanOrEqual(GUILD_MARKER);
    if (opts.payMarker) {
      await page.getByTestId('debt-amount').fill(String(outstanding));
      await page.getByTestId('pay-debt').click();
      await expect(page.getByTestId('debt-cleared')).toBeVisible();
      await expect(page.getByTestId('debt-chip')).toHaveCount(0);
    } else {
      // Left standing, deliberately: the ledger still shows the marker and the
      // Pay down control is still live — nothing was cleared behind the player.
      await expect(page.getByTestId('debt-cleared')).toHaveCount(0);
      await expect(page.getByTestId('pay-debt')).toBeEnabled();
    }
  }

  // 8 — close the day out. Dusk moves the galaxy.
  const notice = await noticeText(page);
  if (notice !== null && !record.notices.includes(notice)) record.notices.push(notice);
  if (duskAlreadyFell) {
    // Standing down mid-encounter IS the day's end (store `standDown` → endDay),
    // so a second end-day click would silently swallow a whole extra day.
    await expect(page.getByTestId('day')).toHaveText(String(day + 1));
  } else {
    await page.getByTestId('end-day').click();
    await expect(page.getByTestId('day')).toHaveText(String(day + 1));
  }

  // 9 — file the day.
  if (record.signedPayment === null && !record.jumped) report.totals.idleDays += 1;
  report.days.push(record);
  report.daysElapsed = report.days.length;
  return day;
}

async function dismissAftermathIfAny(page: Page, report: RunReport): Promise<void> {
  const dismiss = page.getByTestId('combat-dismiss');
  if ((await dismiss.count()) === 0) return;
  visit(report, 'combat-aftermath');
  await dismiss.click();
  await expect(page.getByTestId('combat-overlay')).toHaveCount(0);
}

/**
 * The contract picker — a competent trader's rule, read entirely off the board's
 * own `data-*` attributes plus the hand, the tank and the till:
 *
 *   1. never contraband — a patrol scan is variance this career does not need
 *      (smuggling has its own coverage in `progression.spec.ts`);
 *   2. never a route the tank could not hold the fuel for even when brimmed;
 *   3. never a route whose PILOT DC the best die in hand cannot clear UNAIDED —
 *      a DC-20 rim haul on a junker is precisely how a Tour One career strands
 *      itself: the failed check burns the die AND the fuel and leaves you put,
 *      broke, holding a contract you can no longer fly;
 *   4. never a route whose fuel shortfall the till cannot cover;
 *   5. of what survives, the best NET run — payment minus the fuel it must buy —
 *      tie-broken by the cheaper jump, then by board order.
 *
 * Every rejected candidate is recorded on the day, so the report never hides a
 * board that quietly went unusable.
 */
async function signBestContract(page: Page, record: DayRecord): Promise<void> {
  const rows = await readContracts(page);
  const dice = await unspentDice(page);
  if (rows.length === 0 || dice.length === 0) {
    record.skipped.push(rows.length === 0 ? 'board dark' : 'hand spent');
    return;
  }
  const bestDie = highest(dice).value;
  const { fuel, maxFuel } = await readFuelHold(page);
  const price = await readFuelPrice(page);
  const credits = await readCredits(page);

  const viable: (ContractRow & { net: number })[] = [];
  for (const row of rows) {
    const shortfall = Math.max(0, row.fuelCost - fuel);
    if (row.contraband) {
      record.skipped.push(`#${row.index} contraband`);
    } else if (row.fuelCost > maxFuel) {
      record.skipped.push(`#${row.index} needs ${row.fuelCost} fuel, tank holds ${maxFuel}`);
    } else if (row.dc > bestDie) {
      record.skipped.push(`#${row.index} PILOT DC ${row.dc} > best die ${bestDie}`);
    } else if (shortfall * price > credits) {
      record.skipped.push(`#${row.index} fuel bill ${shortfall * price}cr > ${credits}cr on hand`);
    } else {
      viable.push({ ...row, net: row.payment - shortfall * price });
    }
  }
  if (viable.length === 0) return;
  viable.sort((a, b) => b.net - a.net || a.fuelCost - b.fuelCost || a.index - b.index);
  const pick = viable[0];

  await armDie(page, lowest(dice).index);
  await page.getByTestId('contract').nth(pick.index).click();

  const empty = page.getByTestId('active-contract-empty');
  await expect
    .poll(async () => {
      if ((await empty.count()) === 0) return 'signed';
      if ((await noticeText(page)) !== null) return 'refused';
      return 'pending';
    })
    .not.toBe('pending');

  if ((await empty.count()) > 0) {
    const notice = await noticeText(page);
    if (notice !== null) record.notices.push(notice);
    record.skipped.push(`#${pick.index} refused at the counter`);
    return;
  }
  record.signedPayment = pick.payment;
  record.signedPods = pick.pods;
  record.signedDestination = await readActiveDestination(page);
}

/** The hold's destination line, for the report's day log. */
async function readActiveDestination(page: Page): Promise<string> {
  const dest = page.getByTestId('active-contract').locator('.dest');
  return ((await dest.textContent()) ?? '').replace(/^[▸\s]+/, '').trim();
}

/**
 * Fuel the hold's route, fly it, fight whatever meets us, and retry a nav
 * failure once. Returns true when the day already ended inside this call (a
 * mid-encounter stand-down IS an end-day).
 */
async function runTheJob(
  page: Page,
  destination: number,
  record: DayRecord,
  report: RunReport,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const needed = Number(await page.getByTestId('active-contract').getAttribute('data-fuel-cost'));
    const { fuel, maxFuel } = await readFuelHold(page);

    // --- fuel to exactly the jump's bill -----------------------------------
    const shortfall = needed - fuel;
    if (shortfall > 0) {
      const price = await readFuelPrice(page);
      const credits = await readCredits(page);
      const dice = await unspentDice(page);
      if (dice.length === 0 || shortfall * price > credits) {
        record.skipped.push(
          dice.length === 0
            ? 'no die left to buy fuel with'
            : `cannot afford ${shortfall} fuel (${shortfall * price}cr > ${credits}cr on hand)`,
        );
        return false;
      }
      expect(shortfall, 'never buy fuel the tank cannot hold').toBeLessThanOrEqual(maxFuel - fuel);
      await armDie(page, lowest(dice).index);
      await page.getByTestId('fuel-amount').fill(String(shortfall));
      // The T-1402 pre-commit clamp warning must stay silent — buying exactly
      // the shortfall can never overspend, and if it ever does that is a real
      // regression, not a driver detail.
      await expect(page.getByTestId('fuel-overspend-warning')).toHaveCount(0);
      await page.getByTestId('buy-fuel').click();
      await expect.poll(async () => (await readFuelHold(page)).fuel).toBeGreaterThanOrEqual(needed);
      record.fuelBought += shortfall;
      report.totals.fuelBought += shortfall;
    }

    // --- plot the route on the starmap and commit --------------------------
    const node = page.locator(`[data-testid="starmap-system"][data-system-id="${destination}"]`);
    if ((await node.count()) === 0) {
      record.skipped.push(`system ${destination} is not on the chart`);
      return false;
    }
    await expect(node).toHaveAttribute('data-reachable', '1');
    await node.click();
    await expect(page.getByTestId('route-preview')).toBeVisible();
    visit(report, 'route-preview');

    const dice = await unspentDice(page);
    if (dice.length === 0) {
      record.skipped.push('no die left to jump with');
      return false;
    }
    const origin = await readDockedAt(page);
    await armDie(page, highest(dice).index);
    await page.getByTestId('confirm-jump').click();
    // `commit()` clears the plotted target, so the preview unmounting is the
    // signal that the jump resolved and the cockpit re-rendered.
    await expect(page.getByTestId('route-preview')).toHaveCount(0);
    record.jumped = true;
    report.totals.jumps += 1;

    // --- whatever met us en route ------------------------------------------
    if ((await page.getByTestId('combat-overlay').count()) > 0) {
      record.encounter = true;
      const stoodDown = await fightThrough(page, record, report);
      if (stoodDown) return true;
    }

    if ((await readDockedAt(page)) !== origin) {
      report.totals.deliveries += 1;
      return false;
    }

    // Still at the origin: a failed PILOT check burns the die and the fuel but
    // leaves you put. Retry once if the hand and the till still allow it.
    const notice = await noticeText(page);
    if (notice !== null) record.notices.push(notice);
    record.navFailures += 1;
    report.totals.navFailures += 1;
  }
  return false;
}

/**
 * Work an encounter to its end. Policy: commit the best die in hand and RUN
 * whenever the fuel budget says a run can actually fire (`data-can-run`);
 * otherwise TALK and buy the lane with tribute. FIGHT is deliberately never
 * chosen — a junker's strength-1 weapons lose, and a succession mid-run would
 * hand the career a different ship, a halved bank and a different RNG stream,
 * which would invalidate the pin. When the hand empties mid-fight the only legal
 * move is to stand down, which ends the day; that is reported upward.
 *
 * Returns true when the encounter ended in a stand-down (dusk already fell).
 */
async function fightThrough(page: Page, record: DayRecord, report: RunReport): Promise<boolean> {
  visit(report, 'combat');
  const overlay = page.getByTestId('combat-overlay');
  const fuelReadout = page.getByTestId('combat-fuel');
  const entry: EncounterRecord = {
    day: record.day,
    enemy: ((await page.getByTestId('combat-enemy-name').textContent()) ?? '').trim(),
    rounds: 0,
    stances: [],
    fuelAtContact: Number(await fuelReadout.getAttribute('data-fuel')),
    resolution: 'unresolved',
    aftermath: '',
  };
  report.totals.encounters += 1;
  let stoodDown = false;

  for (let round = 0; round < 8; round += 1) {
    if ((await overlay.count()) === 0) break;
    if ((await page.getByTestId('combat-aftermath').count()) > 0) break;
    // The first-encounter coach mounts INSIDE the overlay; clear it so the
    // stance buttons are never occluded.
    await settleCoaches(page, report);

    const dice = await unspentCombatDice(page);
    if (dice.length === 0) {
      entry.stances.push('stand-down');
      entry.resolution = 'stood-down';
      await page.getByTestId('combat-stand-down').click();
      stoodDown = true;
      break;
    }
    await armCombatDie(page, highest(dice).index);
    const canRun = (await fuelReadout.getAttribute('data-can-run')) === '1';
    entry.stances.push(canRun ? 'run' : 'talk');
    entry.rounds += 1;
    await page.getByTestId(canRun ? 'combat-run' : 'combat-talk').click();
    // Either the round burned the die and a fresh round opened, or the
    // encounter ended. Poll on "something changed" rather than a timeout.
    await expect
      .poll(async () => {
        if ((await overlay.count()) === 0) return 'over';
        if ((await page.getByTestId('combat-aftermath').count()) > 0) return 'aftermath';
        return String((await unspentCombatDice(page)).length);
      })
      .not.toBe(String(dice.length));
  }

  const aftermath = page.getByTestId('combat-aftermath');
  if ((await aftermath.count()) > 0) {
    entry.resolution =
      (await page.getByTestId('combat-aftermath-resolution').getAttribute('data-resolution')) ??
      'unknown';
    entry.aftermath = ((await aftermath.textContent()) ?? '').trim();
    visit(report, 'combat-aftermath');
    await page.getByTestId('combat-dismiss').click();
    await expect(overlay).toHaveCount(0);
  }
  report.encounters.push(entry);

  // Risk: a succession mid-run silently swaps the ship and halves the bank, so
  // the career after it is a DIFFERENT career and the pinned seed no longer
  // describes it. Fail loudly rather than limp on.
  expect(
    entry.aftermath,
    'the career must survive Tour One: a ShipLost succession invalidates the pinned seed',
  ).not.toContain('ship was lost');

  return stoodDown;
}

// ---- the resolution ceremony ----------------------------------------------

/** Read the ceremony into the report, then acknowledge it back to a playable
 *  cockpit. */
export async function acknowledgeResolution(page: Page, report: RunReport): Promise<void> {
  const ceremony = page.getByTestId('resolution-ceremony');
  await expect(ceremony).toBeVisible();
  visit(report, 'resolution-ceremony');
  // The deed's title is the `<b>` beside the DEED seal — take the title, not the
  // seal's own text glued to the front of it.
  const deed = page.getByTestId('resolution-deed').locator('b');
  report.resolution = {
    outcome: (await ceremony.getAttribute('data-outcome')) ?? 'unknown',
    rankLabel: ((await page.getByTestId('resolution-rank').textContent()) ?? '').trim(),
    veteranUnlocked: (await page.getByTestId('veteran-unlocked').count()) > 0,
    deedTitle: (await deed.count()) > 0 ? ((await deed.textContent()) ?? '').trim() : null,
    eraAfter: ((await page.getByTestId('campaign-era').textContent()) ?? '').trim(),
  };

  // Day 31 dealt a fresh hand; if a choice wants a die, arm one first.
  if ((await page.getByTestId('resolution-choice-lock').count()) > 0) {
    const dice = await unspentDice(page);
    if (dice.length > 0) await armDie(page, highest(dice).index);
  }
  await page.getByTestId('resolution-choice-btn').first().click();
  await expect(ceremony).toHaveCount(0);

  report.totals.creditsFinal = await readCredits(page);
  report.totals.debtFinal = await debtOutstanding(page);
}

/** The cockpit is alive and takeable — the no-soft-lock check. */
export async function expectPlayableCockpit(page: Page): Promise<void> {
  await expect(page.getByTestId('end-day')).toBeVisible();
  await expect(page.getByTestId('hand')).toBeVisible();
}

// ---- the run report artifact ----------------------------------------------

/**
 * Emit the run report three ways: attached to the Playwright HTML/trace report,
 * written under Playwright's own `outputDir`, and dropped at a stable path CI
 * uploads as an artifact. Asserts the report is non-degenerate FIRST, so an
 * empty file can never masquerade as evidence.
 */
export async function emitReport(testInfo: TestInfo, report: RunReport): Promise<void> {
  expect(report.daysElapsed, 'a Tour One career is exactly 30 days').toBe(30);
  expect(
    report.screensVisited.length,
    'the run report must show the career actually visited the cockpit screens',
  ).toBeGreaterThanOrEqual(8);
  const delivered = report.days.filter((day) => day.signedPods !== null);
  expect(delivered.length, 'a career that signed nothing is not a career').toBeGreaterThan(0);
  for (const day of delivered) expect(day.signedPods).toBeGreaterThan(0);

  const json = JSON.stringify(report, null, 2);
  await testInfo.attach('tour-one-run-report.json', {
    body: json,
    contentType: 'application/json',
  });
  writeFileSync(testInfo.outputPath('run-report.json'), json, 'utf8');

  // A stable, human-findable copy. `test-results/` is gitignored, so nothing is
  // committed; CI uploads this directory as the `tour-one-run-report` artifact.
  const dir = join(dirname(testInfo.project.testDir), 'test-results', 'tour-one');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${report.branch}-run-report.json`), json, 'utf8');
  writeFileSync(join(dir, `${report.branch}-run-report.md`), renderMarkdown(report), 'utf8');
}

function renderMarkdown(report: RunReport): string {
  const lines: string[] = [];
  lines.push(`# T-1602a · Tour One career run report — ${report.branch} branch`);
  lines.push('');
  lines.push(`- seed: \`${report.seed}\``);
  lines.push(`- days elapsed: **${report.daysElapsed}**`);
  lines.push(`- wall clock: ${(report.wallClockMs / 1000).toFixed(1)}s`);
  lines.push(
    `- totals: ${report.totals.deliveries} deliveries · ${report.totals.jumps} jumps · ` +
      `${report.totals.navFailures} nav failures · ${report.totals.encounters} encounters · ` +
      `${report.totals.idleDays} idle days · ${report.totals.fuelBought} fuel bought`,
  );
  lines.push(`- final: ${report.totals.creditsFinal}cr · ${report.totals.debtFinal}cr marker`);
  if (report.resolution) {
    lines.push(
      `- resolution: **${report.resolution.outcome}** · rank ${report.resolution.rankLabel} · ` +
        `veteran lanes ${report.resolution.veteranUnlocked ? 'OPEN' : 'closed'} · ` +
        `deed ${report.resolution.deedTitle ?? '—'} · era ${report.resolution.eraAfter}`,
    );
  }
  lines.push('');
  lines.push(`## Screens visited (${report.screensVisited.length})`);
  lines.push('');
  for (const screen of report.screensVisited) lines.push(`- ${screen}`);
  lines.push('');
  lines.push(`## Onboarding prompts fired (${report.coachPromptsFired.length})`);
  lines.push('');
  for (const prompt of report.coachPromptsFired) lines.push(`- ${prompt}`);
  lines.push('');
  lines.push('## Day log');
  lines.push('');
  lines.push(
    '| Day | Docked | Credits | Fuel | Signed | Destination | Fuel bought | Jump | Nav fail | Enc |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const day of report.days) {
    lines.push(
      `| ${day.day} | ${day.dockedAt} | ${day.credits} | ${day.fuel} | ` +
        `${day.signedPayment ?? '—'} | ${day.signedDestination ?? '—'} | ${day.fuelBought} | ` +
        `${day.jumped ? 'Y' : '—'} | ${day.navFailures} | ${day.encounter ? 'Y' : '—'} |`,
    );
  }
  if (report.encounters.length > 0) {
    lines.push('');
    lines.push('## Encounters');
    lines.push('');
    lines.push('| Day | Enemy | Rounds | Stances | Fuel at contact | Resolution |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const enc of report.encounters) {
      lines.push(
        `| ${enc.day} | ${enc.enemy} | ${enc.rounds} | ${enc.stances.join(', ')} | ` +
          `${enc.fuelAtContact} | ${enc.resolution} |`,
      );
    }
  }
  const noticed = report.days.filter((day) => day.notices.length > 0);
  if (noticed.length > 0) {
    lines.push('');
    lines.push('## Notices raised');
    lines.push('');
    for (const day of noticed) for (const n of day.notices) lines.push(`- day ${day.day}: ${n}`);
  }
  const skipped = report.days.filter((day) => day.skipped.length > 0);
  if (skipped.length > 0) {
    lines.push('');
    lines.push('## Candidates skipped by the picker');
    lines.push('');
    for (const day of skipped) for (const s of day.skipped) lines.push(`- day ${day.day}: ${s}`);
  }
  lines.push('');
  return lines.join('\n');
}
