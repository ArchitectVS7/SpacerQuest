import { test, expect, type Page } from '@playwright/test';
import {
  applyDisposition,
  applyReputation,
  createInitialState,
  createSave,
  grantFragment,
  startDay,
  type GameEvent,
  type GameState,
} from '@spacerquest/engine';

// ---------------------------------------------------------------------------
// T-1602b · DEATH AND LEGACY, THROUGH THE REAL COCKPIT.
//
// HONEST SPLIT, stated up front. The injected save sets the SCENARIO ONLY — a
// spacer twelve days into their Tour, standing at a rim port with a tier-1 hull
// chewed down to its last point of condition, one Signal Fragment in the file, a
// grudge on the books and a Guild marker outstanding. From the boot screen
// onward EVERY action below is a real click: the contract is signed off the
// manifest, the jump is plotted on the starmap and committed, the fight is
// fought round by round, and the death arrives from the engine's own dice. This
// is the same sanctioned fixture pattern `nemesis-file.spec.ts`,
// `alliance-arcs.spec.ts`, `nemesis-crossing.spec.ts` and `onboarding.spec.ts`
// (`bootDay30`) use.
//
// WHY NOT PLAY IT FROM DAY 1 (as `tour-one-career.spec.ts` does)? Because a
// from-scratch death is not reachable inside any sane Playwright budget:
//   * enemy fire removes 1 condition per landed hit (2 at margin >= 10, 3 on a
//     nat-20) from a UNIFORM seeded pick over 8 components (`combat.ts`
//     `damageComponentForHit`), so only ~1 hit in 8 touches the hull at all;
//   * a fresh hull sits at condition 9, i.e. ~9 hull-targeted hits ~= ~72 landed
//     enemy hits ~= well over a hundred combat rounds, against a day that yields
//     at most ~6 (five dawn dice plus the dusk free attack);
//   * the sim fleet's measured death rate across the whole campaign suite is
//     currently ZERO — the very finding T-1603c exists to move.
// The scenario therefore hands the player a hull already on its last point. The
// dice that take it, and every decision that walks into them, are real.
//
// SCOPE NOTE — cancelled scheduled storylets. `applySuccession` also wipes
// `storylets.scheduled` (appointments with a dead spacer). That is deliberately
// NOT asserted here: a cancelled future appointment has no cockpit surface to
// read, so there is nothing a player could see. It is covered headlessly in
// `packages/engine/src/__tests__/legacy.test.ts`.
//
// SCOPE NOTE — carried NPC dispositions. PRD §5.2's "grudges attach to the NAME"
// has two halves on state: per-NPC `disposition` and four-faction `reputation`.
// The faction half is asserted below through the Registry's ALLIANCE STANDING
// row, a stable DOM target. The per-NPC half is not: its only cockpit reader is
// the dossier link inside the VIRTUALIZED wire log, which requires scroll-
// hunting a specific line out of a windowed list — a flake source this task
// exists to remove, not add. It is covered headlessly by `legacy.test.ts`
// ("carries charts/deeds/flags/dispositions/debt…"). Both halves ride the same
// carried-wholesale code path in `legacy.ts`.
//
// ---------------------------------------------------------------------------
// SEED PROVENANCE — pinned 2026-07-26
// ---------------------------------------------------------------------------
// Swept seeds 1..200 against THIS spec's decision rules replayed headlessly
// (`.scratch/hunt-t1602b.ts`): boot the fixture, sign by the contract rule
// below, jump, then FIGHT with the lowest die in hand each round. The engine's
// rng is a pure function of `rngState` + the count of actions already resolved,
// so the action stream IS the seed — a pin backed by a different action order is
// not backed at all.
//
//   interceptions on the pinned jump: 52 of 200
//   hull-kill deaths within 6 FIGHT rounds: 13 of 200
//   pinned: seed 192 — Lucky Seven (`npc-lucky-seven`, a NAMED tier-2 hunter)
//           takes the ship on the SECOND fight round. Chosen over the 1-round
//           kills (14/44/99/135/155/161) because two rounds actually exercise
//           the round loop, and over the anonymous killers (17/40/42/121/176)
//           because a named interceptor also proves the notice resolves an id to
//           its authored NAME. The 108 fuel left after the jump covers both
//           50-fuel volleys, so neither round is a fuel-gated misfire.
//   life-support pin: seed 3 — 23 of the first 60 seeds fail the dusk GRIT
//           survival roll on the same fixture; 3 is simply the first that also
//           keeps the day-12 wire short enough to read without scrolling.
//
// THE PIN DEPENDS ON THE ACTION ORDER BYTE FOR BYTE. Adding, removing or
// reordering any rng-perturbing click (sign · buy fuel · confirm jump · a combat
// stance · end day) invalidates it. Re-hunt the seed; do NOT patch an assertion
// down to meet a moved outcome.
//
// FALLOUT OWNER: T-1603c (combat & survival tuning) owns the re-pin if it moves
// enemy damage, the component spread, hull condition, the life-support survival
// DC, or the Auto-Repair interaction — under the rebalance-fallout rule, in the
// same commit that moves them.
// ---------------------------------------------------------------------------

const DEATH_SEED = 192;
const LIFE_SUPPORT_SEED = 3;

/** Antares-5 — a rim port; every lane out of it is danger tier 4. */
const ORIGIN_SYSTEM = 15;
/** Deliberately ODD, so the inheritance assertion proves FLOOR division and not
 *  merely "about half". */
const SCENARIO_CREDITS = 8401;
/** The Guild marker every Tour One career opens with (PRD §5.1) — carried by the
 *  estate, never forgiven. */
const GUILD_MARKER = 25000;
/** Knowledge is the one currency death never takes (PRD §8.1). */
const HELD_FRAGMENT = 'frag-nemesis-06';
/** A grudge already on the books — standing attaches to the NAME (PRD §5.2). */
const GRUDGE_NPC = 'npc-rattlesnake';
/** League standing, seeded through the engine's own mover so the carried value
 *  is exactly what organic play would have written. */
const LEAGUE_STANDING = 4;

/**
 * The scenario: a career twelve days deep whose hull is one point from gone.
 *
 * Everything that HAS an engine grant path is granted through it — `grantFragment`
 * for the Nemesis file, `applyDisposition` for the grudge, `applyReputation` for
 * the faction standing — so the injected state is byte-for-byte what real play
 * would have produced. The one direct edit is the ship itself: a tier-1 hull
 * (strength 10, bought somewhere in the first fortnight) worn to condition 1.
 * There is no "damage the hull" grant path to call — in play this is written by
 * `applyEnemyPressure` in `combat.ts`, one landed hit at a time, which is exactly
 * the mechanism that finishes the job on screen below.
 */
function wreckedCareer(seed: number, opts: { lifeSupportCritical?: boolean } = {}): GameState {
  const base = createInitialState(seed);
  base.day = 12;
  base.player.credits = SCENARIO_CREDITS;
  base.player.currentSystemId = ORIGIN_SYSTEM;
  base.player.ship.hull.strength = 10;
  base.player.ship.hull.condition = 1;
  // T-1804 ratified the ordering that makes the life-support death UNREACHABLE
  // whenever Auto-Repair is fitted (`day.ts` ~503-513: the module heals
  // lifeSupport 0→1 before the dusk gate). The junker ships without it and this
  // scenario never fits one, so the path below stays live — stated here so the
  // absence reads as a decision rather than an oversight.
  if (opts.lifeSupportCritical) base.player.ship.lifeSupport.condition = 0;

  grantFragment(base.player.nemesisFile, HELD_FRAGMENT, 'derelict', base.day);
  const moved: GameEvent[] = [];
  applyDisposition(base, GRUDGE_NPC, -5, 'defeat', moved);
  applyReputation(base, 'league', LEAGUE_STANDING, 'patrol-tribute', moved);
  // A silent no-op here (a renamed npc id, a clamped delta) would quietly gut the
  // carried-standing assertions, so fail loudly at fixture time instead.
  expect(moved.length, 'the scenario must actually move standing').toBe(2);

  return startDay(base).state;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Every first-time coach id in `format.ts` ONBOARDING_PROMPTS. */
const COACH_IDS = [
  'first-encounter',
  'dawn-roll',
  'first-sign',
  'first-jump',
  'first-hangout',
  'first-loan',
  'first-contraband',
  'first-port',
  'first-explore',
] as const;

/**
 * Boot the cockpit on the fixture.
 *
 * The init script writes the save ONLY IF the slot is empty. That guard is what
 * makes `page.reload()` a real reload later on: an unconditional write would
 * restore the pre-death fixture on every navigation and quietly turn the
 * durable-counter assertion into a tautology.
 *
 * `sq.onboarding.v1` is pre-marked as seen — the same CLIENT-side presentation
 * key a returning player already carries. The combat coach mounts INSIDE the
 * overlay and can occlude the stance buttons; chasing it mid-fight is precisely
 * the kind of timing-sensitive dance this task's flake gate exists to keep out
 * of the suite. No game state is touched by it.
 */
async function boot(page: Page, game: GameState, seed: number): Promise<void> {
  const save = createSave(game, seed);
  const seen = Object.fromEntries(COACH_IDS.map((id) => [id, true]));
  await page.addInitScript(
    ([blob, coaches]) => {
      if (!window.localStorage.getItem('sq.save.v1')) {
        window.localStorage.setItem('sq.save.v1', blob);
      }
      window.localStorage.setItem('sq.onboarding.v1', JSON.stringify(coaches));
    },
    [save, seen] as [string, Record<string, true>],
  );
  await page.goto('/');
  await expect(page.getByTestId('hand')).toBeVisible();
}

// ---- small DOM readers (this spec's own — `support/career.ts` is byte-frozen
// around the seed-21 pin and is deliberately neither edited nor imported here)

function toNumber(text: string | null): number {
  return Number.parseInt((text ?? '').replace(/[^\d-]/g, ''), 10);
}

async function readCredits(page: Page): Promise<number> {
  return toNumber(await page.getByTestId('credits').textContent());
}

/** Read a rendered credit figure as a NUMBER. Deliberately never string-compares
 *  a `toLocaleString()` result: the spec runs in Node and the page renders in
 *  Chromium, and two different default locales would group digits differently —
 *  a portability flake, in the one spec whose job is to have none. */
async function readCreditText(page: Page, testId: string): Promise<number> {
  return toNumber(await page.getByTestId(testId).textContent());
}

/** The Guild marker still outstanding, off the bezel chip; 0 once cleared. */
async function readDebt(page: Page): Promise<number> {
  const chip = page.getByTestId('debt-chip');
  if ((await chip.count()) === 0) return 0;
  const matched = /DEBT\s+([\d,]+)/.exec((await chip.textContent()) ?? '');
  return matched ? toNumber(matched[1]) : 0;
}

async function readDay(page: Page): Promise<number> {
  return toNumber(await page.getByTestId('day').textContent());
}

async function readDockedAt(page: Page): Promise<string> {
  return ((await page.getByTestId('docked-at').textContent()) ?? '').trim();
}

async function readFuel(page: Page): Promise<number> {
  const raw = (await page.getByTestId('fuel-hold').textContent()) ?? '';
  return toNumber(raw.split('/')[0]);
}

interface DieRef {
  index: number;
  value: number;
}

async function unspentDice(page: Page, testId: 'die' | 'combat-die'): Promise<DieRef[]> {
  return page.getByTestId(testId).evaluateAll((els) =>
    els
      .map((el, index) => ({
        index,
        spent: el.getAttribute('data-spent') === '1',
        value: Number(
          el.getAttribute('data-die-value') ??
            /value (\d+)/.exec(el.getAttribute('aria-label') ?? '')?.[1] ??
            '0',
        ),
      }))
      .filter((die) => !die.spent)
      .map((die) => ({ index: die.index, value: die.value })),
  );
}

async function armDie(page: Page, testId: 'die' | 'combat-die', index: number): Promise<void> {
  const die = page.getByTestId(testId).nth(index);
  await die.click();
  await expect(die).toHaveAttribute('aria-pressed', 'true');
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
      fuelCost: Number(el.getAttribute('data-fuel-cost') ?? '0'),
      dc: Number(el.getAttribute('data-dc') ?? '99'),
      pods: Number(el.getAttribute('data-pods') ?? '0'),
      contraband: el.getAttribute('data-contraband') === '1',
    })),
  );
}

/** Read one ship component row's structural strength / condition. */
async function readComponent(page: Page, id: string): Promise<{ str: number; cond: number }> {
  const row = page.locator(`[data-testid="ship-component"][data-component="${id}"]`);
  await expect(row).toHaveCount(1);
  return {
    str: Number(await row.getAttribute('data-strength')),
    cond: Number(await row.getAttribute('data-condition')),
  };
}

/** Open Records on a tab, run a read against the live pane, then close it. All
 *  of this is RNG-free, so it costs the pin nothing. */
async function inRecords(
  page: Page,
  tab: 'registry' | 'nemesis',
  read: () => Promise<void>,
): Promise<void> {
  await page.getByTestId('records-toggle').click();
  await page.getByTestId(`records-tab-${tab}`).click();
  await expect(page.getByTestId(tab === 'registry' ? 'registry' : 'nemesis')).toBeVisible();
  await read();
  await page.getByTestId('records-close').click();
  await expect(page.getByTestId('records-overlay')).toHaveCount(0);
}

/** THE CONTRACT RULE. Every input is read off the row's own `data-*`: skip
 *  contraband, skip anything the hold cannot carry or the tank cannot reach,
 *  then take the lowest PILOT DC (tiebreak: cheapest jump, then board order).
 *  Deterministic, and it is exactly the rule the seed hunt replayed. */
function pickContract(rows: ContractRow[], fuel: number, pods: number): ContractRow {
  const viable = rows.filter((r) => !r.contraband && r.pods <= pods && r.fuelCost <= fuel);
  expect(viable.length, 'the pinned board must offer at least one flyable job').toBeGreaterThan(0);
  return viable.sort((a, b) => a.dc - b.dc || a.fuelCost - b.fuelCost || a.index - b.index)[0];
}

test.describe.configure({ mode: 'parallel' });

test(
  'a hull holed in combat passes the licence to a successor',
  { tag: '@tour-one' },
  async ({ page }) => {
    await boot(page, wreckedCareer(DEATH_SEED), DEATH_SEED);

    // ---- the scenario, read off the cockpit before a single decision --------
    expect(await readDay(page)).toBe(12);
    const origin = await readDockedAt(page);
    expect(origin).toBe('Antares-5');
    expect(await readCredits(page)).toBe(SCENARIO_CREDITS);
    expect(await readDebt(page)).toBe(GUILD_MARKER);
    // The scenario's worn hull, read structurally — a tier-1 plate on its last
    // point of condition. This is what the junker reset is measured against.
    expect(await readComponent(page, 'hull')).toEqual({ str: 10, cond: 1 });

    // ---- sign a job off the manifest (a real click, and the reason the cargo
    //      forfeit below is a real forfeit rather than a fabricated one) -------
    const pods = toNumber(await page.getByTestId('ship-pods').textContent());
    const rows = await readContracts(page);
    const pick = pickContract(rows, await readFuel(page), pods);

    const dawn = await unspentDice(page, 'die');
    await armDie(page, 'die', lowest(dawn).index);
    await page.getByTestId('contract').nth(pick.index).click();
    await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
    const cargoSigned = (
      (await page.getByTestId('active-contract').locator('.goods').textContent()) ?? ''
    ).trim();
    expect(cargoSigned.length).toBeGreaterThan(0);

    // ---- the registry as it stood before the loss ---------------------------
    let deedsBefore = '';
    let rankBefore = '';
    await inRecords(page, 'registry', async () => {
      deedsBefore = ((await page.getByTestId('registry-deed-count').textContent()) ?? '').trim();
      rankBefore = ((await page.getByTestId('registry-rank').textContent()) ?? '').trim();
      // A first-run spacer is never told about a counter that reads zero.
      await expect(page.getByTestId('registry-successions')).toHaveCount(0);
      await expect(page.getByTestId('alliance-standing-league')).toHaveText(`+${LEAGUE_STANDING}`);
    });

    // ---- plot the jump and commit it ---------------------------------------
    const creditsBefore = await readCredits(page);
    const node = page.locator(
      `[data-testid="starmap-system"][data-system-id="${pick.destination}"]`,
    );
    await expect(node).toHaveAttribute('data-reachable', '1');
    await node.click();
    await expect(page.getByTestId('route-preview')).toBeVisible();

    const forJump = await unspentDice(page, 'die');
    await armDie(page, 'die', highest(forJump).index);
    await page.getByTestId('confirm-jump').click();
    await expect(page.getByTestId('route-preview')).toHaveCount(0);

    // ---- intercepted ------------------------------------------------------
    const overlay = page.getByTestId('combat-overlay');
    await expect(overlay).toBeVisible();
    const enemyName = ((await page.getByTestId('combat-enemy-name').textContent()) ?? '').trim();
    expect(enemyName).toBe('Lucky Seven');

    const notice = page.getByTestId('succession-notice');
    for (let round = 0; round < 5; round += 1) {
      if ((await notice.count()) > 0) break;
      const dice = await unspentDice(page, 'combat-die');
      expect(dice.length, 'the hand must outlast the fight on the pinned seed').toBeGreaterThan(0);
      await armDie(page, 'combat-die', lowest(dice).index);
      await page.getByTestId('combat-fight').click();
      // Poll on a state CHANGE, never a timeout: either the ship is gone or the
      // round burned its die and a fresh round opened.
      await expect
        .poll(async () => {
          if ((await notice.count()) > 0) return 'dead';
          return String((await unspentDice(page, 'combat-die')).length);
        })
        .not.toBe(String(dice.length));
    }

    // ---- the death beat ----------------------------------------------------
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('data-reason', 'combat-defeat');
    // The engine event carries an interceptor ID; the notice names the ship that
    // did it — the same name the overlay showed a moment ago.
    await expect(page.getByTestId('succession-lost-to')).toHaveText(enemyName);
    await expect(page.getByTestId('succession-lost-to')).toHaveAttribute(
      'data-lost-to',
      'npc-lucky-seven',
    );
    expect(await readCreditText(page, 'succession-inherited-credits')).toBe(
      Math.floor(creditsBefore / 2),
    );
    expect(await readCreditText(page, 'succession-debt')).toBe(GUILD_MARKER);
    await expect(page.getByTestId('succession-count')).toHaveText('1');
    await expect(page.getByTestId('succession-cargo')).toHaveText(cargoSigned);
    await expect(page.getByTestId('succession-obituary')).toContainText(
      'A successor claims the license, the charts, and the debts',
    );
    // REGRESSION PIN for the dead-copy finding this task opened with: a ship loss
    // emits no `EncounterResolved`, so it must NOT route through the combat
    // aftermath panel. The overlay is gone and the aftermath never mounted.
    await expect(overlay).toHaveCount(0);
    await expect(page.getByTestId('combat-aftermath')).toHaveCount(0);

    // Acknowledging hands the successor a playable cockpit — no soft-lock.
    await page.getByTestId('succession-ack').click();
    await expect(notice).toHaveCount(0);
    await expect(page.getByTestId('hand')).toBeVisible();
    await expect(page.getByTestId('end-day')).toBeVisible();

    // ---- the estate, item by item (PRD §5.2) -------------------------------
    // HALVED: half the bank, floored.
    expect(await readCredits(page)).toBe(Math.floor(creditsBefore / 2));
    // CARRIED: the debts. The Guild collects from the estate.
    expect(await readDebt(page)).toBe(GUILD_MARKER);
    // RESET: an empty junker — every component back to `starterShip()`.
    expect(await readComponent(page, 'hull')).toEqual({ str: 1, cond: 9 });
    expect(await readComponent(page, 'drives')).toEqual({ str: 10, cond: 9 });
    expect(await readComponent(page, 'weapons')).toEqual({ str: 1, cond: 9 });
    expect(await readComponent(page, 'lifeSupport')).toEqual({ str: 10, cond: 9 });
    await expect(page.getByTestId('ship-pods')).toHaveText('10');
    // FORFEITED: the cargo went down with the ship.
    await expect(page.getByTestId('active-contract-empty')).toBeVisible();
    // CARRIED: the charts and the Signal — knowledge death never takes.
    await inRecords(page, 'nemesis', async () => {
      await expect(page.getByTestId('nemesis-count')).toContainText('1 FRAGMENT');
      await expect(
        page.locator(`[data-testid="nemesis-fragment"][data-fragment-id="${HELD_FRAGMENT}"]`),
      ).toHaveCount(1);
    });
    // CARRIED: the Deeds, the name, and the standing that attaches to it — plus
    // the new record of the loss itself.
    await inRecords(page, 'registry', async () => {
      await expect(page.getByTestId('registry-deed-count')).toHaveText(deedsBefore);
      await expect(page.getByTestId('registry-rank')).toHaveText(rankBefore);
      await expect(page.getByTestId('alliance-standing-league')).toHaveText(`+${LEAGUE_STANDING}`);
      await expect(page.getByTestId('registry-successions')).toContainText('1');
    });
    // TOWED HOME: the successor claims the licence where the wreck came in — the
    // ORIGIN of the interrupted jump, never the destination it never reached.
    expect(await readDockedAt(page)).toBe(origin);
    expect(pick.destination).not.toBe(ORIGIN_SYSTEM);

    // SUCCESSION CONSUMES THE DAY: the hand dies with the ship, the date does not
    // move, and ending the day deals the successor a fresh dawn.
    const spentFlags = await page
      .getByTestId('die')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-spent')));
    expect(spentFlags.every((flag) => flag === '1')).toBe(true);
    expect(await readDay(page)).toBe(12);

    // THE WIRE TELLS THE STORY — the engine's own obituary, not UI prose.
    await page.getByTestId('wire-log-toggle').click();
    await expect(page.getByTestId('wire-log')).toBeVisible();
    await expect(
      page.getByTestId('wire-entry').filter({ hasText: 'A successor claims the license' }),
    ).toHaveCount(1);
    await page.getByTestId('wire-log-close').click();

    await page.getByTestId('end-day').click();
    await expect.poll(async () => readDay(page)).toBe(13);
    const freshHand = await unspentDice(page, 'die');
    expect(freshHand.length, 'the successor rolls a fresh dawn hand').toBeGreaterThan(0);

    // ---- the DURABLE reader ------------------------------------------------
    // The notice is a moment and is deliberately not persisted; the counter is.
    // A real reload (the init script above refuses to overwrite a live save)
    // proves `player.legacy.successionCount` is state, not a modal.
    await page.reload();
    await expect(page.getByTestId('hand')).toBeVisible();
    await inRecords(page, 'registry', async () => {
      await expect(page.getByTestId('registry-successions')).toContainText('1');
    });
    await expect(page.getByTestId('succession-notice')).toHaveCount(0);
  },
);

test(
  'life support failing at dusk passes the licence to a successor',
  { tag: '@tour-one' },
  async ({ page }) => {
    // The second death path, and the reason the notice is mounted OUTSIDE the
    // combat overlay: nothing is intercepting this ship. It simply runs out of
    // air at dusk, loses its GRIT survival roll (`day.ts` LIFE_SUPPORT_SURVIVAL_DC)
    // and never sees the dawn. If the notice were wired only into `combat()`,
    // this test would fail — which is exactly its job.
    await boot(
      page,
      wreckedCareer(LIFE_SUPPORT_SEED, { lifeSupportCritical: true }),
      LIFE_SUPPORT_SEED,
    );

    expect(await readCredits(page)).toBe(SCENARIO_CREDITS);
    expect(await readComponent(page, 'lifeSupport')).toEqual({ str: 10, cond: 0 });
    await expect(page.getByTestId('combat-overlay')).toHaveCount(0);

    await page.getByTestId('end-day').click();

    const notice = page.getByTestId('succession-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('data-reason', 'life-support-failure');
    await expect(page.getByTestId('succession-lost-to')).toHaveAttribute(
      'data-lost-to',
      'life-support-failure',
    );
    // Nothing was in the hold, so the estate lists no forfeited cargo.
    await expect(page.getByTestId('succession-cargo')).toHaveCount(0);
    expect(await readCreditText(page, 'succession-inherited-credits')).toBe(
      Math.floor(SCENARIO_CREDITS / 2),
    );

    await page.getByTestId('succession-ack').click();
    await expect(notice).toHaveCount(0);

    // The same three estate terms, not the whole table again (test 1 owns that).
    expect(await readCredits(page)).toBe(Math.floor(SCENARIO_CREDITS / 2));
    expect(await readDebt(page)).toBe(GUILD_MARKER);
    expect(await readComponent(page, 'hull')).toEqual({ str: 1, cond: 9 });
    expect(await readComponent(page, 'lifeSupport')).toEqual({ str: 10, cond: 9 });
    // Dusk still rolled into a fresh dawn under the successor.
    expect(await readDay(page)).toBe(13);
    await expect(page.getByTestId('end-day')).toBeVisible();
  },
);
