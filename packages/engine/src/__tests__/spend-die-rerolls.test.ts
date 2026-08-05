import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPLORE_VALUE_BANDS } from '@spacerquest/content';
import { applyPlayerAction, startDay } from '../day.js';
import { createInitialState } from '../state.js';
import { refreshAvailableStorylets } from '../storylets.js';
import type { EncounterState, GameState, PlayerAction } from '../types.js';

/**
 * T-182 · F-156-1 — THE ASSIGN-THE-RETURNED-HAND CALL-SITE SWEEP.
 *
 * `dice.ts` `spendDie` used to rebuild the hand as `{ dice, spent }`, silently
 * dropping the `rerollsRemaining` field T-1306 added. Every call site that
 * ASSIGNS the returned hand back onto the save therefore destroyed the day's
 * re-roll charges with the FIRST die the player spent — and `actions/crew.ts`
 * `resolveReroll` then refused with `no-charge` for a charge the player had hired
 * (`content/crew.ts` `crew-navigator`) or recovered
 * (`EXPLORE_MODULE_DICE_BENEFITS` `module-marked-ephemeris`).
 *
 * THE UNIT TESTS IN `dice.test.ts` ARE NOT ENOUGH, which is exactly why this file
 * exists: `spendDie` was always fine in isolation, and the defect only showed
 * once a caller assigned the result back. So every case below drives a REAL
 * action through `applyPlayerAction` (or the one resolver that is not a player
 * verb), out of a hand `startDay` actually dealt, against a charge granted by the
 * REAL crew path — no hand-poking of `rerollsRemaining` anywhere in this file.
 *
 * Each case asserts BOTH halves, so a case cannot pass by no-opping:
 *   1. the die really was spent, and
 *   2. the charge survived.
 */

/** Build a DAY-phase state carrying ONE crew-granted re-roll charge. The charge
 *  comes from `crew-navigator`'s `{ kind: 'reroll' }` benefit through
 *  `dawnDiceModifiers` → `rollDawnHand`, never from an assignment. */
function chargedDay(seed: number, mutate?: (state: GameState) => void): GameState {
  const state = createInitialState(seed);
  state.player.crew = [{ roleId: 'crew-navigator', hiredDay: 1 }];
  mutate?.(state);
  const day = startDay(state).state;
  // The premise of every case below. If the grant path ever stops granting, these
  // tests must fail loudly here rather than silently asserting `0 === 0`.
  expect(day.player.dawnHand!.rerollsRemaining).toBe(1);
  return day;
}

function firstUnspent(state: GameState): number {
  return state.player.dawnHand!.spent.findIndex((s) => !s);
}

/** The premise plus both halves of the claim, in one place. */
function expectChargeSurvivedSpend(before: GameState, after: GameState): void {
  const from = before.player.dawnHand!;
  const to = after.player.dawnHand!;
  const newlySpent = to.spent.filter((s, i) => s && !from.spent[i]).length;
  expect(newlySpent).toBeGreaterThanOrEqual(1); // the die really was spent
  expect(to.rerollsRemaining).toBe(1); // …and the charge survived it
}

function fixtureEncounter(): EncounterState {
  return {
    id: 'enc-t182',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'anon-pirate-1',
      source: 'anonymous',
      name: 'K)(akj',
      shipName: 'K1++++',
      shipClass: 'Maligna Bat',
      homeSystem: 'Pollux-7',
      kind: 'PIRATE',
      rosterIndex: 1,
      stats: { PILOT: 1, GUNS: 0, TRADE: 0, GRIT: 0, GUILE: 1 },
      tier: 1,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.08,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
  };
}

describe('T-182 · a spent die never destroys the day’s re-roll charge', () => {
  // T-196a · `Trade · buy-fuel`, `Trade · sign-contract` and `Trade · abandon-contract`
  // USED TO LIVE HERE. They are not deleted coverage — they MOVED, to the
  // "M17 Free Actions" describe at the bottom of this file, which now asserts the
  // opposite property (no die is consumed at all). The same is true of
  // `Shipyard · buy-component-tier`, `Crew` and `Port`.

  /** `actions/trade.ts` — the `haggle` arm, the trade desk's ONE surviving die spend. */
  it('Trade · haggle', () => {
    const before = chargedDay(7);
    const { state: after } = applyPlayerAction(before, {
      type: 'Trade',
      action: 'haggle',
      contractIndex: 0,
      spendDie: firstUnspent(before),
    });
    expect(after.market.manifestBoard[0].haggled).toBe(true);
    expectChargeSurvivedSpend(before, after);
  });

  /** `actions/travel.ts` */
  it('Travel', () => {
    const before = chargedDay(7, (s) => {
      s.player.currentSystemId = 1;
    });
    const { state: after, events } = applyPlayerAction(before, {
      type: 'Travel',
      destinationId: 2,
      spendDie: firstUnspent(before),
    });
    expect(events.some((e) => e.type === 'TravelEvent')).toBe(true);
    expectChargeSurvivedSpend(before, after);
  });

  /** `actions/exploration.ts` */
  it('Explore', () => {
    const before = chargedDay(7);
    expect(before.player.recovery).toBeNull();
    const { state: after, events } = applyPlayerAction(before, {
      type: 'Explore',
      spendDie: firstUnspent(before),
    });
    expect(events.some((e) => e.type === 'PoiDiscovered' || e.type === 'ExplorationFailed')).toBe(
      true,
    );
    expectChargeSurvivedSpend(before, after);
  });

  /** `storylets.ts` — the Sol-3 guild auditor's `argue` choice carries a
   *  GUILE stat check, which is what makes the choice die-costed. */
  it('Storylet · a die-costed choice', () => {
    const dawn = chargedDay(110, (s) => {
      s.player.currentSystemId = 1;
    });
    const before = refreshAvailableStorylets(dawn).state;
    expect(before.storylets.available.map((o) => o.storyletId)).toContain(
      'port.sun3.guild-auditor',
    );
    const { state: after, events } = applyPlayerAction(before, {
      type: 'Storylet',
      storyletId: 'port.sun3.guild-auditor',
      choiceId: 'argue',
      spendDie: firstUnspent(before),
    });
    expect(events.some((e) => e.type === 'StatCheck')).toBe(true);
    expectChargeSurvivedSpend(before, after);
  });

  /** `actions/combat.ts` */
  it('Combat · run', () => {
    const before = chargedDay(7, (s) => {
      s.encounter = fixtureEncounter();
    });
    const { state: after, events } = applyPlayerAction(before, {
      type: 'Combat',
      stance: 'run',
      targetId: before.encounter!.interceptor.id,
      spendDie: firstUnspent(before),
    });
    expect(events.some((e) => e.type === 'CombatEvent')).toBe(true);
    expectChargeSurvivedSpend(before, after);
  });

  /**
   * `exploreOutcomes.ts` — THE SITE THE TASK BLOCK MISSED, and the only one
   * that folds the returned hand through a LOOP. Seed 9's day-1 board draws a
   * BAND-3 row (`apCost` 2), so ONE `Explore` spends three dice: the sweep's own
   * plus two more paid inside `payExtraDiceClaim`. A single-spend case would not
   * have caught a loop that dropped the field on its second iteration.
   *
   * The seed is `exploreAp.test.ts`'s pinned `SEED_BAND3`; the band is asserted
   * off the CONTENT table and the dice count off the hand, so this fails loudly
   * if the board ever stops drawing band 3 rather than silently degrading into a
   * duplicate of the plain `Explore` case above.
   */
  it('Explore · the multi-die band-3 claim payment (exploreOutcomes)', () => {
    const before = chargedDay(9);
    expect(EXPLORE_VALUE_BANDS[3].apCost).toBe(2);

    // Fly the nav check with the best die, exactly as `exploreAp.test.ts` does.
    const hand = before.player.dawnHand!;
    let best = 0;
    for (let i = 1; i < hand.dice.length; i += 1) if (hand.dice[i] > hand.dice[best]) best = i;

    const { state: after, events } = applyPlayerAction(before, { type: 'Explore', spendDie: best });

    expect(events.some((e) => e.type === 'PoiDiscovered')).toBe(true);
    expect(events.some((e) => e.type === 'ExplorationFailed')).toBe(false);
    const spentBefore = hand.spent.filter(Boolean).length;
    const spentAfter = after.player.dawnHand!.spent.filter(Boolean).length;
    expect(spentAfter - spentBefore).toBe(1 + 2); // the loop really ran twice
    expectChargeSurvivedSpend(before, after);
  });
});

/**
 * T-196a · THE OTHER HALF OF THE LEDGER — the nine M17 FREE ACTIONS consume NO die.
 *
 * `docs/DAWN-HAND-REDESIGN.md` §3 freed nine action types whose die face was never
 * read: `Trade` buy-fuel / sign-contract / abandon-contract, all four `Shipyard`
 * kinds (one shared resolver), `Crew` hire and dismiss, and the `Port` buy. The
 * manifest guard below proves they call `spendDie` nowhere in the SOURCE; this
 * block proves the same thing about BEHAVIOUR, through the real `applyPlayerAction`
 * seam — a resolver could always mark `spent[i]` by hand without going through
 * `spendDie`, and the manifest would never notice.
 *
 * Each case asserts the hand is byte-identical across the action AND that the action
 * actually did something (a success event), so no case can pass by no-opping.
 */
describe('T-196a · the M17 Free Actions consume no die', () => {
  function expectHandUntouched(before: GameState, after: GameState): void {
    expect(after.player.dawnHand!.spent).toEqual(before.player.dawnHand!.spent);
    expect(after.player.dawnHand!.dice).toEqual(before.player.dawnHand!.dice);
    expect(after.player.dawnHand!.rerollsRemaining).toBe(before.player.dawnHand!.rerollsRemaining);
  }

  it('Trade · buy-fuel', () => {
    const before = chargedDay(7, (s) => {
      s.player.credits = 5000;
      s.player.ship.fuel = 1;
    });
    const { state: after, events } = applyPlayerAction(before, {
      type: 'Trade',
      action: 'buy-fuel',
      fuelAmount: 1,
    });
    expect(events.some((e) => e.type === 'TradeEvent' && e.success)).toBe(true);
    expect(after.player.ship.fuel).toBe(before.player.ship.fuel + 1);
    expectHandUntouched(before, after);
  });

  it('Trade · sign-contract', () => {
    const before = chargedDay(7);
    expect(before.market.manifestBoard.length).toBeGreaterThan(0);
    const { state: after, events } = applyPlayerAction(before, {
      type: 'Trade',
      action: 'sign-contract',
      contractIndex: 0,
    });
    expect(events.some((e) => e.type === 'TradeEvent' && e.success)).toBe(true);
    expect(after.player.activeContract).not.toBeNull();
    expectHandUntouched(before, after);
  });

  it('Trade · abandon-contract', () => {
    const before = applyPlayerAction(chargedDay(7), {
      type: 'Trade',
      action: 'sign-contract',
      contractIndex: 0,
    }).state;
    expect(before.player.activeContract).not.toBeNull();

    const { state: after, events } = applyPlayerAction(before, {
      type: 'Trade',
      action: 'abandon-contract',
    });
    expect(events.some((e) => e.type === 'TradeEvent' && e.success)).toBe(true);
    expect(after.player.activeContract).toBeNull();
    expectHandUntouched(before, after);
  });

  // All four Shipyard kinds share ONE resolver and ONE ruling, so all four are
  // driven — a per-kind regression could not hide behind the shared path.
  const YARD_ORDERS: Extract<PlayerAction, { type: 'Shipyard' }>[] = [
    { type: 'Shipyard', action: 'repair', repairMode: 'all' },
    { type: 'Shipyard', action: 'buy-cargo-pods', quantity: 1 },
    { type: 'Shipyard', action: 'buy-component-tier', component: 'weapons', tier: 1 },
    { type: 'Shipyard', action: 'buy-special-equipment', equipment: 'CLOAKER' },
  ];
  for (const order of YARD_ORDERS) {
    it(`Shipyard · ${order.action}`, () => {
      const before = chargedDay(7, (s) => {
        s.player.credits = 200_000;
        s.player.ship.weapons = { strength: 3, condition: 2 };
        // Room under the hull's pod ceiling so `buy-cargo-pods` really lands.
        s.player.ship.hull = { strength: 1, condition: 9 };
        s.player.ship.cargoPods = 5;
      });
      const { state: after, events } = applyPlayerAction(before, order);
      expect(events.some((e) => e.type === 'ShipyardEvent')).toBe(true);
      expectHandUntouched(before, after);
    });
  }

  it('Crew · hire and dismiss', () => {
    const before = chargedDay(7, (s) => {
      s.player.credits = 20_000;
      s.player.ship.cabin.strength = 30;
    });
    const { state: hired, events: hireEvents } = applyPlayerAction(before, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
    });
    expect(hireEvents.some((e) => e.type === 'CrewEvent' && e.kind === 'hired')).toBe(true);
    expectHandUntouched(before, hired);

    const { state: after, events } = applyPlayerAction(hired, {
      type: 'Crew',
      action: 'dismiss',
      roleId: 'crew-second',
    });
    expect(events.some((e) => e.type === 'CrewEvent' && e.kind === 'dismissed')).toBe(true);
    expectHandUntouched(hired, after);
  });

  it('Port · buy', () => {
    const before = chargedDay(7, (s) => {
      s.player.credits = 500_000;
    });
    const { state: after, events } = applyPlayerAction(before, {
      type: 'Port',
      action: 'buy',
      systemId: before.player.currentSystemId,
    });
    expect(events.some((e) => e.type === 'PortEvent' && e.kind === 'purchased')).toBe(true);
    expect(after.player.ports).toHaveLength(1);
    expectHandUntouched(before, after);
  });
});

/**
 * T-182 · DRIFT GUARD. The list of `spendDie` callers is load-bearing: an
 * assign-family site that lands without a case above re-opens F-156-1 silently.
 * This scans the engine's rule sources and fails on any caller not on the
 * committed manifest, so a tenth site cannot arrive untested.
 */
describe('T-182 · the spendDie caller manifest', () => {
  /** Every `spendDie(` caller in `packages/engine/src`, by file, with the family
   *  it belongs to. Kept in sync with the CONTRACT block above `spendDie`. */
  const MANIFEST: Readonly<Record<string, { assign: number; mutate: number }>> = {
    // ASSIGN family — assigns the returned hand back. F-156-1 broke these.
    // T-196a · `actions/trade.ts` dropped from 4 to 1 (only `haggle` survives), and
    // `actions/shipyard.ts`, `actions/crew.ts` and `actions/port.ts` LEFT THE TABLE
    // ENTIRELY: M17 (docs/DAWN-HAND-REDESIGN.md §3) freed those nine action types, so
    // they call `spendDie` nowhere. This guard now runs in BOTH directions — a
    // reappearing caller fails here, and the "M17 Free Actions" describe above fails
    // if one of them starts eating a die again.
    'actions/trade.ts': { assign: 1, mutate: 0 },
    'actions/travel.ts': { assign: 1, mutate: 0 },
    'actions/exploration.ts': { assign: 1, mutate: 0 },
    'actions/combat.ts': { assign: 1, mutate: 0 },
    'storylets.ts': { assign: 1, mutate: 0 },
    'exploreOutcomes.ts': { assign: 1, mutate: 0 },
    // MUTATE-IN-PLACE family — calls for the face and the guards, then writes
    // `spent[index]` on the live hand. Safe by the copy contract, not by luck.
    //
    // T-197 · `actions/hangout.ts` IS GONE FROM THIS MANIFEST ENTIRELY, and its
    // absence is the assertion: M17's Hangout row (docs/DAWN-HAND-REDESIGN.md §3
    // as amended 2026-08-04) freed ALL SEVEN venues — dare-open, meet, befriend,
    // insult, rumor, borrow, repay — so the resolver calls `spendDie` nowhere and
    // does not touch the dawn hand at all. `actions/dare.ts` is now the ONLY
    // mutate-in-place caller left, and the one thing it spends for is PEEK, which
    // stayed a Main Action by ruling (§3: "the one real check inside an open
    // hand"). This guard runs in BOTH directions, so a Hangout venue that starts
    // eating a die again fails right here.
    'actions/dare.ts': { assign: 0, mutate: 1 },
    // INERT — the virtual hand is transient and never serialized.
    'npcHand.ts': { assign: 1, mutate: 0 },
  };

  const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');

  function scan(dir: string, prefix: string, out: Map<string, number>): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full, `${prefix}${entry.name}/`, out);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      if (entry.name === 'dice.ts') continue; // the definition site itself
      const calls = (readFileSync(full, 'utf8').match(/\bspendDie\(/g) ?? []).length;
      if (calls > 0) out.set(`${prefix}${entry.name}`, calls);
    }
  }

  it('has a case (or a documented exemption) for every caller in the tree', () => {
    const found = new Map<string, number>();
    scan(SRC, '', found);

    const expected = new Map(
      Object.entries(MANIFEST).map(([file, { assign, mutate }]) => [file, assign + mutate]),
    );
    expect(Object.fromEntries([...found].sort())).toEqual(Object.fromEntries([...expected].sort()));
  });
});
