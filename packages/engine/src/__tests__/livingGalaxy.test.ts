import { describe, it, expect } from 'vitest';
import { startDay, endDay, advanceDay } from '../day.js';
import { createInitialState } from '../state.js';
import { resolveCombat } from '../actions/combat.js';
import { pickContract } from '../npc.js';
import {
  JOB_POOL_BOARD_SIZE,
  JOB_POOL_MAX_CLAIMS,
  JOB_POOL_MIN_BOARD,
  debitJobPool,
  jobPoolDepth,
  regeneratePools,
} from '../economy.js';
import { SeededRng } from '../rng.js';
import { CargoContract, EncounterState, GameState } from '../types.js';

function namedEncounter(overrides: Partial<EncounterState> = {}): EncounterState {
  // Cargo King: named, tier 3, Cowardly (does NOT refuse tribute).
  return {
    id: 'enc-named',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'npc-cargo-king',
      source: 'named',
      name: 'Cargo King',
      shipName: 'Fat Profit',
      profileId: 'npc-cargo-king',
      stats: { PILOT: 1, GUNS: 0, TRADE: 5, GRIT: 1, GUILE: 2 },
      tier: 3,
      flaw: 'Cowardly',
      flawDc: 13,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.08,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
    ...overrides,
  };
}

function combatReadyState(dice: number[]): GameState {
  const state = createInitialState(5);
  state.player.dawnHand = { dice, spent: dice.map(() => false) };
  state.player.credits = 5000;
  state.encounter = namedEncounter();
  return state;
}

function dispositionOf(state: GameState, npcId: string): number {
  return state.npcs.find((npc) => npc.id === npcId)!.disposition;
}

describe('Disposition — grudges and favors (T-106 / T-1204)', () => {
  it('paying tribute to a named interceptor raises their disposition (+3)', () => {
    // Talk DC = 10 + tier 3 = 13 (Cargo King is neutral, no disposition term);
    // die 15 + TRADE 1 succeeds without a nat 20, so round-1 tribute (1,000 cr)
    // is demanded and paid. T-1204: the tribute delta is now +3 (content data).
    const state = combatReadyState([15, 5, 5, 5, 5]);
    const { state: next, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: 'npc-cargo-king', spendDie: 0 },
      new SeededRng(5),
    );

    expect(events.some((e) => e.type === 'TributePaid')).toBe(true);
    expect(dispositionOf(next, 'npc-cargo-king')).toBe(3);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'DispositionChanged',
        npcId: 'npc-cargo-king',
        delta: 3,
        reason: 'tribute',
      }),
    );
  });

  it('defeating a named interceptor leaves a serious grudge (-5)', () => {
    // Fight DC 13; die 18 + GUNS 0 wins, enemyHull 1 -> 0 -> defeated. T-1204: a
    // defeat now cuts a −5 grudge — a single organic defeat reaches |disposition| 5.
    const state = combatReadyState([18, 5, 5, 5, 5]);
    const { state: next, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'fight', targetId: 'npc-cargo-king', spendDie: 0 },
      new SeededRng(5),
    );

    expect(events).toContainEqual(expect.objectContaining({ resolution: 'defeated' }));
    expect(dispositionOf(next, 'npc-cargo-king')).toBe(-5);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'DispositionChanged',
        npcId: 'npc-cargo-king',
        delta: -5,
        reason: 'defeat',
      }),
    );
  });

  it('fleeing a named interceptor is a small mark in your favor (+2)', () => {
    // Run DC 13; die 19 + PILOT 1 escapes cleanly. T-1204: the player-fled delta
    // is now +2 (content data).
    const state = combatReadyState([19, 5, 5, 5, 5]);
    const { state: next, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'run', targetId: 'npc-cargo-king', spendDie: 0 },
      new SeededRng(5),
    );

    expect(events).toContainEqual(expect.objectContaining({ resolution: 'escaped' }));
    expect(dispositionOf(next, 'npc-cargo-king')).toBe(2);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'DispositionChanged',
        npcId: 'npc-cargo-king',
        delta: 2,
        reason: 'player-fled',
      }),
    );
  });

  it('disposition decays one step toward 0 every DISPOSITION_DECAY_INTERVAL_DAYS dusks', () => {
    // T-1204 decay rebalance: decay no longer fires EVERY dusk — it steps one
    // point toward 0 only on a day divisible by DISPOSITION_DECAY_INTERVAL_DAYS
    // (3). createInitialState starts at day 1, so advancing day 1 (1 % 3 != 0)
    // must NOT decay; the next decay lands at the day-3 dusk. This is the slower
    // fade that lets organic gains survive to the bond hook.
    let state = createInitialState(7);
    state.npcs.forEach((n) => {
      n.currentSystemId = 2;
      n.disposition = 0;
    });
    state.npcs[0].disposition = 3;
    state.npcs[1].disposition = -3;

    // Day 1 dusk: no decay (1 % 3 != 0) — the gains hold.
    let result = advanceDay(state, []);
    expect(result.state.npcs[0].disposition).toBe(3);
    expect(result.state.npcs[1].disposition).toBe(-3);
    expect(
      result.events.filter((e) => e.type === 'DispositionChanged' && e.reason === 'decay'),
    ).toHaveLength(0);
    state = result.state;

    // Day 2 dusk: still no decay.
    state = advanceDay(state, []).state;
    expect(state.npcs[0].disposition).toBe(3);

    // Day 3 dusk: decay fires (3 % 3 == 0) — one step toward 0 from both sides.
    result = advanceDay(state, []);
    expect(result.state.npcs[0].disposition).toBe(2);
    expect(result.state.npcs[1].disposition).toBe(-2);
    expect(
      result.events.filter((e) => e.type === 'DispositionChanged' && e.reason === 'decay'),
    ).toHaveLength(2);
  });
});

describe('Contract competition — the shared job pool (T-106)', () => {
  it('a same-system NPC claims a board offer at dusk; the wire reports it and the pool drains', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = createInitialState(seed);
      // Put a dedicated trader in the player's system.
      state.npcs.find((npc) => npc.id === 'npc-cargo-king')!.currentSystemId =
        state.player.currentSystemId;

      const dawn = startDay(state);
      expect(dawn.state.market.manifestBoard).toHaveLength(4);
      const boardSnapshot = dawn.state.market.manifestBoard.map((offer) => ({ ...offer }));

      const dusk = endDay(dawn.state);
      const claim = dusk.events.find((e) => e.type === 'ContractClaimed');
      if (!claim || claim.type !== 'ContractClaimed') continue;

      // The claimed offer is one the player saw on this morning's board...
      expect(
        boardSnapshot.some(
          (offer) =>
            offer.cargoType === claim.cargoType &&
            offer.destination === claim.destination &&
            offer.payment === claim.payment,
        ),
      ).toBe(true);
      // ...and it is gone from the live board.
      expect(dusk.state.market.manifestBoard).toHaveLength(3);
      // N10 · The claim is banked against the PLAYER'S SYSTEM's pool, not in a
      // galaxy-wide counter — the visible snipe and every away-claim debit one
      // shared ledger.
      const playerSystem = String(dusk.state.player.currentSystemId);
      expect(dusk.state.market.jobPoolClaims[playerSystem]).toBeGreaterThanOrEqual(1);
      expect(
        dusk.events.some(
          (e) => e.type === 'WireEntry' && e.message.includes('undercut you on the'),
        ),
      ).toBe(true);

      // Next dawn the depot's pool is visibly thinner — the T-106 signal N10
      // generalised rather than replaced, and the reason pools restock AFTER the
      // board is drawn: restocking first would refill it before it could be seen
      // drained. `toBeLessThan(4)` rather than exactly 3 because captains working
      // this same port from elsewhere in the fleet may have drained it further,
      // which is the point of the step.
      const drained = dusk.state.market.jobPoolClaims[playerSystem];
      const nextDawn = startDay(dusk.state);
      expect(nextDawn.state.market.manifestBoard).toHaveLength(Math.max(1, 4 - drained));
      expect(nextDawn.state.market.manifestBoard.length).toBeLessThan(4);
      return;
    }
    throw new Error('no contract claim observed in 60 seeds');
  });

  it('a snipe registers a rival grudge: the sniping NPC drops one disposition (T-106)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = createInitialState(seed);
      const rival = state.npcs.find((npc) => npc.id === 'npc-cargo-king')!;
      rival.currentSystemId = state.player.currentSystemId;
      // Start neutral so the snipe's -1 is unambiguous (and survives dusk decay,
      // which is applied BEFORE the snipe grudge in endDay).
      rival.disposition = 0;

      const dawn = startDay(state);
      const dusk = endDay(dawn.state);
      const claim = dusk.events.find((e) => e.type === 'ContractClaimed');
      if (!claim || claim.type !== 'ContractClaimed') continue;

      // The competitive act emits a typed disposition change tied to the snipe...
      const dispositionEvent = dusk.events.find(
        (e) =>
          e.type === 'DispositionChanged' &&
          e.reason === 'contract-sniped' &&
          e.npcId === claim.npcId,
      );
      expect(dispositionEvent).toBeDefined();
      if (dispositionEvent?.type !== 'DispositionChanged') throw new Error('unreachable');
      expect(dispositionEvent.delta).toBe(-1);
      // ...and it persists past the same-dusk decay to a real -1 standing.
      expect(dispositionOf(dusk.state, claim.npcId)).toBe(-1);
      return;
    }
    throw new Error('no contract claim observed in 60 seeds');
  });
});

describe('N10 · the shared job pool is galaxy-wide, persists, and restocks', () => {
  it('a captain hauling out of a system the player has never seen drains that system', () => {
    // The mechanism the whole step is about, and the one the reverted attempt
    // shipped WITHOUT: a claim made away from the player must debit a real ledger.
    for (let seed = 1; seed <= 20; seed++) {
      let state = createInitialState(seed);
      const playerSystem = state.player.currentSystemId;
      for (let day = 0; day < 10; day++) state = advanceDay(state, []).state;

      const drainedElsewhere = Object.entries(state.market.jobPoolClaims).filter(
        ([systemId, claims]) => Number(systemId) !== playerSystem && claims > 0,
      );
      if (drainedElsewhere.length === 0) continue;

      // Every tally is a legal depth, and the pool is not a galaxy-wide counter:
      // it names WHICH system was worked.
      for (const [, claims] of drainedElsewhere) {
        expect(claims).toBeGreaterThan(0);
        expect(claims).toBeLessThanOrEqual(JOB_POOL_MAX_CLAIMS);
      }
      // ...and the player's next board in one of those systems is thinner than a
      // fresh port's, which is what "watch the competition" means. Read through
      // the engine's own accessor rather than re-deriving `4 - claims` here.
      const [workedSystem] = drainedElsewhere[0];
      expect(jobPoolDepth(state.market.jobPoolClaims, Number(workedSystem))).toBeLessThan(
        JOB_POOL_BOARD_SIZE,
      );
      return;
    }
    throw new Error('no away-from-player pool claim observed in 20 seeds × 10 days');
  });

  it('pools restock, and a recovered tally is deleted rather than left as a zero', () => {
    // THE ANTI-RATCHET PROPERTY. A persisting tally with no recovery would leave
    // every port at the floor within a 120-day career — attrition, not competition,
    // and this step's own Disproves ("boards empty").
    //
    // Asserted on the accessors rather than through `advanceDay`, deliberately:
    // there is no system the cast cannot reach, so a drained port in a live galaxy
    // is being re-drained WHILE it recovers and the arithmetic could not be read
    // off the result. The integration half is the test above (a claim reaches the
    // ledger) and the one below (the ledger sizes the board).
    const pools: Record<string, number> = { '12': JOB_POOL_MAX_CLAIMS };
    expect(jobPoolDepth(pools, 12)).toBe(JOB_POOL_MIN_BOARD);

    const depths: number[] = [];
    for (let day = 0; day < 4; day++) {
      regeneratePools(pools);
      depths.push(jobPoolDepth(pools, 12));
    }

    // Monotone back to a full board at JOB_POOL_REGEN_PER_DAY a day...
    expect(depths[depths.length - 1]).toBe(JOB_POOL_BOARD_SIZE);
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]);
    }
    // ...and the key is GONE, not zeroed, so a quiet galaxy serializes as `{}`
    // instead of growing one entry per system for the life of the save.
    expect(pools['12']).toBeUndefined();
    expect(Object.keys(pools)).toHaveLength(0);
  });

  it('a claim is clamped, so a hot port cannot bank a debt it needs weeks to clear', () => {
    const pools: Record<string, number> = {};
    for (let i = 0; i < JOB_POOL_MAX_CLAIMS + 5; i++) debitJobPool(pools, 4);
    expect(pools['4']).toBe(JOB_POOL_MAX_CLAIMS);
    // The clamp is exactly the drain that already reaches the floor — anything
    // deeper would be arithmetic with no visible consequence and a long tail.
    expect(jobPoolDepth(pools, 4)).toBe(JOB_POOL_MIN_BOARD);
  });

  it("the player's board is sized by the pool of the system they are STANDING IN", () => {
    // Pre-N10 the board read one global counter, so this distinction did not
    // exist. It is what makes arriving somewhere worked-over legible.
    const state = createInitialState(7);
    state.market.jobPoolClaims = { '3': 2, '9': JOB_POOL_MAX_CLAIMS };

    state.player.currentSystemId = 3;
    expect(startDay(state).state.market.manifestBoard).toHaveLength(JOB_POOL_BOARD_SIZE - 2);

    state.player.currentSystemId = 9;
    expect(startDay(state).state.market.manifestBoard).toHaveLength(JOB_POOL_MIN_BOARD);

    state.player.currentSystemId = 14;
    expect(startDay(state).state.market.manifestBoard).toHaveLength(JOB_POOL_BOARD_SIZE);
  });
});

describe('N10 · pickContract — each archetype reads a board differently', () => {
  // A board built so every archetype's answer is DIFFERENT and hand-checkable.
  // Origin is system 1 (Sol-3) throughout.
  const OFFERS: CargoContract[] = [
    // 0 — the fattest cheque, in the core, close by.
    { destination: 2, cargoType: 9, payment: 40000, pods: 4 },
    // 1 — a modest core run, very close: the best payment-per-distance.
    { destination: 2, cargoType: 1, payment: 20000, pods: 2 },
    // 2 — the far rim, dangerous, mid payment.
    { destination: 20, cargoType: 5, payment: 30000, pods: 3 },
    // 3 — rim contraband.
    { destination: 15, cargoType: 10, payment: 25000, pods: 2 },
  ];
  const ORIGIN = 1;
  // Any seed: every expectation below is a strict argmax, so the tie-break rng
  // never gets a vote. That is deliberate — a strategy that depended on the seed
  // would not be a strategy.
  const rng = () => new SeededRng(42);

  it('the trader takes the biggest cheque', () => {
    expect(pickContract('trader', OFFERS, ORIGIN, rng())).toBe(0);
  });

  it('the veteran prices the fuel: best payment per unit of distance', () => {
    // Offer 0 pays 40,000 over distance 5 (8,000/unit) — richest AND most
    // efficient, so trader and veteran agree here.
    expect(pickContract('veteran', OFFERS, ORIGIN, rng())).toBe(0);
    // They part company the moment the fat cheque needs a long leg to earn it:
    // 32,000 over distance 14 is 2,285/unit against offer 1's 20,000 over 5 =
    // 4,000/unit. The TRADER still takes the bigger number; the veteran does not.
    const longHaul = OFFERS.map((offer, i) =>
      i === 0 ? { ...offer, destination: 14, payment: 32000 } : offer,
    );
    expect(pickContract('trader', longHaul, ORIGIN, rng())).toBe(0);
    expect(pickContract('veteran', longHaul, ORIGIN, rng())).toBe(1);
  });

  it('the explorer takes the farthest destination, not the richest', () => {
    expect(pickContract('explorer', OFFERS, ORIGIN, rng())).toBe(2);
  });

  it('the fighter goes where the trouble is', () => {
    // Offers 2 and 3 are both rim (danger 3); the fighter is indifferent between
    // them and the rng breaks the tie, so this asserts the CANDIDATE SET, which is
    // the actual claim. Never offer 0 or 1 — the safe core runs.
    expect([2, 3]).toContain(pickContract('fighter', OFFERS, ORIGIN, rng()));
  });

  it('the gambler takes the long-odds payday: payment weighted by danger', () => {
    // 30,000 × 3 (rim) beats 40,000 × 1 (core) — the gambler outbids the trader
    // for the dangerous run and loses the safe one to them.
    expect(pickContract('gambler', OFFERS, ORIGIN, rng())).toBe(2);
  });

  it('the smuggler takes contraband first, then any rim run', () => {
    expect(pickContract('smuggler', OFFERS, ORIGIN, rng())).toBe(3);
    // With contraband off the board they fall back to the rim — which is N4's
    // rim-first filter exactly, so that step's smuggler column stays comparable.
    const noContraband = OFFERS.filter((offer) => offer.cargoType !== 10);
    expect(noContraband[pickContract('smuggler', noContraband, ORIGIN, rng())].destination).toBe(
      20,
    );
  });

  it('is total: every archetype returns a real index on a single-offer board', () => {
    // A board drained to JOB_POOL_MIN_BOARD is the common case at a worked port,
    // so "one offer" is not an edge case — it is the floor the design guarantees.
    for (const archetype of [
      'trader',
      'veteran',
      'gambler',
      'explorer',
      'fighter',
      'smuggler',
    ] as const) {
      expect(pickContract(archetype, [OFFERS[1]], ORIGIN, rng())).toBe(0);
    }
  });

  it('measures distance from the ORIGIN it is given, not from system 0', () => {
    // The reverted attempt hardcoded `systemDistance(0, destination)` and threw
    // `Unknown star system route: 0 -> 11`. Same board, two origins, two answers.
    const board: CargoContract[] = [
      { destination: 2, cargoType: 1, payment: 1000, pods: 1 },
      { destination: 14, cargoType: 1, payment: 1000, pods: 1 },
    ];
    expect(pickContract('explorer', board, 1, rng())).toBe(1);
    expect(pickContract('explorer', board, 14, rng())).toBe(0);
  });
});

describe('Bond hook — one intervention per dusk (T-106 / T-1204)', () => {
  it("Doc Salvage's fuel-gift bond hook answers a low-fuel mayday", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createInitialState(seed);
      const doc = state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!;
      doc.currentSystemId = state.player.currentSystemId;
      // Above Doc's data-driven activateAt (2); the beat comes from his profile.
      doc.disposition = 6;

      const dawn = startDay(state);
      dawn.state.player.ship.fuel = 0;
      const docFuelBefore = dawn.state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!.ship.fuel;

      const dusk = endDay(dawn.state);
      const gift = dusk.events.find((e) => e.type === 'BondIntervention' && e.kind === 'fuel-gift');
      if (!gift) continue;

      expect(gift).toMatchObject({ npcId: 'npc-doc-salvage', amount: 50 });
      expect(dusk.state.player.ship.fuel).toBe(50);
      expect(
        dusk.events.some(
          (e) => e.type === 'WireEntry' && e.message.includes('answered your mayday'),
        ),
      ).toBe(true);
      // The intervention IS Doc's dusk action: the fuel came out of his tank
      // and he spent his whole day on it — exactly 50 fuel gone, no contract
      // hauled, no jump made, lastAction is the rescue.
      const docAfter = dusk.state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!;
      expect(docAfter.ship.fuel).toBe(docFuelBefore - 50);
      expect(docAfter.currentSystemId).toBe(dusk.state.player.currentSystemId);
      expect(docAfter.lastAction).toMatchObject({ type: 'Trade' });
      expect(docAfter.lastAction?.details).toContain('answering a mayday');
      return;
    }
    throw new Error('no fuel-gift intervention observed in 20 seeds');
  });

  it('does not intervene below the profile bond threshold (disposition < activateAt)', () => {
    const state = createInitialState(3);
    const doc = state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!;
    doc.currentSystemId = state.player.currentSystemId;
    // Below Doc's activateAt (2): the hook is not live, so a dead tank goes
    // unanswered.
    doc.disposition = 1;

    const dawn = startDay(state);
    dawn.state.player.ship.fuel = 0;
    const dusk = endDay(dawn.state);

    expect(dusk.events.some((e) => e.type === 'BondIntervention')).toBe(false);
    expect(dusk.state.player.ship.fuel).toBe(0);
  });

  it("Admiral Stern's drive-off bond hook clears an interceptor before the dusk free attack", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createInitialState(seed);
      // Admiral Stern's Bond is protection → the drive-off beat (Doc's beat is
      // fuel-gift, keyed to his own Bond). Standing above Stern's activateAt (3).
      const stern = state.npcs.find((npc) => npc.id === 'npc-admiral-stern')!;
      stern.currentSystemId = state.player.currentSystemId;
      stern.disposition = 7;

      const dawn = startDay(state);
      dawn.state.encounter = {
        id: 'enc-dusk-rescue',
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

      const dusk = endDay(dawn.state);
      const rescue = dusk.events.find(
        (e) => e.type === 'BondIntervention' && e.kind === 'drive-off',
      );
      if (!rescue) continue;

      expect(dusk.events).toContainEqual(
        expect.objectContaining({ type: 'EncounterResolved', resolution: 'interceptor-fled' }),
      );
      // Resolved BEFORE the dusk free attack: no day-end counter fire.
      expect(
        dusk.events.some((e) => e.type === 'EnemyCounterAction' && e.pressure === 'day-end'),
      ).toBe(false);
      expect(dusk.state.encounter).toBeNull();
      // Pending travel completes — the convoy limps in under escort.
      expect(dusk.state.player.currentSystemId).toBe(2);
      // The rescue IS Stern's dusk action — he skips his own NPC day.
      const sternAfter = dusk.state.npcs.find((npc) => npc.id === 'npc-admiral-stern')!;
      expect(sternAfter.lastAction).toMatchObject({ type: 'Combat' });
      expect(sternAfter.lastAction?.details).toContain('driving');
      expect(sternAfter.currentSystemId).toBe(1);
      return;
    }
    throw new Error('no drive-off intervention observed in 20 seeds');
  });
});
