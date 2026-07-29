import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  IDEAL_WEIGHTS,
  INTENT_STAT_AFFINITY,
  NAV_FUEL_FLOOR,
  NPC_CHECK_DCS,
  ALL_NPC_PROFILES,
  NpcIntentType,
  STAR_SYSTEMS,
  distance,
  // N3
  COMBAT_SALVAGE_PER_TIER,
  NPC_ENCOUNTER_MAX_ROUNDS,
} from '@spacerquest/content';
import {
  NPC_START_FUEL,
  applyDisposition,
  npcDrives,
  npcShipForProfile,
  resolveNpcDay,
  NpcDayContext,
} from '../npc.js';
import { componentTierForStrength, maxCargoPodsForShip } from '../actions/shipyard.js';
// N3 · the interceptor pool (dead-captain skip) and the shared tribute schedule
import { selectEncounterInterceptor } from '../actions/travel.js';
import { tributeForRound } from '../combatRules.js';
import { starterShip } from '../state.js';
import { ShipComponentId } from '../types.js';
import { calculateFuelCapacity, contractSpecFromShip, jumpFuelCost } from '../economy.js';
import { navFuelFactor } from '../components.js';
import { advanceDay } from '../day.js';

/** Longest route the cast can fly (systems 1-20): Cygnus-16 → Rigel-19. The
 *  worst case the hull-derived fuel ceiling has to clear — computed from the
 *  content star map, never restated as a literal. */
const MAX_NPC_ROUTE_DISTANCE = Math.max(
  ...Object.values(STAR_SYSTEMS)
    .map((s) => s.id)
    .filter((id) => id <= 20)
    .flatMap((a, _i, ids) => ids.map((b) => distance(a, b))),
);
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { GameEvent, NpcState } from '../types.js';

/** The eight ship components, in content order — the fit an N2 captain buys
 *  across. Named here so the assertions below read as "the whole ship". */
const COMPONENT_IDS: readonly ShipComponentId[] = [
  'hull',
  'drives',
  'cabin',
  'lifeSupport',
  'weapons',
  'navigation',
  'robotics',
  'shields',
];

/** The five verb action-types and their StatCheck actionContext tags — the
 *  contract T-1201 asserts: a resolved verb ⟺ exactly one StatCheck with the
 *  matching context. */
const VERB_CONTEXT: Record<string, string> = {
  Trade: 'npc-trade',
  Travel: 'npc-travel',
  Combat: 'npc-combat',
  Patrol: 'npc-patrol',
  Socialize: 'npc-socialize',
};

/** N1 · `fuel` is no longer a field on `NpcState` — it is the ship's tank. It
 *  stays a top-level knob HERE because every funding case below reads as
 *  "credits X, fuel Y", and routing it into `ship.fuel` keeps those cases
 *  legible while the state stays single-sourced. */
function npcFor(
  profileId: string,
  overrides: Partial<NpcState> & { fuel?: number } = {},
): NpcState {
  const profile = ALL_NPC_PROFILES.find((p) => p.id === profileId)!;
  const { fuel, ...rest } = overrides;
  const ship = npcShipForProfile(profile);
  if (fuel !== undefined) ship.fuel = fuel;
  return {
    id: profile.id,
    name: profile.name,
    profileId: profile.id,
    currentSystemId: 1,
    credits: 5000,
    ship,
    disposition: 0,
    ...rest,
  };
}

// N3 added `era` to NpcDayContext (the interdiction rate is era-scaled). VETERAN
// is the undamped rate, so a test asserting encounter behaviour sees the full
// chance rather than Tour One's 0.5x.
const NO_BOARD: NpcDayContext = {
  day: 1,
  claimableBoard: null,
  eraEvent: null,
  era: 'VETERAN',
};

describe('NPC Resolution', () => {
  it('resolves an NPC day deterministically and handles Flaw overrides', () => {
    const first = resolveNpcDay(npcFor('npc-iron-vex'), new SeededRng(42), NO_BOARD);
    const second = resolveNpcDay(npcFor('npc-iron-vex'), new SeededRng(42), NO_BOARD);

    expect(second.npc).toEqual(first.npc);
    expect(second.events).toEqual(first.events);

    expect(first.npc.id).toBe('npc-iron-vex');
    expect(first.events.length).toBeGreaterThan(0);
    expect(first.events.find((e) => e.type === 'NpcAction')).toBeDefined();
    expect(first.npc.lastAction).toBeDefined();
  });

  it('has an intent weight entry for every distinct Ideal in the cast', () => {
    for (const profile of ALL_NPC_PROFILES) {
      expect(
        IDEAL_WEIGHTS[profile.ideal],
        `missing weights for Ideal "${profile.ideal}"`,
      ).toBeDefined();
    }
  });

  it('never lets an NPC spend credits or fuel it does not have', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { npc } = resolveNpcDay(
        npcFor('npc-lucky-seven', { credits: 30, fuel: 5 }),
        new SeededRng(seed),
        NO_BOARD,
      );
      expect(npc.credits).toBeGreaterThanOrEqual(0);
      expect(npc.ship.fuel).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// N2 · THE DAY-1 SEED, held by assertion rather than by comment.
//
// N1's block here asserted the seed REPRODUCED THE PHANTOM: nav factor exactly 1,
// and a fuel ceiling that could never bind. Both were true, and the second was N1's
// own recorded fuel EXEMPTION written down as a test — a tier-1 NPC held a
// 1,200-unit tank against the player's 300 for comparable capacity. N2 owns
// removing it, so those two assertions are REPLACED rather than deleted: the
// relationships they pinned are re-pinned in the direction the step moved them, so
// the file still fails loudly if the seed drifts back.
// ---------------------------------------------------------------------------
describe('N2 · the day-1 seed (calibration)', () => {
  it('still hands rollContract the pods/hull-condition/drives spec the phantom did', () => {
    // UNCHANGED ACROSS N2, and deliberately: `contractSpecFromShip` reads pods,
    // hull CONDITION and drives, none of which this step re-seeds. So NPC contract
    // income on day 1 is what it has been since T-106, and any income movement in
    // the sweep is the upgrade decision, not a re-priced board.
    for (const profile of ALL_NPC_PROFILES) {
      const spec = contractSpecFromShip(npcShipForProfile(profile));
      expect(spec).toEqual({
        cargoPods: 2 + profile.tier * 2,
        hullCondition: 9,
        drives: npcDrives(profile.tier),
      });
    }
  });

  it("prices a jump through the captain's OWN navigation, not a hard-coded 1", () => {
    // N1 pinned `navFuelFactor(ship) === 1` for every captain, because every
    // captain was issued the junker's navigation. N2 gives navigation to the
    // captains whose stats want it, so the factor is now a per-captain number in
    // [NAV_FUEL_FLOOR, 1] — and the jump must be priced through it, exactly as the
    // player's is.
    let discounted = 0;
    for (const profile of ALL_NPC_PROFILES) {
      const ship = npcShipForProfile(profile);
      const factor = navFuelFactor(ship);
      expect(factor).toBeLessThanOrEqual(1);
      expect(factor).toBeGreaterThanOrEqual(NAV_FUEL_FLOOR);
      if (factor < 1) discounted += 1;
      expect(ship.hasTransWarpDrive).toBe(false);
      for (const dist of [1, 5, 14, 30, MAX_NPC_ROUTE_DISTANCE]) {
        // The captain's own nav discount, never an omitted argument.
        expect(jumpFuelCost(ship.drives, dist, ship.hasTransWarpDrive, factor)).toBe(
          jumpFuelCost(npcDrives(profile.tier), dist, false, factor),
        );
      }
    }
    // Non-degeneracy in both directions: the field is not all-junker (which would
    // mean the ramp never fired) and not all-discounted (which would mean it fired
    // for everyone, i.e. it is not a specialism).
    expect(discounted).toBeGreaterThan(0);
    expect(discounted).toBeLessThan(ALL_NPC_PROFILES.length);
  });

  it("seeds a hull the yard would license for the captain's hold, and no larger", () => {
    // THE REMOVED EXEMPTION, pinned from the other side. The hull must cover the
    // pods (or the captain is born holding cargo the engine says they cannot) and
    // must be the SMALLEST that does (or the tank is a gift the player never got).
    for (const profile of ALL_NPC_PROFILES) {
      const ship = npcShipForProfile(profile);
      expect(maxCargoPodsForShip(ship)).toBeGreaterThanOrEqual(ship.cargoPods);
      const oneSmaller = { ...ship, hull: { ...ship.hull, strength: ship.hull.strength - 1 } };
      if (ship.hull.strength > 1) {
        expect(maxCargoPodsForShip(oneSmaller)).toBeLessThan(ship.cargoPods);
      }
      expect(ship.maxFuel).toBe(calculateFuelCapacity(ship.hull.strength, ship.hull.condition));
    }
  });

  it('clamps the birth tank to the hull, so the ceiling now BINDS on day 1', () => {
    // The exact inversion of N1's "the ceiling cannot bind". `NPC_START_FUEL` is
    // 1,000 and the player-shaped hull holds 300 (600 at tier 5), so every captain
    // is born full and capped rather than born with four times a player's fuel.
    for (const profile of ALL_NPC_PROFILES) {
      const ship = npcShipForProfile(profile);
      expect(ship.maxFuel).toBeLessThan(NPC_START_FUEL);
      expect(ship.fuel).toBe(ship.maxFuel);
    }
    // And a tier-1 captain now holds exactly what the player's junker holds.
    const junker = starterShip();
    const lowest = npcShipForProfile({ tier: 1, stats: ALL_NPC_PROFILES[0].stats });
    expect(lowest.maxFuel).toBe(junker.maxFuel);
  });

  it('gives every captain the same number of specialisms, and not the same ones', () => {
    // The seed's whole job: tier says HOW FAR, the character sheet says WHERE.
    const RAMPED = [
      'cabin',
      'lifeSupport',
      'weapons',
      'navigation',
      'robotics',
      'shields',
    ] as const;
    const BASE: Record<(typeof RAMPED)[number], number> = {
      cabin: 1,
      weapons: 1,
      shields: 1,
      lifeSupport: 10,
      navigation: 10,
      robotics: 10,
    };
    const fits = new Set<string>();
    for (const profile of ALL_NPC_PROFILES) {
      const ship = npcShipForProfile(profile);
      const raised = RAMPED.filter((id) => ship[id].strength > BASE[id]);
      expect(raised, `${profile.name} specialisms`).toHaveLength(3);
      for (const id of raised) {
        // The ramp is exactly `2 x tier` on top of the player's starting strength.
        expect(ship[id].strength).toBe(BASE[id] + 2 * profile.tier);
      }
      fits.add(RAMPED.map((id) => `${id}:${ship[id].strength}`).join(' '));
    }
    // N6 measured ONE distinct component fit across all 30 captains. Anything close
    // to that again means tier is back to being the only axis.
    expect(fits.size).toBeGreaterThan(10);
  });

  it('leaves every seeded component on a rung the yard can sell the next step of', () => {
    // Seeded strengths sit BETWEEN yard tiers (as `npcDrives` has since T-106), so
    // the one property that must hold is that `componentTierForStrength` floors
    // them onto a rung whose NEXT rung is a strict improvement — otherwise a
    // captain's first purchase would be a downgrade.
    for (const profile of ALL_NPC_PROFILES) {
      const ship = npcShipForProfile(profile);
      for (const id of COMPONENT_IDS) {
        const next = componentTierForStrength(ship[id].strength) + 1;
        expect(next).toBeLessThanOrEqual(9);
        expect(next * 10).toBeGreaterThan(ship[id].strength);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// N2 · THE UPGRADE DECISION. The step's premise, measured by N6: NPCs hoarded and
// never bought, so the day-120 roster was byte-identical to day 1 and six of the
// Honor List's eight titles were uncontestable by construction.
// ---------------------------------------------------------------------------
describe('N2 · NPCs upgrade their ships', () => {
  it("buys through the engine's own yard — the fit moves and the purse pays for it", () => {
    const before = npcFor('npc-cargo-king', { credits: 50000 });
    const { npc } = resolveNpcDay(before, new SeededRng(1), NO_BOARD);
    const changed = COMPONENT_IDS.filter(
      (id) => npc.ship[id].strength !== before.ship[id].strength,
    );
    expect(changed.length + (npc.ship.cargoPods === before.ship.cargoPods ? 0 : 1)).toBeGreaterThan(
      0,
    );
    // A bought component sits on an exact yard rung (`strength = tier * 10`) — the
    // signature of `applyShipyardMutation`, not of an NPC-private mutation.
    for (const id of changed) {
      expect(npc.ship[id].strength % 10).toBe(0);
      expect(npc.ship[id].condition).toBe(9);
    }
  });

  it('never spends a captain below the broke line the cast already lives by', () => {
    // The reserve is `NPC_POVERTY_CREDITS`, so a refit can never be the thing that
    // puts a captain under poverty pressure.
    let state = createInitialState(4);
    for (let day = 0; day < 120; day += 1) {
      state = advanceDay(state, [{ type: 'Wait' }]).state;
      for (const npc of state.npcs) {
        expect(npc.credits).toBeGreaterThanOrEqual(0);
        expect(npc.ship.fuel).toBeGreaterThanOrEqual(0);
        expect(npc.ship.fuel).toBeLessThanOrEqual(npc.ship.maxFuel);
      }
    }
  });

  it('never SELLS a captain more cargo pods than the hull licenses', () => {
    // N3 CORRECTION. This assertion used to read
    // `cargoPods <= maxCargoPodsForShip(ship)` over every captain every day, and it
    // held only because NPCs could not be shot at. It is NOT a true invariant of a
    // ship: `maxCargoPodsForShip` is `(hull.condition + 1) * hullCapacity`, so hull
    // CONDITION damage shrinks the ceiling under a hold that is already full, and
    // nothing in the engine re-clamps `cargoPods` afterwards — the player ends
    // combat over their own ceiling in exactly the same way. Asserting it of NPCs
    // was therefore asserting something the player does not satisfy, which is the
    // inverse of this track's standing constraint.
    //
    // What the yard actually guarantees is the real invariant, and it is the one
    // worth holding: a PURCHASE never takes a captain past the ceiling. `fillHold`
    // computes `room = maxCargoPodsForShip - cargoPods`, so a damaged captain over
    // the line gets `room <= 0` and buys nothing rather than topping up.
    let state = createInitialState(4);
    for (let day = 0; day < 120; day += 1) {
      const before = new Map(state.npcs.map((n) => [n.id, n.ship.cargoPods]));
      state = advanceDay(state, [{ type: 'Wait' }]).state;
      for (const npc of state.npcs) {
        const had = before.get(npc.id) ?? 0;
        if (npc.ship.cargoPods > had) {
          // Pods went UP, so the yard sold some — that purchase must respect the
          // ceiling as the ship stood when it completed.
          expect(
            npc.ship.cargoPods,
            `${npc.id} bought past its hull ceiling on day ${day}`,
          ).toBeLessThanOrEqual(maxCargoPodsForShip(npc.ship));
        }
      }
    }
  });

  it('unfreezes the roster: day 120 is no longer day 1, and the field diverges', () => {
    // N6's reading, as an assertion. Before N2 this set had exactly five members
    // at every horizon — the five seeded tiers — at day 1 and at day 120 alike.
    const fitOf = (ship: (typeof state.npcs)[number]['ship']) =>
      `${COMPONENT_IDS.map((id) => ship[id].strength).join('/')}#${ship.cargoPods}`;
    let state = createInitialState(5);
    const day1 = new Set(state.npcs.map((npc) => fitOf(npc.ship)));
    for (let day = 0; day < 120; day += 1) {
      state = advanceDay(state, [{ type: 'Wait' }]).state;
    }
    const day120 = new Set(state.npcs.map((npc) => fitOf(npc.ship)));
    expect(day120).not.toEqual(day1);
    expect(day120.size).toBeGreaterThan(5);
    // Some captains compound and some stay stuck — no universal escalator.
    const pods = state.npcs.map((npc) => npc.ship.cargoPods);
    expect(Math.max(...pods)).toBeGreaterThan(Math.min(...pods));
  });

  it('rolls no die of its own (the verb ⟺ StatCheck invariant is untouched)', () => {
    // The refit must consume no rng: if it did, an arm that changes only the yard
    // ladder would move every downstream roll and stop being attributable.
    const rich = npcFor('npc-cargo-king', { credits: 500000 });
    const poor = { ...structuredClone(rich), credits: 200 };
    const richDay = resolveNpcDay(rich, new SeededRng(11), NO_BOARD);
    const poorDay = resolveNpcDay(poor, new SeededRng(11), NO_BOARD);
    const checks = (events: GameEvent[]) => events.filter((e) => e.type === 'StatCheck');
    expect(checks(richDay.events)).toEqual(checks(poorDay.events));
    expect(richDay.npc.lastAction!.type).toBe(poorDay.npc.lastAction!.type);
  });
});

describe('Intent weights steer behavior (property, 300 seeds)', () => {
  function actionRates(profileId: string): Record<string, number> {
    const counts: Record<string, number> = {};
    const seeds = 300;
    for (let seed = 1; seed <= seeds; seed++) {
      const { npc } = resolveNpcDay(npcFor(profileId), new SeededRng(seed), NO_BOARD);
      const type = npc.lastAction!.type;
      counts[type] = (counts[type] ?? 0) + 1;
    }
    const rates: Record<string, number> = {};
    for (const [type, count] of Object.entries(counts)) {
      rates[type] = count / seeds;
    }
    return rates;
  }

  it('Cargo King (Wealth, TRADE 5) trades far more often than he fights', () => {
    const rates = actionRates('npc-cargo-king');
    expect(rates['Trade'] ?? 0).toBeGreaterThan(rates['Combat'] ?? 0);
    expect(rates['Trade'] ?? 0).toBeGreaterThan(0.5);
  });

  it('Iron Vex (Dominance, GUNS 4) fights far more often than he trades', () => {
    // Bloodthirsty (dc 14) overrides many combat days outright, so the
    // resolved Combat rate is deflated — the property still holds by a wide
    // margin: fighting dwarfs trading.
    const rates = actionRates('npc-iron-vex');
    expect(rates['Combat'] ?? 0).toBeGreaterThan(2 * (rates['Trade'] ?? 0));
    expect(rates['Combat'] ?? 0).toBeGreaterThan(0.15);
  });
});

describe('NPC economics are real (T-106)', () => {
  it('pays the same jump fuel cost the player would for the same route', () => {
    // Warp Hound (Discovery/PILOT 5) travels most days — find a travel day.
    for (let seed = 1; seed <= 100; seed++) {
      const before = npcFor('npc-warp-hound');
      const { npc, events } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
      if (npc.lastAction?.type !== 'Travel') continue;
      // N3 · Skip an interdicted jump. This assertion is about the JUMP's price,
      // and a captain who ran or fought on the way also paid RUN_FUEL_COST /
      // FIGHT_FUEL_COST — the player's own encounter fuel prices, on the player's
      // own terms. Those are asserted separately by the N3 block below; mixing them
      // in here would make this test pass or fail on the encounter roll.
      if (events.some((e) => e.type === 'NpcEncounter')) continue;
      // …and skip a ROUGH jump, which burns NPC_TRAVEL_FAIL_EXTRA_FUEL on top of
      // the route price. This test previously relied on the first travel day it
      // found happening to be a clean one; N3's encounter roll moved the stream and
      // the next matching seed was a failure, so the dependency is now explicit
      // rather than accidental.
      const travelCheck = events.find(
        (e) => e.type === 'StatCheck' && e.actionContext === 'npc-travel',
      );
      if (travelCheck?.type === 'StatCheck' && !travelCheck.result.success) continue;

      // N2 · Through the SHIP's own drives, Trans-Warp flag and navigation
      // discount — the player's four-argument call. It used to read
      // `npcDrives(profile.tier)` with the nav argument omitted, which was only
      // ever correct while every captain flew the junker's navigation; a
      // navigation specialist now pays strictly less for the same route, and this
      // is the assertion that says so rather than one that pins it back to 1.
      const expectedCost = jumpFuelCost(
        before.ship.drives,
        distance(before.currentSystemId, npc.currentSystemId),
        before.ship.hasTransWarpDrive,
        navFuelFactor(before.ship),
      );
      expect(npc.currentSystemId).not.toBe(before.currentSystemId);
      expect(npc.ship.fuel).toBe(before.ship.fuel - expectedCost);
      return;
    }
    throw new Error('no travel day found in 100 seeds');
  });

  it('a trade day moves the NPC to the contract destination and pays real credits', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const before = npcFor('npc-cargo-king');
      const { npc } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
      if (npc.lastAction?.type !== 'Trade') continue;

      expect(npc.currentSystemId).not.toBe(before.currentSystemId);
      expect(npc.credits).toBeGreaterThan(before.credits);
      expect(npc.ship.fuel).toBeLessThan(before.ship.fuel);
      return;
    }
    throw new Error('no trade day found in 100 seeds');
  });

  it('a broke, dry NPC idles on odd jobs instead of flying for free', () => {
    let sawBeggingWire = false;
    for (let seed = 1; seed <= 100; seed++) {
      const before = npcFor('npc-rust-bucket', { credits: 10, fuel: 0 });
      const { npc, events } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
      if (npc.lastAction?.type === 'FlawOverride' || npc.lastAction?.type === 'Socialize') {
        continue;
      }

      // No free economics: he cannot jump (no fuel, no credits for fuel).
      expect(npc.currentSystemId).toBe(before.currentSystemId);
      expect(npc.lastAction?.type).toBe('Idle');
      expect(npc.credits).toBeGreaterThan(before.credits); // odd-job alms
      if (
        events.some((e) => e.type === 'WireEntry' && e.message.includes('begging for fuel money'))
      ) {
        sawBeggingWire = true;
      }
    }
    expect(sawBeggingWire).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-1201 · NPCs roll real checks. Every NPC verb now resolves through the SAME
// shared check() the player uses (PRD §7: "one system — there is no separate
// AI"), emitting a StatCheck event. These tests pin the load-bearing invariant
// (verb ⟺ StatCheck) that T-1202 builds on, and prove the DCs are sourced from
// content, not from shadow literals in npc.ts.
// ---------------------------------------------------------------------------
describe('T-1201 NPCs roll real checks', () => {
  it('every resolved verb emits exactly one matching StatCheck; Idle/FlawOverride emit none', () => {
    const seenContexts = new Set<string>();
    let sawFlawOverride = false;
    let sawIdle = false;

    // Sweep the whole cast across two funding states so all five verbs AND the
    // broke fallbacks (Idle) AND flaw overrides actually fire.
    const fundings: (Partial<NpcState> & { fuel?: number })[] = [
      { credits: 5000, fuel: 1000 }, // flush: verbs execute
      { credits: 30, fuel: 5 }, // broke & dry: verb executors fall back to Idle
    ];

    for (const profile of ALL_NPC_PROFILES) {
      for (const funding of fundings) {
        for (let seed = 1; seed <= 40; seed += 1) {
          const { npc, events } = resolveNpcDay(
            npcFor(profile.id, funding),
            new SeededRng(seed),
            NO_BOARD,
          );
          const type = npc.lastAction!.type;
          // N3 · Count the checks carrying a VERB context, not every StatCheck in
          // the batch. An interdiction now happens INSIDE a Trade or Travel day and
          // rolls its own per-round checks, which is why they were given their own
          // `npc-encounter-*` contexts (see types.ts): the verb ⟺ StatCheck
          // contract is about the verb's resolution roll, and the sim's
          // trade-failure denominator filters on `npc-trade` specifically. If the
          // encounter rolls had reused the verb contexts, they WOULD have corrupted
          // that denominator — which is what this split protects.
          const verbContexts = new Set<string>(Object.values(VERB_CONTEXT));
          const statChecks = events.filter(
            (e) => e.type === 'StatCheck' && e.actionContext && verbContexts.has(e.actionContext),
          );
          // A captain lost with their ship resolved no verb — their day ended in the
          // wreck, so the verb ⟺ StatCheck pairing does not apply to them.
          if (npc.dead) continue;

          if (type in VERB_CONTEXT) {
            // A resolved verb ⟺ exactly one StatCheck with the matching context.
            expect(
              statChecks,
              `${profile.id} ${type} seed ${seed} should emit exactly one verb StatCheck`,
            ).toHaveLength(1);
            const check = statChecks[0];
            expect(check.type === 'StatCheck' && check.actionContext).toBe(VERB_CONTEXT[type]);
            expect(check.type === 'StatCheck' && check.actor).toBe(npc.id);
            seenContexts.add(VERB_CONTEXT[type]);
          } else {
            // Idle / FlawOverride are NOT verb resolutions — they roll nothing
            // through check(), so no verb StatCheck may be emitted (keeps the sim's
            // trade-failure denominator honest).
            expect(
              statChecks,
              `${profile.id} ${type} seed ${seed} must emit no verb StatCheck`,
            ).toHaveLength(0);
            if (type === 'FlawOverride') sawFlawOverride = true;
            if (type === 'Idle') sawIdle = true;
          }
        }
      }
    }

    // Coverage: every verb's context was observed at least once (guards against
    // a verb silently skipping its roll and never entering the ⟺ branch above).
    expect([...seenContexts].sort()).toEqual([
      'npc-combat',
      'npc-patrol',
      'npc-socialize',
      'npc-trade',
      'npc-travel',
    ]);
    // ...and the contrapositive was genuinely exercised (not vacuously true).
    expect(sawFlawOverride).toBe(true);
    expect(sawIdle).toBe(true);
  });

  it('binds the emitted StatCheck DC and stat to content NPC_CHECK_DCS (no shadow literals)', () => {
    // Drive each verb to fire and read back the DC/stat off its StatCheck. If
    // the engine used a hardcoded DC instead of the content table, these would
    // diverge. Profiles picked to lean hard into each verb.
    const drivers: Record<NpcIntentType, string> = {
      Trade: 'npc-cargo-king', // Wealth / TRADE 5
      Travel: 'npc-warp-hound', // Discovery / PILOT 5
      Combat: 'npc-iron-vex', // Dominance / GUNS 4
      Patrol: 'npc-the-warden', // Justice / GRIT high
      Socialize: 'npc-silk-dagger', // GUILE-leaning
    };

    const verified = new Set<string>();
    for (const [intent, profileId] of Object.entries(drivers) as [NpcIntentType, string][]) {
      const context = VERB_CONTEXT[intent];
      for (let seed = 1; seed <= 400 && !verified.has(context); seed += 1) {
        const { events } = resolveNpcDay(npcFor(profileId), new SeededRng(seed), NO_BOARD);
        const check = events.find((e) => e.type === 'StatCheck' && e.actionContext === context);
        if (!check || check.type !== 'StatCheck') continue;
        expect(check.dc, `${intent} DC must come from content`).toBe(NPC_CHECK_DCS[intent]);
        expect(check.stat).toBe(INTENT_STAT_AFFINITY[intent]);
        // The recorded modifier is the profile's affinity stat, proving the roll
        // read profile.stats[stat] (not NpcState — stats live on the profile).
        const profile = ALL_NPC_PROFILES.find((p) => p.id === profileId)!;
        expect(check.result.modifier).toBe(profile.stats[INTENT_STAT_AFFINITY[intent]]);
        verified.add(context);
      }
    }
    expect([...verified].sort()).toEqual([
      'npc-combat',
      'npc-patrol',
      'npc-socialize',
      'npc-trade',
      'npc-travel',
    ]);
  });

  it('has no hardcoded DC literals in npc.ts source and sources them from content', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../npc.ts'),
      'utf8',
    );
    // The two removed inline thresholds (Combat >=12, Socialize >=14) must be
    // gone from the source entirely (code AND comments — the comments were
    // reworded so this guard cannot pass on prose alone).
    expect(source).not.toMatch(/>=\s*12/);
    expect(source).not.toMatch(/>=\s*14/);
    // ...and the DCs are pulled from the content table.
    expect(source).toMatch(/NPC_CHECK_DCS/);
    expect(source).toMatch(/from '@spacerquest\/content'/);
  });
});

describe('Disposition helper', () => {
  function stateWithNpc(disposition: number) {
    const state = createInitialState(1);
    state.npcs[0].disposition = disposition;
    return { state, npcId: state.npcs[0].id };
  }

  it('applies deltas and emits DispositionChanged', () => {
    const { state, npcId } = stateWithNpc(0);
    const events: GameEvent[] = [];
    applyDisposition(state, npcId, 2, 'tribute', events);

    expect(state.npcs[0].disposition).toBe(2);
    expect(events).toContainEqual({
      type: 'DispositionChanged',
      day: state.day,
      npcId,
      delta: 2,
      disposition: 2,
      reason: 'tribute',
    });
  });

  it('clamps to [-10, +10] and reports the applied delta', () => {
    const { state, npcId } = stateWithNpc(9);
    const events: GameEvent[] = [];
    applyDisposition(state, npcId, 5, 'tribute', events);
    expect(state.npcs[0].disposition).toBe(10);
    expect(events[0]).toMatchObject({ type: 'DispositionChanged', delta: 1, disposition: 10 });

    state.npcs[0].disposition = -9;
    const negEvents: GameEvent[] = [];
    applyDisposition(state, npcId, -5, 'defeat', negEvents);
    expect(state.npcs[0].disposition).toBe(-10);
    expect(negEvents[0]).toMatchObject({ type: 'DispositionChanged', delta: -1, disposition: -10 });
  });

  it('emits nothing when already pinned at a clamp bound', () => {
    const { state, npcId } = stateWithNpc(10);
    const events: GameEvent[] = [];
    applyDisposition(state, npcId, 3, 'tribute', events);
    expect(state.npcs[0].disposition).toBe(10);
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// N3 · NPCs MEET PIRATES, AND ANSWER THEM.
//
// The step's own Proves clause: NPCs lose ships at a rate in the same order as
// the player's; contract competition drops when captains die; the wire narrates
// it. The rate question belongs to the capstone sweep — what is asserted here is
// that the machinery is REAL and that it runs on the PLAYER'S rules, plus the four
// "living field" skips that marking a record dead makes mandatory.
//
// Written after the 2026-07-29 audit found this step marked SHIPPED with none of
// it built, so each assertion names the deliverable it stands for.
// ---------------------------------------------------------------------------
describe('N3 · NPC interdictions and permanent death', () => {
  /** Drive many captain-days and collect what the interdictions did. */
  function encounterRun(seed: number, days: number) {
    let state = createInitialState(seed);
    const encounters: Extract<GameEvent, { type: 'NpcEncounter' }>[] = [];
    const losses: Extract<GameEvent, { type: 'NpcShipLost' }>[] = [];
    for (let d = 0; d < days; d += 1) {
      const step = advanceDay(state, [{ type: 'Wait' }]);
      state = step.state;
      for (const e of step.events) {
        if (e.type === 'NpcEncounter') encounters.push(e);
        if (e.type === 'NpcShipLost') losses.push(e);
      }
    }
    return { state, encounters, losses };
  }

  it('generates real interdictions on NPC jumps, and captains die permanently', () => {
    // The two deliverables the audit found entirely absent: encounters on NPC
    // jumps, and the sharp end — ship loss.
    const { state, encounters, losses } = encounterRun(7, 200);
    expect(encounters.length, 'the cast must actually be interdicted').toBeGreaterThan(50);
    expect(losses.length, 'captains must actually be able to die').toBeGreaterThan(0);

    // Every loss marks the record dead, and the record STAYS on the roster.
    for (const loss of losses) {
      const record = state.npcs.find((n) => n.id === loss.npcId);
      expect(record, 'a dead captain is MARKED, never deleted').toBeDefined();
      expect(record!.dead).toBe(true);
    }
    // Permanent: no succession, no replacement. The roster length never changes,
    // but the LIVING field shrinks — the intended fiction ("sometimes a player
    // quits"), and the thing N8 must measure the rate of.
    expect(state.npcs.length).toBe(createInitialState(7).npcs.length);
    expect(state.npcs.filter((n) => n.dead).length).toBe(new Set(losses.map((l) => l.npcId)).size);
  });

  it('does not empty the roster over a long career (the Disproves limb)', () => {
    // N3's Disproves: "the roster empties out over a long career". Graded here as
    // a floor rather than a rate — the rate itself is the capstone's job.
    for (const seed of [1, 7, 42]) {
      const { state } = encounterRun(seed, 200);
      const simCaptains = state.npcs.filter((n) =>
        ALL_NPC_PROFILES.some((p) => p.id === n.profileId),
      );
      const living = simCaptains.filter((n) => !n.dead).length;
      expect(living, `seed ${seed}: the field must not empty out`).toBeGreaterThan(20);
    }
  });

  it('answers the pirate with a real stance, priced through the player’s own rules', () => {
    const { encounters } = encounterRun(7, 200);
    // A stance per round, from the player's own triangle — never an empty answer.
    for (const e of encounters) {
      expect(e.stances.length).toBeGreaterThan(0);
      expect(e.stances.length).toBeLessThanOrEqual(NPC_ENCOUNTER_MAX_ROUNDS);
      expect(e.rounds).toBeLessThanOrEqual(NPC_ENCOUNTER_MAX_ROUNDS);
      for (const s of e.stances) expect(['talk', 'run', 'fight']).toContain(s);
    }
    // All three corners of the triangle are reachable by the cast.
    const played = new Set(encounters.flatMap((e) => e.stances));
    expect(played, 'the cast must use the whole triangle').toEqual(
      new Set(['talk', 'run', 'fight']),
    );
    // Every resolution kind the type declares is reachable except by luck alone.
    const outcomes = new Set(encounters.map((e) => e.resolution));
    for (const expected of ['talked-down', 'escaped', 'defeated']) {
      expect(outcomes, `resolution '${expected}' must be reachable`).toContain(expected);
    }
  });

  it('pays tribute on the player’s exact schedule — no NPC-private price', () => {
    // The standing constraint, as an assertion: the credits a captain hands over
    // must be a sum of `tributeForRound` terms, the SAME function the player's
    // resolveTalk and the UI's tribute preview call. A private NPC schedule is the
    // R2c failure mode and this is what would catch it.
    const { encounters } = encounterRun(7, 200);
    const paid = encounters.filter((e) => e.resolution === 'talked-down' && e.creditsPaid);
    expect(paid.length).toBeGreaterThan(0);

    // Every value the shared schedule can possibly quote: each round the cast can
    // reach, each interceptor class (Brigand halves, Reptiloid doubles), each tier
    // gap the [tier-1, tier+1] matchmaking band can produce. A captain paying a
    // number outside this set would mean npc.ts had invented its own price — which
    // is precisely the R2c drift this assertion exists to catch.
    const kinds = [undefined, 'PIRATE', 'PATROL', 'RIM_PIRATE', 'BRIGAND', 'REPTILOID'] as const;
    const quotable = new Set<number>();
    for (let round = 1; round <= NPC_ENCOUNTER_MAX_ROUNDS; round += 1) {
      for (const kind of kinds) {
        for (let gap = 0; gap <= 4; gap += 1) quotable.add(tributeForRound(round, kind, gap));
      }
    }
    for (const e of paid) {
      expect(
        quotable,
        `${e.npcId} paid ${e.creditsPaid} — not a price tributeForRound can quote`,
      ).toContain(e.creditsPaid);
    }
  });

  it('pays the player’s salvage rate on a win, not an NPC-private one', () => {
    const { encounters } = encounterRun(7, 200);
    const wins = encounters.filter((e) => e.resolution === 'defeated');
    expect(wins.length).toBeGreaterThan(0);
    for (const e of wins) {
      // COMBAT_SALVAGE_PER_TIER × tier, tiers banded to 1-5 → the whole legal set.
      const legal = [1, 2, 3, 4, 5].map((t) => COMBAT_SALVAGE_PER_TIER * t);
      expect(legal).toContain(e.salvageCredits);
    }
  });

  it('damps the interdiction rate in Tour One, exactly as it does for the player', () => {
    // The multiplier belongs to the ERA, not to who is flying — exempting the cast
    // from it would be an exemption in the other direction.
    const count = (era: 'TOUR_ONE' | 'VETERAN'): number => {
      let hits = 0;
      for (const profile of ALL_NPC_PROFILES) {
        for (let seed = 1; seed <= 30; seed += 1) {
          const { events } = resolveNpcDay(npcFor(profile.id), new SeededRng(seed), {
            ...NO_BOARD,
            era,
          });
          hits += events.filter((e) => e.type === 'NpcEncounter').length;
        }
      }
      return hits;
    };
    const tourOne = count('TOUR_ONE');
    const veteran = count('VETERAN');
    expect(veteran).toBeGreaterThan(0);
    expect(tourOne, 'Tour One must be gentler on the cast too').toBeLessThan(veteran);
  });

  it('resolves inside the tick — no captain carries an encounter into tomorrow', () => {
    // The second sanctioned abstraction (see resolveNpcEncounter's header): the
    // cast's encounter cannot span days on a fresh hand, so it must always close.
    // A leak here would be an NPC frozen mid-fight forever.
    const { encounters } = encounterRun(42, 120);
    expect(encounters.length).toBeGreaterThan(0);
    for (const e of encounters) {
      expect(
        ['talked-down', 'escaped', 'defeated', 'destroyed', 'survived'],
        'every interdiction closes within its tick',
      ).toContain(e.resolution);
    }
  });

  describe('the four skips that marking a record dead makes mandatory', () => {
    /** A state with one captain killed off, and the roster otherwise untouched. */
    function withOneDead(seed = 3) {
      const state = createInitialState(seed);
      const victim = state.npcs.find((n) =>
        ALL_NPC_PROFILES.some((p) => p.id === n.profileId),
      )!;
      // Route the write through the same door the engine uses; the test owns this
      // state outright, so a direct mark is a fixture, not a cross-boundary write.
      const marked = { ...victim, dead: true, disposition: -6 };
      return {
        state: { ...state, npcs: state.npcs.map((n) => (n.id === victim.id ? marked : n)) },
        victimId: victim.id,
      };
    }

    it('takes no turn at dusk', () => {
      const { state, victimId } = withOneDead();
      const before = state.npcs.find((n) => n.id === victimId)!;
      let next = state;
      for (let d = 0; d < 20; d += 1) next = advanceDay(next, [{ type: 'Wait' }]).state;
      const after = next.npcs.find((n) => n.id === victimId)!;
      // Untouched across twenty days: no verb, no credits, no fuel, no movement.
      expect(after.credits).toBe(before.credits);
      expect(after.currentSystemId).toBe(before.currentSystemId);
      expect(after.ship.fuel).toBe(before.ship.fuel);
      expect(after.lastAction).toEqual(before.lastAction);
    });

    it('does not talk on the wire', () => {
      // "A dead captain talks" is the exact failure the roster split was built
      // around; the daily wire loop is a second door into it.
      const { state, victimId } = withOneDead();
      let next = { ...state };
      // Give the corpse a lastAction, which is what the wire loop narrates.
      next = {
        ...next,
        npcs: next.npcs.map((n) =>
          n.id === victimId ? { ...n, lastAction: { type: 'Trade' as const, details: 'hauled ore' } } : n,
        ),
      };
      for (let d = 0; d < 20; d += 1) {
        const step = advanceDay(next, [{ type: 'Wait' }]);
        next = step.state;
        const spoke = step.events.some(
          (e) => e.type === 'WireEntry' && e.message.includes('hauled ore'),
        );
        expect(spoke, 'a dead captain must not narrate on the wire').toBe(false);
      }
    });

    it('keeps its grudge instead of decaying to neutral', () => {
      // The deliberate reading of "the record stays … for any grudge the player
      // still carries": the standing is part of what the record is FOR, so it
      // stops moving rather than fading over the rest of the career.
      const { state, victimId } = withOneDead();
      let next = state;
      for (let d = 0; d < 60; d += 1) next = advanceDay(next, [{ type: 'Wait' }]).state;
      expect(next.npcs.find((n) => n.id === victimId)!.disposition).toBe(-6);
    });

    it('is never drawn as an interceptor against the player', () => {
      // `buildNamedCandidates` reads the roster; a corpse in that pool would put a
      // dead captain back in the player's cockpit.
      const { state, victimId } = withOneDead();
      const rng = new SeededRng(11);
      for (let i = 0; i < 400; i += 1) {
        const picked = selectEncounterInterceptor(state, 1, 5, 3, rng);
        expect(picked.id).not.toBe(victimId);
      }
    });
  });
});
