import { describe, it, expect } from 'vitest';
import { PURCHASABLE_PORTS_BY_SYSTEM } from '@spacerquest/content';
import { createInitialState, serializeState, deserializeState } from '../state.js';
import { startDay, applyPlayerAction, endDay } from '../day.js';
import { createSave, loadSave } from '../save.js';
import { applySuccession } from '../legacy.js';
import { portDuskIncome, quotePort } from '../actions/port.js';
import { GameEvent, GameState, EraEventState, PortStake } from '../types.js';

/** Deep-clone a port roster with a concrete type (JSON.parse alone is `any`). */
function clonePorts(ports: PortStake[]): PortStake[] {
  return JSON.parse(JSON.stringify(ports)) as PortStake[];
}

/** A DAY-phase state at a core port (system 1 = Sun-3) with an optional pre-day
 *  mutation (credits, ports). */
function dayState(seed: number, mutate?: (state: GameState) => void): GameState {
  const state = createInitialState(seed);
  mutate?.(state);
  return startDay(state).state;
}

function portEvents(events: GameEvent[]): Extract<GameEvent, { type: 'PortEvent' }>[] {
  return events.filter(
    (e): e is Extract<GameEvent, { type: 'PortEvent' }> => e.type === 'PortEvent',
  );
}

function firstUnspent(state: GameState): number {
  return state.player.dawnHand!.spent.findIndex((s) => !s);
}

const SUN3 = 1; // a core, purchasable port (STAR_SYSTEMS[1])
const PRICE = PURCHASABLE_PORTS_BY_SYSTEM[SUN3].purchasePrice;
const BASE_INCOME = PURCHASABLE_PORTS_BY_SYSTEM[SUN3].baseDuskIncome;

/** A live regional blockade whose scope covers the whole core band (incl. Sun-3).
 *  Built directly the way era.test.ts constructs an EraEventState. */
function coreBlockade(day: number): EraEventState {
  return {
    defId: 'blockade',
    startedDay: day,
    endsDay: day + 8,
    affectedSystemIds: Array.from({ length: 14 }, (_, i) => i + 1),
  };
}

describe('T-1307 · buy a port stake', () => {
  it('buy → owned + income accrues per dusk (acceptance #1)', () => {
    const state = dayState(1, (s) => {
      s.player.credits = PRICE + 5000;
    });
    const before = state.player.credits;
    const die = firstUnspent(state);

    const { state: bought, events } = applyPlayerAction(state, {
      type: 'Port',
      action: 'buy',
      systemId: SUN3,
      spendDie: die,
    });

    // Owned, die spent, credits down by price, PortEvent{purchased} + WireEntry.
    expect(bought.player.ports).toEqual([{ systemId: SUN3, purchaseDay: 1 }]);
    expect(bought.player.credits).toBe(before - PRICE);
    expect(bought.player.dawnHand!.spent[die]).toBe(true);
    const pe = portEvents(events);
    expect(pe).toHaveLength(1);
    expect(pe[0]).toMatchObject({ kind: 'purchased', systemId: SUN3, cost: PRICE, portCount: 1 });
    const wire = events.filter((e) => e.type === 'WireEntry');
    expect(wire.some((e) => /port authority/i.test((e as { message: string }).message))).toBe(true);

    // Dusk: income accrues to credits and fires a PortEvent{income}.
    const afterPurchase = bought.player.credits;
    const { state: dusk, events: duskEvents } = endDay(bought);
    const income = portEvents(duskEvents).find((e) => e.kind === 'income');
    expect(income).toMatchObject({ kind: 'income', income: BASE_INCOME, portCount: 1 });
    expect(dusk.player.credits).toBe(afterPurchase + BASE_INCOME);
  });

  it('a regional era event changes the income A/B (acceptance #2)', () => {
    const base = createInitialState(1);
    base.player.ports = [{ systemId: SUN3, purchaseDay: 1 }];

    // A: no era event → base income.
    base.eraEvent = null;
    expect(portDuskIncome(base)).toBe(BASE_INCOME);

    // B: a core-band blockade covering Sun-3 → income scaled by 1.5.
    base.eraEvent = coreBlockade(1);
    const modulated = portDuskIncome(base);
    expect(modulated).toBe(Math.round(BASE_INCOME * 1.5));
    expect(modulated).not.toBe(BASE_INCOME);

    // Region-gated: an event whose scope does NOT cover Sun-3 leaves it at base.
    base.eraEvent = {
      defId: 'blockade',
      startedDay: 1,
      endsDay: 9,
      affectedSystemIds: [15, 16, 17, 18, 19, 20], // rim band only
    };
    expect(portDuskIncome(base)).toBe(BASE_INCOME);
  });

  it('the A/B lever flows through the real dusk loop (endDay credits differ)', () => {
    function creditsGainedAtDusk(eraEvent: EraEventState | null): number {
      const s = dayState(2, (st) => {
        st.player.credits = 10000;
        st.player.ports = [{ systemId: SUN3, purchaseDay: 1 }];
        st.eraEvent = eraEvent;
      });
      const before = s.player.credits;
      // endDay must not roll a NEW era event over the injected one within the horizon;
      // a single dusk from a freshly-started day is enough to read the income beat.
      const { state: dusk, events } = endDay(s);
      const income = portEvents(events).find((e) => e.kind === 'income');
      expect(income).toBeDefined();
      return dusk.player.credits - before;
    }
    const quiet = creditsGainedAtDusk(null);
    const blockaded = creditsGainedAtDusk(coreBlockade(2));
    expect(quiet).toBe(BASE_INCOME);
    expect(blockaded).toBe(Math.round(BASE_INCOME * 1.5));
    expect(blockaded).toBeGreaterThan(quiet);
  });
});

describe('T-1307 · port ownership survives persistence', () => {
  it('round-trips owned ports through createSave → loadSave (acceptance #3a)', () => {
    const state = dayState(3, (s) => {
      s.player.credits = PRICE + 5000;
    });
    const die = firstUnspent(state);
    const bought = applyPlayerAction(state, {
      type: 'Port',
      action: 'buy',
      systemId: SUN3,
      spendDie: die,
    }).state;

    const loaded = loadSave(createSave(bought, 3));
    expect(loaded.state.player.ports).toEqual(bought.player.ports);

    // Also a raw serialize → deserialize round-trip.
    const raw = deserializeState(serializeState(bought));
    expect(raw.player.ports).toEqual(bought.player.ports);
  });

  it('carries owned ports through succession (acceptance #3b)', () => {
    const state = createInitialState(4);
    state.player.ports = [
      { systemId: SUN3, purchaseDay: 2 },
      { systemId: 3, purchaseDay: 5 },
    ];
    const portsBefore = clonePorts(state.player.ports);

    const events = applySuccession(state, {
      originSystem: state.player.currentSystemId,
      interceptorId: 'anon-pirate-1',
    });

    // Succession fired and the ship reset to the junker...
    expect(events.some((e) => e.type === 'LegacySuccession')).toBe(true);
    expect(state.player.ship.hull.strength).toBe(1); // starter junker hull
    // ...but the port stakes are carried WHOLESALE — the successor claims the property.
    expect(state.player.ports).toEqual(portsBefore);
  });
});

describe('T-1307 · typed fails spend nothing', () => {
  const cases: {
    name: string;
    mutate: (s: GameState) => void;
    systemId: number;
    reason: string;
  }[] = [
    {
      name: 'not-at-port (buying a port you are not standing in)',
      mutate: (s) => {
        s.player.credits = PRICE + 5000;
      },
      systemId: 3, // player is at system 1
      reason: 'not-at-port',
    },
    {
      name: 'not-purchasable (a rim system, not a core port)',
      mutate: (s) => {
        s.player.credits = PRICE + 5000;
        s.player.currentSystemId = 15; // a rim system
      },
      systemId: 15,
      reason: 'not-purchasable',
    },
    {
      name: 'already-owned',
      mutate: (s) => {
        s.player.credits = PRICE + 5000;
        s.player.ports = [{ systemId: SUN3, purchaseDay: 1 }];
      },
      systemId: SUN3,
      reason: 'already-owned',
    },
    {
      name: 'insufficient-credits',
      mutate: (s) => {
        s.player.credits = PRICE - 1;
      },
      systemId: SUN3,
      reason: 'insufficient-credits',
    },
  ];

  it.each(cases)('$name → PortEvent{failed}, no die spent, no credit change', (c) => {
    const state = dayState(5, c.mutate);
    const die = firstUnspent(state);
    const beforeCredits = state.player.credits;
    const beforePorts = clonePorts(state.player.ports);

    const { state: next, events } = applyPlayerAction(state, {
      type: 'Port',
      action: 'buy',
      systemId: c.systemId,
      spendDie: die,
    });

    const pe = portEvents(events);
    expect(pe).toHaveLength(1);
    expect(pe[0]).toMatchObject({ kind: 'failed', failReason: c.reason });
    expect(next.player.dawnHand!.spent[die]).toBe(false); // die untouched
    expect(next.player.credits).toBe(beforeCredits); // no credit change
    expect(next.player.ports).toEqual(beforePorts); // no ownership change
  });

  it('malformed die (already spent) → die-already-spent, no state change', () => {
    const state = dayState(5, (s) => {
      s.player.credits = PRICE + 5000;
    });
    // Spend the die first via a real buy on a different (owned) path would change
    // state, so instead mark it spent directly to isolate the die-validation branch.
    const die = firstUnspent(state);
    state.player.dawnHand!.spent[die] = true;
    const { state: next, events } = applyPlayerAction(state, {
      type: 'Port',
      action: 'buy',
      systemId: SUN3,
      spendDie: die,
    });
    expect(portEvents(events)[0]).toMatchObject({
      kind: 'failed',
      failReason: 'die-already-spent',
    });
    expect(next.player.ports).toEqual([]);
    expect(next.player.credits).toBe(PRICE + 5000);
  });
});

describe('T-1307 · quotePort preview', () => {
  it('matches the real purchase (ok/cost/alreadyOwned) and mutates nothing', () => {
    const state = dayState(6, (s) => {
      s.player.credits = PRICE + 5000;
    });
    const snapshot = JSON.stringify(state);

    const quote = quotePort(state, SUN3);
    expect(quote).toMatchObject({
      ok: true,
      cost: PRICE,
      failure: null,
      alreadyOwned: false,
      income: BASE_INCOME,
    });
    // Preview is side-effect-free.
    expect(JSON.stringify(state)).toBe(snapshot);

    // Do the real buy and confirm the quote agreed.
    const die = firstUnspent(state);
    const bought = applyPlayerAction(state, {
      type: 'Port',
      action: 'buy',
      systemId: SUN3,
      spendDie: die,
    }).state;
    expect(bought.player.credits).toBe(PRICE + 5000 - quote.cost);

    // After owning it, the quote reports alreadyOwned and !ok.
    const owned = quotePort(bought, SUN3);
    expect(owned).toMatchObject({ ok: false, alreadyOwned: true, failure: 'already-owned' });
  });

  it('reports insufficient-credits when the price is out of reach', () => {
    const state = dayState(6, (s) => {
      s.player.credits = PRICE - 1;
    });
    expect(quotePort(state, SUN3)).toMatchObject({ ok: false, failure: 'insufficient-credits' });
  });
});
