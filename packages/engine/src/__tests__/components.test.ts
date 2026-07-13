import { describe, expect, it } from 'vitest';
import { Stat } from '@spacerquest/content';
import {
  crewCapacity,
  effectiveScore,
  lifeSupportCritical,
  navBonus,
  repairRate,
  shieldMitigation,
  weaponVolleyDamage,
} from '../components.js';
import { resolveCombat } from '../actions/combat.js';
import { resolveShipyard, quoteShipyard } from '../actions/shipyard.js';
import { resolveTravel } from '../actions/travel.js';
import { resolveExploration } from '../actions/exploration.js';
import { endDay } from '../day.js';
import { SeededRng } from '../rng.js';
import { createInitialState, starterShip } from '../state.js';
import {
  ComponentState,
  DayPhase,
  EncounterState,
  GameState,
  PlayerAction,
  ShipState,
} from '../types.js';

// T-1205 · one reader test per newly-load-bearing component. Each proves the
// component's named reader (a) reproduces the junker baseline and (b) diverges
// upward when the component is upgraded, plus an A/B through the real resolver so
// the wiring — not just the pure function — is exercised.

function readyState(seed = 123): GameState {
  const state = createInitialState(seed);
  state.dayPhase = DayPhase.DAY;
  state.player.dawnHand = {
    dice: [20, 20, 20, 20, 20],
    spent: [false, false, false, false, false],
  };
  state.player.ship.fuel = 100000;
  return state;
}

function fixtureEncounter(overrides: Partial<EncounterState> = {}): EncounterState {
  return {
    id: 'enc-test',
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
    routeDangerChance: 0.3,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
    ...overrides,
  };
}

const junker = (): ShipState => starterShip();
const tier = (t: number): ComponentState => ({ strength: t * 10, condition: 9 });

// ---------------------------------------------------------------------------
// 1. weapons → attack
// ---------------------------------------------------------------------------
describe('T-1205 · weapons reader', () => {
  it('weaponVolleyDamage is 1 for the junker and rises strictly with the weapon fit', () => {
    expect(weaponVolleyDamage(junker())).toBe(1);
    const s3 = { ...junker(), weapons: tier(3) };
    const s5 = { ...junker(), weapons: tier(5) };
    expect(weaponVolleyDamage(s3)).toBeGreaterThan(weaponVolleyDamage(junker()));
    expect(weaponVolleyDamage(s5)).toBeGreaterThan(weaponVolleyDamage(s3));
    // Condition also feeds effectiveScore: a battered gun of the same strength
    // deals no more than a fresh one, and never drops below the floor of 1.
    const damaged = { ...junker(), weapons: { strength: 50, condition: 0 } };
    expect(weaponVolleyDamage(damaged)).toBeGreaterThanOrEqual(1);
    expect(weaponVolleyDamage(damaged)).toBeLessThanOrEqual(weaponVolleyDamage(s5));
  });

  it('A/B: upgraded weapons kill a fixed-hull interceptor in strictly fewer volleys', () => {
    // Player always hits (GUNS 20 vs tier-1 DC 11); the interceptor never lands a
    // hit (GUNS 0 vs the player's raised GRIT), so the ONLY variable is weapons.
    const volleysToKill = (weapons: ComponentState): number => {
      let state = readyState();
      state.player.stats[Stat.GUNS] = 20;
      state.player.stats[Stat.GRIT] = 20;
      state.player.ship.weapons = weapons;
      state.encounter = fixtureEncounter({ enemyHull: 6 });
      let volleys = 0;
      while (state.encounter && volleys < 20) {
        const die = volleys % 5;
        state.player.dawnHand = {
          dice: [20, 20, 20, 20, 20],
          spent: [false, false, false, false, false],
        };
        const result = resolveCombat(
          state,
          { type: 'Combat', stance: 'fight', targetId: 'anon-pirate-1', spendDie: die },
          new SeededRng(volleys + 1),
        );
        state = result.state;
        volleys += 1;
      }
      return volleys;
    };

    const junkerVolleys = volleysToKill(tier(1)); // damage 1 → 6 volleys
    const upgradedVolleys = volleysToKill(tier(5)); // damage 3 → 2 volleys
    expect(junkerVolleys).toBe(6);
    expect(upgradedVolleys).toBeLessThan(junkerVolleys);
  });
});

// ---------------------------------------------------------------------------
// 2. shields → mitigation
// ---------------------------------------------------------------------------
describe('T-1205 · shields reader', () => {
  it('shieldMitigation is 0 for the junker, rises with the fit, and caps below nat-20 raw', () => {
    expect(shieldMitigation(junker())).toBe(0);
    const s3 = { ...junker(), shields: tier(3) };
    const s5 = { ...junker(), shields: tier(5) };
    expect(shieldMitigation(s3)).toBeGreaterThan(0);
    expect(shieldMitigation(s5)).toBeGreaterThanOrEqual(shieldMitigation(s3));
    // Hard cap: a maxed shield never reaches the nat-20 raw damage (3), so a
    // lucky shot always penetrates for at least 1.
    expect(shieldMitigation({ ...junker(), shields: tier(9) })).toBeLessThanOrEqual(2);
  });

  it('A/B: upgraded shields take strictly less total condition damage over a hit sweep', () => {
    // A strong interceptor (GUNS 20) hits nearly every round; the player fails a
    // talk each round so enemy pressure lands. Total condition lost across the
    // ship is the measured quantity.
    const totalConditionLost = (shields: ComponentState): number => {
      let state = readyState();
      state.player.stats[Stat.TRADE] = 0; // talk always fails vs DC 11
      state.player.ship.shields = shields;
      state.encounter = fixtureEncounter({
        enemyHull: 9999, // never resolves by enemy death; we drive pressure via talk-fail
        interceptor: {
          ...fixtureEncounter().interceptor,
          stats: { PILOT: 1, GUNS: 20, TRADE: 0, GRIT: 0, GUILE: 1 },
        },
      });
      const before = JSON.parse(JSON.stringify(state.player.ship)) as ShipState;
      for (let round = 0; round < 40 && state.encounter; round += 1) {
        state.player.dawnHand = { dice: [2], spent: [false] }; // die 2 → talk fails
        const result = resolveCombat(
          state,
          { type: 'Combat', stance: 'talk', targetId: 'anon-pirate-1', spendDie: 0 },
          new SeededRng(round + 1),
        );
        state = result.state;
      }
      const COMPONENTS = [
        'hull',
        'drives',
        'weapons',
        'shields',
        'navigation',
        'lifeSupport',
        'robotics',
        'cabin',
      ] as const;
      let lost = 0;
      for (const id of COMPONENTS) {
        lost += before[id].condition - state.player.ship[id].condition;
      }
      return lost;
    };

    const junkerLost = totalConditionLost(tier(1));
    const upgradedLost = totalConditionLost(tier(5));
    expect(junkerLost).toBeGreaterThan(0);
    expect(upgradedLost).toBeLessThan(junkerLost);
  });

  it('a nat-20 enemy hit penetrates even the strongest shields for at least 1', () => {
    // Drive rounds until an enemy nat-20 lands; that ComponentDamaged must show a
    // net amount >= 1 despite maxed shields (mitigation capped at 2, raw 3).
    let state = readyState();
    state.player.stats[Stat.TRADE] = 0;
    state.player.ship.shields = tier(9);
    state.player.ship.hull.condition = 9;
    state.encounter = fixtureEncounter({
      enemyHull: 9999,
      interceptor: {
        ...fixtureEncounter().interceptor,
        stats: { PILOT: 1, GUNS: 20, TRADE: 0, GRIT: 0, GUILE: 1 },
      },
    });
    let sawNat20Penetration = false;
    for (let round = 0; round < 400 && state.encounter && !sawNat20Penetration; round += 1) {
      state.player.dawnHand = { dice: [2], spent: [false] };
      const result = resolveCombat(
        state,
        { type: 'Combat', stance: 'talk', targetId: 'anon-pirate-1', spendDie: 0 },
        new SeededRng(round + 1),
      );
      state = result.state;
      const counter = result.events.find((e) => e.type === 'EnemyCounterAction');
      const dmg = result.events.find((e) => e.type === 'ComponentDamaged');
      if (
        counter?.type === 'EnemyCounterAction' &&
        counter.check.nat20 &&
        dmg?.type === 'ComponentDamaged'
      ) {
        // The nat-20 raw is 3; maxed shields absorb the capped 2 (recorded on the
        // event's `mitigated` field — the shields' visible consumption) and 1 gets
        // through.
        expect(dmg.mitigated).toBe(2);
        expect(dmg.amount).toBe(1);
        sawNat20Penetration = true;
      }
    }
    expect(sawNat20Penetration).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. navigation → pilot/explore checks
// ---------------------------------------------------------------------------
describe('T-1205 · navigation reader', () => {
  it('navBonus is 0 for the junker and rises with the nav fit', () => {
    expect(navBonus(junker())).toBe(0);
    const s3 = { ...junker(), navigation: tier(3) };
    const s5 = { ...junker(), navigation: tier(5) };
    expect(navBonus(s3)).toBeGreaterThan(0);
    expect(navBonus(s5)).toBeGreaterThan(navBonus(s3));
  });

  it('A/B: upgraded navigation raises the travel pilot-check success rate over a die sweep', () => {
    // The pilot-check outcome turns on die + PILOT + navBonus vs the route DC; the
    // seed only decides whether an encounter fires (it does not move the check). So
    // sweep every possible die value and count how many clear the check — an
    // upgraded nav (higher bonus) clears strictly more of them.
    const successCount = (navigation: ComponentState): number => {
      let hits = 0;
      for (let die = 1; die <= 20; die += 1) {
        const state = readyState();
        state.player.currentSystemId = 1;
        state.player.stats[Stat.PILOT] = 0;
        state.player.ship.navigation = navigation;
        state.player.dawnHand = { dice: [die], spent: [false] };
        const result = resolveTravel(
          state,
          { type: 'Travel', destinationId: 2, spendDie: 0 },
          new SeededRng(die),
        );
        const check = result.events.find((e) => e.type === 'StatCheck');
        if (check?.type === 'StatCheck' && check.result.success) hits += 1;
      }
      return hits;
    };
    expect(successCount(tier(5))).toBeGreaterThan(successCount(tier(1)));
  });

  it('upgraded navigation lifts the explore nav check (same PILOT reader)', () => {
    const succeed = (navigation: ComponentState, die: number): boolean => {
      const state = readyState();
      state.player.stats[Stat.PILOT] = 0;
      state.player.ship.navigation = navigation;
      state.player.dawnHand = { dice: [die], spent: [false] };
      const result = resolveExploration(state, { type: 'Explore', spendDie: 0 }, new SeededRng(1));
      const check = result.events.find((e) => e.type === 'StatCheck');
      return check?.type === 'StatCheck' ? check.result.success : false;
    };
    // die 10 + PILOT 0 vs DC 12 fails with junker nav (+0) but passes with a
    // tier-3 nav bonus (+2 → total 12).
    expect(succeed(tier(1), 10)).toBe(false);
    expect(succeed(tier(3), 10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. robotics → repair rate
// ---------------------------------------------------------------------------
describe('T-1205 · robotics reader', () => {
  it('repairRate is 1 for the junker and rises with the robotics fit', () => {
    expect(repairRate(junker())).toBe(1);
    const s3 = { ...junker(), robotics: tier(3) };
    expect(repairRate(s3)).toBeGreaterThan(1);
    // A dinged robotics never makes a repair a no-op.
    expect(
      repairRate({ ...junker(), robotics: { strength: 10, condition: 0 } }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('A/B: a single-component repair restores repairRate condition (more with upgraded robotics)', () => {
    const restored = (robotics: ComponentState): number => {
      const state = readyState();
      state.player.credits = 100000;
      state.player.ship.robotics = robotics;
      // Damage the drives so there is condition to restore.
      state.player.ship.drives = { strength: 10, condition: 3 };
      const before = state.player.ship.drives.condition;
      const result = resolveShipyard(state, {
        type: 'Shipyard',
        action: 'repair',
        repairMode: 'single',
        component: 'drives',
        spendDie: 0,
      });
      return result.state.player.ship.drives.condition - before;
    };
    expect(restored(tier(1))).toBe(1); // junker robotics → +1
    expect(restored(tier(3))).toBeGreaterThan(1); // upgraded → more per action
  });
});

// ---------------------------------------------------------------------------
// 5. cabin → crew capacity (T-1306 socket, surfaced in the shipyard preview now)
// ---------------------------------------------------------------------------
describe('T-1205 · cabin reader', () => {
  it('crewCapacity is 1 for the junker and scales with cabin strength', () => {
    expect(crewCapacity(junker())).toBe(1);
    expect(crewCapacity({ ...junker(), cabin: tier(3) })).toBeGreaterThan(crewCapacity(junker()));
    expect(crewCapacity({ ...junker(), cabin: tier(5) })).toBeGreaterThan(
      crewCapacity({ ...junker(), cabin: tier(3) }),
    );
  });

  it('the shipyard preview surfaces crew capacity, and it grows after a cabin upgrade', () => {
    const state = readyState();
    state.player.credits = 100000;
    const action: PlayerAction = {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'cabin',
      tier: 5,
      spendDie: 0,
    };
    const quote = quoteShipyard(state, action);
    expect(quote.before.crewCapacity).toBe(crewCapacity(state.player.ship));
    expect(quote.after.crewCapacity).toBeGreaterThan(quote.before.crewCapacity);
  });
});

// ---------------------------------------------------------------------------
// 6. lifeSupport → survival / succession reader
// ---------------------------------------------------------------------------
describe('T-1205 · lifeSupport reader', () => {
  function primedForDusk(seed: number): GameState {
    const state = createInitialState(seed);
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = {
      dice: [20, 20, 20, 20, 20],
      spent: [true, true, true, true, true],
    };
    state.player.ship.lifeSupport.condition = 0; // critical
    return state;
  }

  it('lifeSupportCritical is true only at condition 0', () => {
    expect(lifeSupportCritical(junker())).toBe(false);
    expect(lifeSupportCritical({ ...junker(), lifeSupport: { strength: 10, condition: 0 } })).toBe(
      true,
    );
  });

  it('healthy life support emits no LifeSupportCritical at dusk', () => {
    const state = createInitialState(7);
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = { dice: [20], spent: [true] };
    const { events } = endDay(state);
    expect(events.some((e) => e.type === 'LifeSupportCritical')).toBe(false);
  });

  it('critical life support rolls a dusk survival check; a pass is a scare (ship intact)', () => {
    // Scan seeds for a survived outcome and assert the ship survives untouched.
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed += 1) {
      const state = primedForDusk(seed);
      const { state: next, events } = endDay(state);
      const crit = events.find((e) => e.type === 'LifeSupportCritical');
      expect(crit).toBeDefined();
      if (crit?.type === 'LifeSupportCritical' && crit.survived) {
        expect(events.some((e) => e.type === 'ShipLost')).toBe(false);
        expect(next.player.legacy.successionCount).toBe(0);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('critical life support that fails the check loses the ship to a life-support failure', () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed += 1) {
      const state = primedForDusk(seed);
      const { state: next, events } = endDay(state);
      const crit = events.find((e) => e.type === 'LifeSupportCritical');
      if (crit?.type === 'LifeSupportCritical' && !crit.survived) {
        expect(events).toContainEqual(
          expect.objectContaining({ type: 'ShipLost', reason: 'life-support-failure' }),
        );
        expect(events).toContainEqual(expect.objectContaining({ type: 'LegacySuccession' }));
        // Succession reset the ship — life support back to a healthy junker fit.
        expect(next.player.ship.lifeSupport.condition).toBe(9);
        expect(next.player.legacy.successionCount).toBe(1);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// effectiveScore spine
// ---------------------------------------------------------------------------
describe('T-1205 · effectiveScore', () => {
  it('scores a fresh component at its strength and scales down with condition', () => {
    expect(effectiveScore({ strength: 50, condition: 9 })).toBe(50);
    expect(effectiveScore({ strength: 50, condition: 0 })).toBe(5);
    expect(effectiveScore({ strength: 1, condition: 9 })).toBe(1);
  });
});
