import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSave, loadSave, type GameState } from '@spacerquest/engine';
import { shipComponents, specialEquipmentRows } from '../format';
import { storage } from '../storage';
import {
  abandonContract,
  borrowLoan,
  buyFuel,
  buyPort,
  combat,
  darePeek,
  dismissCrew,
  explore,
  getSnapshot,
  haggleContract,
  hireCrew,
  loadSlot,
  newGame,
  repayLoan,
  resolveStorylet,
  selectDie,
  shipyard,
  signContract,
  travelTo,
  visitDare,
  visitSocial,
} from '../store';

// ---------------------------------------------------------------------------
// T-196c · THE UI SIDE OF THE M17 FREE ACTIONS.
//
// `docs/DAWN-HAND-REDESIGN.md` §3 freed ten administrative verbs — Trade
// buy-fuel / sign-contract / abandon-contract, all four Shipyard kinds, Crew
// hire and dismiss, and the Port buy. T-196a freed them in the ENGINE; T-196b
// taught the instruments; this suite is the UI's half, and it asserts the three
// things the task block names:
//
//   1. an EMPTY hand still reaches every freed flow end to end,
//   2. a freed action never DISARMS the die queued for a Main Action, and
//   3. every Main Action still demands a die exactly as before.
//
// WHY THESE ARE STORE TESTS AND NOT RENDERED-DOM TESTS. This repo has no
// `@testing-library/react` and no jsdom environment — `vitest.config.ts` pins
// `environment: 'node'`, and the pane suites (`ship-diagram.test.ts`,
// `manifest-board.test.ts`, `port-ledger-fascia.test.ts`) are all selector tests
// over `format.ts`. The rendered `disabled` / `title` layer is covered by the
// Playwright specs (`manifest-trade`, `derule`, `shipyard`, `port-ledger`).
// What lives HERE is the layer the task block calls "the real gate": the store
// creators. Each case names the pane it stands for:
//
//   · buyFuel / abandonContract / buyPort  → TradePane   (App.tsx TradePane)
//   · signContract                         → Manifest    (App.tsx Manifest)
//   · shipyard × 4 / hireCrew / dismissCrew → ShipPane    (App.tsx ShipPane + CrewSection)
//
// Same node-environment discipline as `playtest-log.test.ts`: `storage.ts`
// resolves to its in-memory fallback and `sound` is inert, so the store can be
// driven exactly as a keypress would drive it.
// ---------------------------------------------------------------------------

const SEED = 424242;

/** The slot key format `store.ts` writes (`SLOT_KEY`), used to hand the store a
 *  pre-built career through its own load path rather than mutating a snapshot
 *  the store believes is immutable. */
const SLOT = 'sq.slot.9.v1';

/**
 * Boot a career with the headroom the freed verbs need, injected through the
 * store's REAL `loadSlot` seam (a save envelope round-tripped by the engine's
 * own `createSave`/`loadSave`), so nothing here reaches around the store.
 *
 * The figures mirror `packages/engine/src/__tests__/spend-die-rerolls.test.ts`'s
 * `T-196a · the M17 Free Actions consume no die` block: credits to afford the
 * yard and the port, a cabin big enough to berth crew, a damaged weapon so
 * `repair` has something to repair, and pod room under the hull ceiling so
 * `buy-cargo-pods` really lands.
 */
function richCareer(extra: (g: GameState) => void = () => {}): void {
  newGame(SEED);
  // Round-trip through the save envelope to get a mutable copy the store does
  // not already hold a reference to.
  const game = loadSave(createSave(getSnapshot().game, SEED)).state;
  game.player.credits = 500_000;
  game.player.ship.fuel = 1;
  game.player.ship.cabin.strength = 30;
  game.player.ship.weapons = { strength: 3, condition: 2 };
  game.player.ship.hull = { strength: 1, condition: 9 };
  game.player.ship.cargoPods = 5;
  extra(game);
  storage.setItem(SLOT, createSave(game, SEED));
  loadSlot(9);
}

/**
 * Burn the whole dawn hand, so the follow-up verbs run against a GENUINELY empty
 * hand rather than merely an unarmed one — "with an EMPTY hand" is the accept
 * clause's actual wording, and `selectedDie === null` alone would not prove it.
 *
 * `explore()` is the burner because `resolveExploration` spends the die BEFORE
 * its fuel gate (`packages/engine/src/actions/exploration.ts`), so every
 * iteration consumes one regardless of the tank, and exploration never opens an
 * encounter — so no `ActionBlocked{active-encounter}` can poison what follows.
 */
function exhaustHand(): void {
  const n = getSnapshot().game.player.dawnHand!.dice.length;
  for (let i = 0; i < n; i++) {
    selectDie(i);
    explore();
  }
  const hand = getSnapshot().game.player.dawnHand!;
  expect(hand.spent.every(Boolean)).toBe(true);
  expect(getSnapshot().selectedDie).toBeNull();
}

/** The notice the retired UI gates used to raise. No freed flow may produce it. */
const DIE_DEMAND = /Pick a die/;

/** The drives' next buyable tier, read through the SAME selector the ship pane's
 *  Upgrade button reads (`shipComponents`) rather than guessed from strength. */
function nextDrivesTier(): number {
  const drives = shipComponents(getSnapshot().game).find((c) => c.id === 'drives')!;
  return drives.nextTier!;
}

function expectNoDieDemand(): void {
  expect(getSnapshot().notice ?? '').not.toMatch(DIE_DEMAND);
}

// ---------------------------------------------------------------------------

describe('T-196c · an EMPTY hand still reaches all ten freed flows', () => {
  beforeEach(() => {
    richCareer();
    exhaustHand();
  });

  it('TradePane · buy-fuel tops up the tank with no die left in the hand', () => {
    const before = getSnapshot().game.player.ship.fuel;
    buyFuel(20);
    expect(getSnapshot().game.player.ship.fuel).toBeGreaterThan(before);
    expectNoDieDemand();
  });

  it('Manifest · sign-contract and TradePane · abandon-contract both land', () => {
    expect(getSnapshot().game.market.manifestBoard.length).toBeGreaterThan(0);
    signContract(0);
    expect(getSnapshot().game.player.activeContract).not.toBeNull();
    expectNoDieDemand();

    abandonContract();
    expect(getSnapshot().game.player.activeContract).toBeNull();
    expectNoDieDemand();
  });

  it('ShipPane · all four yard orders land (repair, pods, tier, equipment)', () => {
    // All four kinds share ONE resolver, so all four are driven — a per-kind
    // regression could not hide behind the shared path.
    const podsBefore = getSnapshot().game.player.ship.cargoPods;
    shipyard({ action: 'buy-cargo-pods', quantity: 1 });
    expect(getSnapshot().game.player.ship.cargoPods).toBe(podsBefore + 1);
    expectNoDieDemand();

    expect(getSnapshot().game.player.ship.weapons.condition).toBeLessThan(9);
    shipyard({ action: 'repair', repairMode: 'all' });
    expect(getSnapshot().game.player.ship.weapons.condition).toBe(9);
    expectNoDieDemand();

    const drivesBefore = getSnapshot().game.player.ship.drives.strength;
    shipyard({ action: 'buy-component-tier', component: 'drives', tier: nextDrivesTier() });
    expect(getSnapshot().game.player.ship.drives.strength).toBeGreaterThan(drivesBefore);
    expectNoDieDemand();

    // Read ownership through the SAME selector the equipment list renders from.
    const cloakerOwned = (): boolean =>
      specialEquipmentRows(getSnapshot().game).find((r) => r.id === 'CLOAKER')!.owned;
    expect(cloakerOwned()).toBe(false);
    shipyard({ action: 'buy-special-equipment', equipment: 'CLOAKER' });
    expect(cloakerOwned()).toBe(true);
    expectNoDieDemand();
  });

  it('ShipPane · CrewSection hires and dismisses with an empty hand', () => {
    hireCrew('crew-second');
    expect(getSnapshot().game.player.crew.some((c) => c.roleId === 'crew-second')).toBe(true);
    expectNoDieDemand();

    dismissCrew('crew-second');
    expect(getSnapshot().game.player.crew.some((c) => c.roleId === 'crew-second')).toBe(false);
    expectNoDieDemand();
  });

  it('TradePane · the port stake is bought with an empty hand', () => {
    buyPort();
    expect(getSnapshot().game.player.ports).toHaveLength(1);
    expectNoDieDemand();
  });
});

// ---------------------------------------------------------------------------

/**
 * THE NAMED ACCEPTANCE TEST. A Free Action must neither require, consume nor
 * DISARM the die a player armed for their next Main Action — "buying fuel
 * silently dropping your jump die is the UX regression this clause exists to
 * prevent" (T-196c). `shipyard` is the regression this exists for specifically:
 * until T-196c it cleared `selectedDie` and bloomed the die UNCONDITIONALLY,
 * which after T-196a freed the yard was a visual lie about a die it never
 * touched.
 */
describe('T-196c · a Free Action never disarms the die queued for a Main Action', () => {
  /** Run one freed verb and assert the armed die came through it untouched. */
  function expectDieSurvives(label: string, run: () => void): void {
    run();
    const s = getSnapshot();
    expect(s.selectedDie, `${label} disarmed the queued die`).toBe(0);
    expect(s.game.player.dawnHand!.spent[0], `${label} consumed the queued die`).toBe(false);
    expect(s.bloomDie, `${label} bloomed a die it never spent`).not.toBe(0);
    expect(s.notice ?? '').not.toMatch(DIE_DEMAND);
  }

  it('survives every one of the seven freed store creators, and is still spendable after', () => {
    richCareer();
    selectDie(0);
    expect(getSnapshot().selectedDie).toBe(0);

    expectDieSurvives('buyFuel', () => buyFuel(20));
    expectDieSurvives('signContract', () => signContract(0));
    expectDieSurvives('abandonContract', () => abandonContract());
    expectDieSurvives('shipyard · buy-cargo-pods', () =>
      shipyard({ action: 'buy-cargo-pods', quantity: 1 }),
    );
    expectDieSurvives('shipyard · repair', () => shipyard({ action: 'repair', repairMode: 'all' }));
    expectDieSurvives('shipyard · buy-component-tier', () =>
      shipyard({ action: 'buy-component-tier', component: 'drives', tier: nextDrivesTier() }),
    );
    expectDieSurvives('shipyard · buy-special-equipment', () =>
      shipyard({ action: 'buy-special-equipment', equipment: 'CLOAKER' }),
    );
    expectDieSurvives('hireCrew', () => hireCrew('crew-second'));
    expectDieSurvives('dismissCrew', () => dismissCrew('crew-second'));
    expectDieSurvives('buyPort', () => buyPort());

    // NOT VACUOUS: the ten verbs really landed, so "the die survived" is a claim
    // about actions that happened rather than about ten no-ops.
    const after = getSnapshot().game.player;
    expect(after.ports).toHaveLength(1);
    expect(after.activeContract).toBeNull(); // signed, then abandoned
    expect(after.ship.weapons.condition).toBe(9); // repaired
    expect(specialEquipmentRows(getSnapshot().game).find((r) => r.id === 'CLOAKER')!.owned).toBe(
      true,
    );

    // ...and the die was not merely still SELECTED, it was still USABLE: the
    // Main Action it was armed for spends it.
    explore();
    expect(getSnapshot().game.player.dawnHand!.spent[0]).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('T-196c · every Main Action still demands a die exactly as before', () => {
  beforeEach(() => {
    richCareer();
    expect(getSnapshot().selectedDie).toBeNull();
  });

  /** Each Main Action, driven with NOTHING armed. The refusal must be the store's
   *  own armed-die gate — a visible notice, and a hand nobody touched. */
  const MAIN_ACTIONS: readonly [string, () => void][] = [
    ['haggleContract', () => haggleContract(0)],
    ['travelTo', () => travelTo(getSnapshot().game.player.currentSystemId + 1)],
    ['explore', () => explore()],
    // T-197 · `visitDare`, `visitSocial`, `borrowLoan` and `repayLoan` LEFT THIS
    // LIST — all seven Hangout venues are Free Actions now
    // (docs/DAWN-HAND-REDESIGN.md §3), so none of them refuses for want of a die.
    // Their new behaviour is asserted in the T-197 block below, and the manifest
    // guard at the bottom of this file enforces the removal in both directions.
    // `darePeek` STAYS: it is the one Hangout-family verb that is still a Main
    // Action, still spends a die, and still refuses without one (§3's ruling).
    ['darePeek', () => darePeek()],
    ['combat', () => combat('fight')],
    ['resolveStorylet', () => resolveStorylet('any-storylet', 'any-choice', true)],
  ];

  for (const [name, run] of MAIN_ACTIONS) {
    it(`${name} refuses without a die and leaves the hand untouched`, () => {
      const before = [...getSnapshot().game.player.dawnHand!.spent];
      run();
      expect(getSnapshot().notice ?? '').toMatch(DIE_DEMAND);
      expect(getSnapshot().game.player.dawnHand!.spent).toEqual(before);
    });
  }
});

// ---------------------------------------------------------------------------

/**
 * T-197 · THE UI SIDE OF THE FREED HANGOUT (`docs/DAWN-HAND-REDESIGN.md` §3/§4a).
 *
 * The four Hangout store creators the cockpit reaches — `visitDare`,
 * `visitSocial`, `borrowLoan`, `repayLoan` — join the seven above: none requires,
 * consumes or DISARMS a die. `darePeek` is deliberately NOT here; it is still a
 * Main Action and is covered by the gate block above.
 *
 * The FIXTURE MATTERS: `richCareer` starts the captain at Sol-3, which runs a
 * Hangout and seats co-located roaming captains, so these are real resolutions
 * rather than typed refusals — the same non-vacuity discipline the seven-verb test
 * above keeps.
 */
describe('T-197 · the freed Hangout verbs neither require nor disarm a die', () => {
  /** The first roaming captain actually seated at the player's port. */
  function seatedOpponent(): string {
    const game = getSnapshot().game;
    const npc = game.npcs.find((n) => !n.dead && n.currentSystemId === game.player.currentSystemId);
    expect(npc, 'fixture: no co-located captain at the starting Hangout').toBeDefined();
    return npc!.id;
  }

  it('all four resolve with an EMPTY hand and never raise the die demand', () => {
    richCareer();
    exhaustHand();
    const opponent = seatedOpponent();

    // A social beat lands: the disposition moved, on a hand with nothing left.
    const before = getSnapshot().game.npcs.find((n) => n.id === opponent)!.disposition;
    visitSocial('insult', opponent);
    expect(getSnapshot().notice ?? '').not.toMatch(DIE_DEMAND);
    expect(getSnapshot().game.npcs.find((n) => n.id === opponent)!.disposition).toBeLessThan(
      before,
    );

    // The desk opens and settles, on the same empty hand.
    borrowLoan(500);
    expect(getSnapshot().game.player.loan?.outstanding).toBe(500);
    expect(getSnapshot().notice ?? '').not.toMatch(DIE_DEMAND);
    repayLoan(500);
    expect(getSnapshot().game.player.loan).toBeNull();
    expect(getSnapshot().notice ?? '').not.toMatch(DIE_DEMAND);

    // …and so does a hand of Liar's Dice.
    visitDare(opponent, 100);
    expect(getSnapshot().game.dareHand).not.toBeNull();
    expect(getSnapshot().notice ?? '').not.toMatch(DIE_DEMAND);

    // The hand is still exactly exhausted — nothing un-spent, nothing spent twice.
    expect(getSnapshot().game.player.dawnHand!.spent.every(Boolean)).toBe(true);
  });

  it('a queued die survives every one of the four, unbloomed', () => {
    richCareer();
    const opponent = seatedOpponent();
    selectDie(0);
    expect(getSnapshot().selectedDie).toBe(0);

    for (const [label, run] of [
      ['visitSocial', () => visitSocial('meet', opponent)],
      ['borrowLoan', () => borrowLoan(500)],
      ['repayLoan', () => repayLoan(500)],
      ['visitDare', () => visitDare(opponent, 100)],
    ] as const) {
      run();
      const snap = getSnapshot();
      expect(snap.selectedDie, `${label} disarmed the queued die`).toBe(0);
      expect(snap.game.player.dawnHand!.spent[0], `${label} consumed the queued die`).toBe(false);
      expect(snap.bloomDie, `${label} bloomed a die it never spent`).not.toBe(0);
      expect(snap.notice ?? '').not.toMatch(DIE_DEMAND);
    }

    // …and the die is still USABLE afterwards, not merely still selected.
    darePeek();
    expect(getSnapshot().game.player.dawnHand!.spent[0]).toBe(true);
  });
});

// ---------------------------------------------------------------------------

/**
 * DRIFT GUARD, mirroring `spend-die-rerolls.test.ts`'s `T-182 · the spendDie
 * caller manifest`. The set of store creators that REFUSE without an armed die
 * is load-bearing in both directions: a freed verb that re-acquires a gate
 * silently re-breaks T-196c, and a new Main Action that arrives ungated spends a
 * die nobody armed. Scanning the source is what stops either from landing
 * untested.
 */
describe('T-196c · the armed-die gate manifest', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const SOURCE = readFileSync(join(HERE, '..', 'store.ts'), 'utf8');

  /** Every exported store creator that raises the "Pick a die …" refusal. These
   *  and ONLY these may demand an armed die.
   *
   *  T-197 REMOVED FOUR OF THE FIVE HANGOUT ENTRIES that T-196c left here for it:
   *  `visitDare`, `visitSocial`, `borrowLoan` and `repayLoan` are Free Actions now
   *  (docs/DAWN-HAND-REDESIGN.md §3) and appear in `FREED` below instead.
   *  `darePeek` STAYS — Peek is the one real check inside an open hand and stayed
   *  a Main Action by ruling, so it is the only Hangout-family verb left on this
   *  side of the list. */
  const GATED: readonly string[] = [
    'haggleContract',
    'travelTo',
    'explore',
    'darePeek',
    'combat',
    'resolveStorylet',
  ];

  /** The M17 Free Actions, by the store creator that sends each one. T-197 added
   *  the four Hangout senders to this side of the manifest. */
  const FREED: readonly string[] = [
    'signContract',
    'abandonContract',
    'buyFuel',
    'hireCrew',
    'dismissCrew',
    'buyPort',
    'shipyard',
    'visitDare',
    'visitSocial',
    'borrowLoan',
    'repayLoan',
  ];

  /** Split the source into `export function NAME(...) { … }` chunks. */
  function creatorBodies(): Map<string, string> {
    const bodies = new Map<string, string>();
    const parts = SOURCE.split(/^export (?:async )?function /m).slice(1);
    for (const part of parts) {
      const name = part.slice(0, part.indexOf('('));
      bodies.set(name, part);
    }
    return bodies;
  }

  it('exactly the Main Actions refuse without an armed die', () => {
    const gated = [...creatorBodies()]
      .filter(([, body]) => /Pick a die/.test(body))
      .map(([name]) => name)
      .sort();
    expect(gated).toEqual([...GATED].sort());
  });

  it('no freed creator reads, clears or blooms the selection', () => {
    const bodies = creatorBodies();
    for (const name of FREED) {
      const body = bodies.get(name);
      expect(body, `${name} is no longer an exported store creator`).toBeDefined();
      // Comments explaining the ABSENCE are expected and welcome; code is not.
      const code = body!
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, `${name} reads state.selectedDie`).not.toMatch(/state\.selectedDie/);
      expect(code, `${name} writes selectedDie`).not.toMatch(/selectedDie\s*:/);
      expect(code, `${name} writes bloomDie`).not.toMatch(/bloomDie\s*:/);
    }
  });
});
