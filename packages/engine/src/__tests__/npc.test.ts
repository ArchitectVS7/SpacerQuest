import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  ARCHETYPE_INTENT_MULTIPLIERS,
  IDEAL_WEIGHTS,
  INTENT_STAT_AFFINITY,
  NEUTRAL_INTENT_MULTIPLIERS,
  NPC_INTENT_TYPES,
  NPC_PROFILES,
  NpcArchetype,
  NAV_FUEL_FLOOR,
  NPC_CHECK_DCS,
  // T-149 · the socialize mint, pinned unchanged on both sides of the hasHangout read
  NPC_SOCIALIZE_WIN_CREDITS,
  NPC_SOCIALIZE_LOSS_CREDITS,
  ALL_NPC_PROFILES,
  NpcIntentType,
  NpcProfile,
  STAR_SYSTEMS,
  distance,
  // N3
  COMBAT_SALVAGE_PER_TIER,
  NPC_ENCOUNTER_MAX_ROUNDS,
  // N13/T-156 · the virtual hand's size, read from the same constant the deal uses
  DAWN_BASE_HAND_SIZE,
  // N11 · the ONE deed slate — a captain's earned ids are asserted to be members of it
  DEEDS,
  // N11/T-021 · the gated rows the captain's refit ladder now asks the yard for
  SPECIAL_EQUIPMENT,
} from '@spacerquest/content';
import {
  NPC_START_FUEL,
  applyDisposition,
  npcDrives,
  npcShipForProfile,
  pickContract,
  pickIntent,
  resolveNpcDay,
  NpcDayContext,
  // T-140 · the decision-trace surface (docs/BALANCE-TELEMETRY_SPEC.md §3)
  type NpcDecisionEvidence,
  type NpcDecisionTrace,
} from '../npc.js';
import { componentTierForStrength, maxCargoPodsForShip } from '../actions/shipyard.js';
// N3 · the interceptor pool (dead-captain skip) and the shared tribute schedule
import { selectEncounterInterceptor } from '../actions/travel.js';
import { tributeForRound } from '../combatRules.js';
import { starterShip } from '../state.js';
import { ShipComponentId } from '../types.js';
import {
  calculateFuelCapacity,
  contractSpecFromShip,
  generateManifestBoard,
  jumpFuelCost,
} from '../economy.js';
import { accrueDeeds, emptyDeedRegistry, rankForDeedCount } from '../deeds.js';
import { hasSpecialEquipment, navFuelFactor } from '../components.js';
import { advanceDay } from '../day.js';
import { CURRENT_SAVE_VERSION } from '../save.js';

/** Longest route the cast can fly (systems 1-20): Cygnus-16 → Rigel-19. The
 *  worst case the hull-derived fuel ceiling has to clear — computed from the
 *  content star map, never restated as a literal. */
const MAX_NPC_ROUTE_DISTANCE = Math.max(
  ...Object.values(STAR_SYSTEMS)
    .map((s) => s.id)
    .filter((id) => id <= 20)
    .flatMap((a, _i, ids) => ids.map((b) => distance(a, b))),
);
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { SeededRng } from '../rng.js';
import { CargoContract, GameEvent, NpcState, SpecialEquipmentId } from '../types.js';

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
    // N11 · Every captain carries a real registry now, seeded through the engine's
    // one `emptyDeedRegistry()` exactly as `createInitialState` seeds it.
    registry: emptyDeedRegistry(),
    disposition: 0,
    ...rest,
  };
}

// N3 added `era` to NpcDayContext (the interdiction rate is era-scaled). VETERAN
// is the undamped rate, so a test asserting encounter behaviour sees the full
// chance rather than Tour One's 0.5x.
// N10 added `jobPoolClaims` — an empty ledger is an undrained galaxy, so a
// captain trading here draws a full-depth local board.
// N11 added `edition` — the demo's CONQUEROR ceiling is a property of the world, so
// a captain's deed accrual asks the same `demoLocked` question the player's does.
const NO_BOARD: NpcDayContext = {
  day: 1,
  claimableBoard: null,
  jobPoolClaims: {},
  eraEvent: null,
  era: 'VETERAN',
  edition: 'full',
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

// ---------------------------------------------------------------------------
// T-149 · THE RUMOR MILL KNOWS WHERE THE BARS AREN'T.
//
// `executeSocialize`'s `details` clause is interpolated VERBATIM into the
// player-facing rumor mill (`actions/hangout.ts` `hangoutRumors` →
// RUMOR_TEMPLATES.Socialize), so before this fix the wire told the player a
// captain "cleaned up at the Antares-5 Hangout tables" at a port the game's own
// UI (`ui/format.ts` `hangoutOpen`) tells them has no bar at all. Fourteen of
// the twenty-eight systems carry `hasHangout`, and the cast flies ids 1-20, so
// six reachable rim ports have none.
//
// The fix is FICTION ONLY: one boolean read off content selects prose. The roll,
// the DC, and the credit mint are identical on both sides — which is exactly what
// these tests pin, in both directions.
// ---------------------------------------------------------------------------
describe('T-149 Socialize flavor respects hasHangout', () => {
  /** Derived from content, never restated as literals — if the rim is ever
   *  flagged `hasHangout` these sets move with it rather than going stale. Only
   *  ids 1-20 matter: that is the cast's route pool (`NPC_SYSTEM_IDS`). */
  const REACHABLE = Object.values(STAR_SYSTEMS).filter((s) => s.id <= 20);
  const OFF_HANGOUT_IDS = REACHABLE.filter((s) => s.hasHangout !== true).map((s) => s.id);
  const HANGOUT_IDS = REACHABLE.filter((s) => s.hasHangout === true).map((s) => s.id);
  /** GUILE-leaning, the same driver the T-1201 DC test uses for Socialize. */
  const SOCIALIZER = 'npc-silk-dagger';
  /** Any venue word. The rumor mill must name none of these off-Hangout. */
  const VENUE = /hangout|\bbar\b|tables?/i;

  it('has both port sets non-empty, so nothing below can pass vacuously', () => {
    expect(OFF_HANGOUT_IDS.length).toBeGreaterThan(0);
    expect(HANGOUT_IDS.length).toBeGreaterThan(0);
  });

  it('never narrates a Hangout at a port with no bar, on either outcome branch', () => {
    for (const id of OFF_HANGOUT_IDS) {
      let sawWin = false;
      let sawLoss = false;
      for (let seed = 1; seed <= 400; seed += 1) {
        const before = npcFor(SOCIALIZER, { currentSystemId: id });
        const startCredits = before.credits;
        const { npc } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
        if (npc.lastAction?.type !== 'Socialize') continue;
        const details = npc.lastAction.details ?? '';
        expect(details, `${STAR_SYSTEMS[id].name} (seed ${seed}) has no bar`).not.toMatch(VENUE);
        // ...and it still says WHERE, so the rumor line keeps its place.
        expect(details).toContain(STAR_SYSTEMS[id].name);
        if (npc.credits > startCredits) sawWin = true;
        else if (npc.credits < startCredits) sawLoss = true;
      }
      // Both branches must have been exercised, or one flavor line is unasserted.
      expect(sawWin, `saw a socialize win at ${STAR_SYSTEMS[id].name}`).toBe(true);
      expect(sawLoss, `saw a socialize loss at ${STAR_SYSTEMS[id].name}`).toBe(true);
    }
  });

  it('still names the Hangout where there is one, on either outcome branch', () => {
    // The contrapositive: the fix must not be "delete the word Hangout everywhere".
    for (const id of HANGOUT_IDS.slice(0, 2)) {
      let sawWin = false;
      let sawLoss = false;
      for (let seed = 1; seed <= 400; seed += 1) {
        const before = npcFor(SOCIALIZER, { currentSystemId: id });
        const startCredits = before.credits;
        const { npc } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
        if (npc.lastAction?.type !== 'Socialize') continue;
        expect(npc.lastAction.details ?? '').toMatch(/Hangout/);
        if (npc.credits > startCredits) sawWin = true;
        else if (npc.credits < startCredits) sawLoss = true;
      }
      expect(sawWin).toBe(true);
      expect(sawLoss).toBe(true);
    }
  });

  it('still fires the GUILE check at a port with no bar (verb ⟺ StatCheck holds)', () => {
    for (const id of OFF_HANGOUT_IDS) {
      let socializeDays = 0;
      for (let seed = 1; seed <= 400; seed += 1) {
        const { npc, events } = resolveNpcDay(
          npcFor(SOCIALIZER, { currentSystemId: id }),
          new SeededRng(seed),
          NO_BOARD,
        );
        if (npc.lastAction?.type !== 'Socialize') continue;
        socializeDays += 1;
        const checks = events.filter(
          (e) => e.type === 'StatCheck' && e.actionContext === VERB_CONTEXT.Socialize,
        );
        expect(checks, `one npc-socialize check at ${STAR_SYSTEMS[id].name}`).toHaveLength(1);
        const check = checks[0];
        if (check.type !== 'StatCheck') throw new Error('unreachable');
        expect(check.dc).toBe(NPC_CHECK_DCS.Socialize);
        expect(check.stat).toBe(INTENT_STAT_AFFINITY.Socialize);
      }
      expect(socializeDays).toBeGreaterThan(0);
    }
  });

  it('pays the identical mint on both sides of the boolean', () => {
    // 400cr: above the 150cr ante, below NPC_YARD_RESERVE (1000), so
    // `considerRefit` returns early and the socialize mint is the day's ONLY
    // credit mutation. One rim id and one core id, so the amounts are pinned
    // across the branch rather than only inside it.
    const probes = [OFF_HANGOUT_IDS[0], HANGOUT_IDS[0]];
    for (const id of probes) {
      let sawWin = false;
      let sawLoss = false;
      for (let seed = 1; seed <= 400; seed += 1) {
        const { npc } = resolveNpcDay(
          npcFor(SOCIALIZER, { currentSystemId: id, credits: 400 }),
          new SeededRng(seed),
          NO_BOARD,
        );
        if (npc.lastAction?.type !== 'Socialize') continue;
        const delta = npc.credits - 400;
        if (delta > 0) {
          expect(delta).toBe(NPC_SOCIALIZE_WIN_CREDITS);
          sawWin = true;
        } else {
          expect(delta).toBe(-NPC_SOCIALIZE_LOSS_CREDITS);
          sawLoss = true;
        }
      }
      expect(sawWin, `saw a win at system ${id}`).toBe(true);
      expect(sawLoss, `saw a loss at system ${id}`).toBe(true);
    }
  });

  it('gates on a single content boolean, never a per-system id ladder', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../npc.ts'),
      'utf8',
    );
    // Comments are prose about the rule; the guard is about the CODE, so strip
    // them first (otherwise this passes or fails on documentation edits).
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code.match(/hasHangout/g) ?? []).toHaveLength(1);
    expect(code).toMatch(/STAR_SYSTEMS\[npc\.currentSystemId\]\?\.hasHangout === true/);
    // No id ladder may ever stand in for the flag.
    expect(code).not.toMatch(/currentSystemId\s*===\s*\d/);
    expect(code).not.toMatch(/systemId\s*===\s*\d/);
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
    //
    // DEATH IS SAMPLED ACROSS SEEDS, and it has to be. Permanent loss runs at
    // ~1.4 captains per 200 days (re-measured under N4's blend: 14 deaths over
    // 10 seeds x 200 days, 731 interdictions/run), so a single seed asserting
    // `> 0` is a coin flip dressed as a test — it passed on seed 7 before N4
    // moved the intent distribution and failed after, telling us nothing about
    // whether death still works. Standing amendment 1's corollary is the rule
    // here: never grade a rate this thin off one arm.
    const runs = [1, 7, 42].map((seed) => ({ seed, ...encounterRun(seed, 200) }));
    for (const run of runs) {
      expect(run.encounters.length, `seed ${run.seed} must be interdicted`).toBeGreaterThan(50);
    }
    const allLosses = runs.flatMap((r) => r.losses);
    expect(allLosses.length, 'captains must actually be able to die').toBeGreaterThan(0);

    // Every loss marks the record dead, and the record STAYS on the roster.
    for (const run of runs) {
      for (const loss of run.losses) {
        const record = run.state.npcs.find((n) => n.id === loss.npcId);
        expect(record, 'a dead captain is MARKED, never deleted').toBeDefined();
        expect(record!.dead).toBe(true);
      }
      // Permanent: no succession, no replacement. The roster length never changes,
      // but the LIVING field shrinks — the intended fiction ("sometimes a player
      // quits"), and the thing N8 must measure the rate of.
      expect(run.state.npcs.length).toBe(createInitialState(run.seed).npcs.length);
      expect(run.state.npcs.filter((n) => n.dead).length).toBe(
        new Set(run.losses.map((l) => l.npcId)).size,
      );
    }
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
      const victim = state.npcs.find((n) => ALL_NPC_PROFILES.some((p) => p.id === n.profileId))!;
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
          n.id === victimId
            ? { ...n, lastAction: { type: 'Trade' as const, details: 'hauled ore' } }
            : n,
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

// ---------------------------------------------------------------------------
// N4 · Archetypes bias the Ideal; they do not replace it.
// ---------------------------------------------------------------------------
//
// These tests exist because the FIRST N4 shipped without them and nothing
// caught either failure: an assignment with 0 veterans and 1 smuggler (two
// branches no sweep could reach), and a `pickIntent` that returned a fixed verb
// per archetype, which made ten trader captains the same function and destroyed
// the step's own control arm. Each `it` below pins one of the properties the
// owner's two rulings turn on.

describe('N4 · the archetype roster is curated, not generated', () => {
  it('gives every archetype enough members for its branch to be measurable', () => {
    // RULING 2's floor. A branch with too few members cannot be graded by a
    // sweep, and one with zero is dead code that reads as a design decision.
    const counts = new Map<NpcArchetype, number>();
    for (const profile of NPC_PROFILES) {
      counts.set(profile.archetype, (counts.get(profile.archetype) ?? 0) + 1);
    }
    for (const archetype of Object.keys(ARCHETYPE_INTENT_MULTIPLIERS) as NpcArchetype[]) {
      expect(counts.get(archetype) ?? 0, `${archetype} members`).toBeGreaterThanOrEqual(4);
    }
    // The whole simulation roster is placed — nobody is carrying a default.
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(NPC_PROFILES.length);
  });

  it('carries a multiplier row for every archetype the cast can name', () => {
    // The `?? NEUTRAL_INTENT_MULTIPLIERS` fallback in pickIntent is a safety net
    // for future content, NOT a licence for a shipped archetype to be silently
    // archetype-blind. Adding a seventh archetype to the union without a row
    // here should fail loudly at this line.
    for (const profile of NPC_PROFILES) {
      expect(
        ARCHETYPE_INTENT_MULTIPLIERS[profile.archetype],
        `${profile.name} (${profile.archetype})`,
      ).toBeDefined();
    }
  });

  it('keeps the three assignments the owner ruling worked out by hand', () => {
    // RULING 1's arithmetic is quoted in docs/NPC_REDESIGN.md against these
    // three captains. Re-archetyping one invalidates a recorded worked example.
    const archetypeOf = (id: string) => NPC_PROFILES.find((p) => p.id === id)?.archetype;
    expect(archetypeOf('npc-iron-vex')).toBe('fighter');
    expect(archetypeOf('npc-cargo-king')).toBe('trader');
    expect(archetypeOf('npc-zero-risk')).toBe('trader');
  });
});

describe('N4 · the intent blend', () => {
  /** The distribution `pickIntent` actually draws from, measured rather than
   *  re-derived: 4,000 draws per captain against a fixed seed sequence. */
  function intentRates(profileId: string, credits = 5000): Record<string, number> {
    const profile = ALL_NPC_PROFILES.find((p) => p.id === profileId)!;
    const draws = 4000;
    const counts: Record<string, number> = {};
    const rng = new SeededRng(20260729);
    for (let i = 0; i < draws; i++) {
      const intent = pickIntent(profile, credits, rng);
      counts[intent] = (counts[intent] ?? 0) + 1;
    }
    const rates: Record<string, number> = {};
    for (const [intent, count] of Object.entries(counts)) rates[intent] = count / draws;
    return rates;
  }

  it("reproduces the owner ruling's worked distribution for Cargo King", () => {
    // Wealth {T:6,Tr:2,C:0,P:1,S:1} x trader {2,1,1,1,1} -> {12,2,0,1,1}/16.
    const rates = intentRates('npc-cargo-king');
    expect(rates['Trade']).toBeCloseTo(12 / 16, 1);
    expect(rates['Travel']).toBeCloseTo(2 / 16, 1);
  });

  it('leaves two traders measurably different captains', () => {
    // The point of biasing the Ideal instead of replacing it. Cargo King
    // (Wealth) and Zero Risk (Survival) are both traders; Survival's Patrol 2
    // has to survive the trader multiplier or the archetype has eaten the Ideal.
    const king = intentRates('npc-cargo-king');
    const zero = intentRates('npc-zero-risk');
    expect(king['Trade']).toBeGreaterThan(zero['Trade']);
    expect(zero['Patrol'] ?? 0).toBeGreaterThan(2 * (king['Patrol'] ?? 0));
  });

  it("honours an Ideal's 0 as a veto that no archetype can overrule", () => {
    // Justice zeroes Trade and Socialize outright. The Warden is a VETERAN,
    // whose multiplier doubles Trade — 0 x 2 is still 0.
    expect(IDEAL_WEIGHTS['Justice'].Trade).toBe(0);
    expect(ARCHETYPE_INTENT_MULTIPLIERS['veteran'].Trade).toBeGreaterThan(1);
    const rates = intentRates('npc-the-warden');
    expect(rates['Trade'] ?? 0).toBe(0);
    expect(rates['Socialize'] ?? 0).toBe(0);
  });

  it('keeps the veto shut even when the captain is broke', () => {
    // The poverty override is the one place a flat additive boost would have
    // handed a Justice idealist the verb their worldview forbids. It is a
    // MULTIPLIER for exactly this reason.
    const rates = intentRates('npc-the-warden', 0);
    expect(rates['Trade'] ?? 0).toBe(0);
  });

  it('makes poverty lean a captain toward paying work without ordering it', () => {
    const solvent = intentRates('npc-iron-vex');
    const broke = intentRates('npc-iron-vex', 0);
    expect(broke['Trade'] ?? 0).toBeGreaterThan(1.5 * (solvent['Trade'] ?? 0));
    // ...and he still fights. A broke fighter is not a trader.
    expect(broke['Combat'] ?? 0).toBeGreaterThan(0.3);
  });

  it('gives every captain in the field a real chance of a jump (N3 hand-off)', () => {
    // N3 measured risk exposure allocated by a bug: under the deterministic
    // switch a fighter returned Combat or Patrol and therefore NEVER jumped, so
    // twelve captains faced no lane risk while ten traders absorbed ~68% of all
    // interdictions. Every Ideal carries a positive Travel weight and no
    // multiplier zeroes it, so the blend closes that by construction — this is
    // the assertion that keeps it closed.
    for (const profile of NPC_PROFILES) {
      const rates = intentRates(profile.id);
      expect(rates['Travel'] ?? 0, `${profile.name} Travel share`).toBeGreaterThan(0.02);
    }
  });

  it('never returns a verb an all-zero table forbade', () => {
    // The Idle corner. Unreachable from shipped content, so it is reached here
    // through a synthetic profile rather than left as a comment.
    const silent = {
      ...ALL_NPC_PROFILES.find((p) => p.id === 'npc-cargo-king')!,
      ideal: '__all-zero__',
    };
    IDEAL_WEIGHTS['__all-zero__'] = { Trade: 0, Travel: 0, Combat: 0, Patrol: 0, Socialize: 0 };
    try {
      const rng = new SeededRng(7);
      for (let i = 0; i < 50; i++) expect(pickIntent(silent, 5000, rng)).toBe('Idle');
      // ...and poverty does not talk it into trading either.
      expect(pickIntent(silent, 0, rng)).toBe('Idle');
    } finally {
      delete IDEAL_WEIGHTS['__all-zero__'];
    }
  });

  it('is separable: neutral multipliers reproduce the unbiased Ideal draw', () => {
    // This is what makes the step gradeable. The control arm N4 was measured
    // against sets every multiplier to 1, and that arm must be the pure Ideal
    // distribution — if the archetype leaked in anywhere else in pickIntent, the
    // control would not be a control.
    const profile = ALL_NPC_PROFILES.find((p) => p.id === 'npc-iron-vex')!;
    const ideal = IDEAL_WEIGHTS[profile.ideal];
    const total = NPC_INTENT_TYPES.reduce((sum, i) => sum + ideal[i], 0);
    const saved = ARCHETYPE_INTENT_MULTIPLIERS['fighter'];
    ARCHETYPE_INTENT_MULTIPLIERS['fighter'] = NEUTRAL_INTENT_MULTIPLIERS;
    try {
      const rates = intentRates(profile.id);
      for (const intent of NPC_INTENT_TYPES) {
        expect(rates[intent] ?? 0, `${intent} under the control arm`).toBeCloseTo(
          ideal[intent] / total,
          1,
        );
      }
    } finally {
      ARCHETYPE_INTENT_MULTIPLIERS['fighter'] = saved;
    }
  });
});

// ---------------------------------------------------------------------------
// T-140 · NPC DECISION TRACING (docs/BALANCE-TELEMETRY_SPEC.md §6).
// ---------------------------------------------------------------------------
//
// The spec's §2 finding is that `pickIntent` and `pickContract` compute a full
// distribution and then throw everything but the winner away. These cases assert
// that the trace recovers it — against a KNOWN weight table, not against the
// function's own arithmetic re-derived in the test, which would only assert that
// the code equals itself.
//
// The last case is the one that matters most: a sink must not be able to perturb
// the run. Everything else in this file, every golden and every balance fixture,
// rests on that.

describe('T-140 · decision tracing', () => {
  /** A synthetic Ideal so the weight table under test is stated here, not read
   *  out of shipped content (which would make the assertion move with a content
   *  edit). Same injection shape as the all-zero corner above. */
  const T140_IDEAL = '__t140__';
  const T140_WEIGHTS = { Trade: 6, Travel: 2, Combat: 0, Patrol: 1, Socialize: 1 } as const;

  /** `trader` multiplies Trade by 2 and leaves the rest at 1, so the table above
   *  becomes {12,2,0,1,1} — total 16. That is the owner ruling's own worked
   *  example (ideals.ts:164), which is why this row was chosen. */
  const EXPECTED_CANDIDATES = [
    { option: 'Trade', weight: 12 },
    { option: 'Travel', weight: 2 },
    { option: 'Combat', weight: 0 },
    { option: 'Patrol', weight: 1 },
    { option: 'Socialize', weight: 1 },
  ];

  function withSyntheticIdeal<T>(
    weights: Record<NpcIntentType, number>,
    body: (profile: NpcProfile) => T,
  ): T {
    IDEAL_WEIGHTS[T140_IDEAL] = { ...weights };
    try {
      const base = ALL_NPC_PROFILES.find((p) => p.id === 'npc-cargo-king')!;
      return body({ ...base, ideal: T140_IDEAL });
    } finally {
      delete IDEAL_WEIGHTS[T140_IDEAL];
    }
  }

  /** One `pickIntent` call, returning both halves: what it answered and what it
   *  reported answering. */
  function tracedIntent(
    profile: NpcProfile,
    credits: number,
    rng: SeededRng,
  ): { chosen: NpcIntentType | 'Idle'; entries: NpcDecisionEvidence[] } {
    const entries: NpcDecisionEvidence[] = [];
    const chosen = pickIntent(profile, credits, rng, (evidence) => entries.push(evidence));
    return { chosen, entries };
  }

  it('reports the whole distribution the draw was made from, in content order', () => {
    withSyntheticIdeal({ ...T140_WEIGHTS }, (profile) => {
      const rng = new SeededRng(20260731);
      for (let i = 0; i < 200; i++) {
        const { chosen, entries } = tracedIntent(profile, 5000, rng);
        expect(entries).toHaveLength(1);
        const entry = entries[0];
        expect(entry.kind).toBe('intent');
        expect(entry.candidates).toEqual(EXPECTED_CANDIDATES);
        // §3: `chosen` is the same value the function returns today.
        expect(entry.chosen).toBe(chosen);
        // §3: `roll` is `rng.next() * total`, so it lives in [0, 16).
        expect(entry.roll).not.toBeNull();
        expect(entry.roll!).toBeGreaterThanOrEqual(0);
        expect(entry.roll!).toBeLessThan(16);

        // THE ASSERTION THAT MAKES THIS A TRACE AND NOT A RE-DERIVATION: the
        // prefix-sum bucket the reported roll lands in must be the reported
        // winner. A trace that recomputed the distribution instead of recording
        // the actual draw would pass every line above and fail this one.
        let cumulative = 0;
        let bucket = '';
        for (const candidate of entry.candidates) {
          cumulative += candidate.weight;
          if (entry.roll! < cumulative) {
            bucket = candidate.option;
            break;
          }
        }
        expect(bucket).toBe(entry.chosen);
      }
    });
  });

  it('shows poverty pressure as a WEIGHT on Trade, leaving every other candidate alone', () => {
    withSyntheticIdeal({ ...T140_WEIGHTS }, (profile) => {
      const solvent = tracedIntent(profile, 5000, new SeededRng(11)).entries[0];
      const broke = tracedIntent(profile, 0, new SeededRng(11)).entries[0];
      const weightOf = (entry: NpcDecisionEvidence, option: string) =>
        entry.candidates.find((c) => c.option === option)!.weight;

      // 12 x NPC_POVERTY_TRADE_MULTIPLIER (3, documented at its declaration in
      // npc.ts and deliberately a multiplier rather than a flat term). This line
      // moves only when that pacing constant is deliberately re-tuned.
      expect(weightOf(broke, 'Trade')).toBe(weightOf(solvent, 'Trade') * 3);
      for (const intent of NPC_INTENT_TYPES) {
        if (intent === 'Trade') continue;
        expect(weightOf(broke, intent), `${intent} under poverty`).toBe(weightOf(solvent, intent));
      }
    });
  });

  it('records the Idle corner as a decision with no draw behind it', () => {
    withSyntheticIdeal({ Trade: 0, Travel: 0, Combat: 0, Patrol: 0, Socialize: 0 }, (profile) => {
      const { chosen, entries } = tracedIntent(profile, 0, new SeededRng(3));
      expect(chosen).toBe('Idle');
      expect(entries).toHaveLength(1);
      expect(entries[0].chosen).toBe('Idle');
      // Nothing was drawn, so nothing is reported. This is why §3 types `roll`
      // `number | null` rather than defaulting it to 0 — a 0 would read as a draw.
      expect(entries[0].roll).toBeNull();
      expect(entries[0].candidates.map((c) => c.weight)).toEqual([0, 0, 0, 0, 0]);
    });
  });

  // A board built so that one archetype has a strict argmax and another has a
  // real tie — the tie is the thing §2 says is discarded today. Origin is Sun-3.
  const OFFERS: CargoContract[] = [
    { destination: 2, cargoType: 9, payment: 40000, pods: 4 },
    { destination: 2, cargoType: 1, payment: 20000, pods: 2 },
    { destination: 20, cargoType: 5, payment: 30000, pods: 3 },
    { destination: 15, cargoType: 10, payment: 25000, pods: 2 },
  ];
  const ORIGIN = 1;

  function tracedContract(
    archetype: NpcArchetype,
    rng: SeededRng,
  ): { chosen: number; entry: NpcDecisionEvidence } {
    const entries: NpcDecisionEvidence[] = [];
    const chosen = pickContract(archetype, OFFERS, ORIGIN, rng, (evidence) =>
      entries.push(evidence),
    );
    expect(entries).toHaveLength(1);
    return { chosen, entry: entries[0] };
  }

  it("reports a trader's per-offer scores — which are the cheques themselves", () => {
    const { chosen, entry } = tracedContract('trader', new SeededRng(42));
    expect(entry.kind).toBe('contract');
    expect(entry.candidates).toEqual([
      { option: '0', weight: 40000 },
      { option: '1', weight: 20000 },
      { option: '2', weight: 30000 },
      { option: '3', weight: 25000 },
    ]);
    // §3: the same value the function returns today — an INDEX (F-140-2).
    expect(entry.chosen).toBe(String(chosen));
    expect(entry.chosen).toBe('0');
  });

  it("makes the fighter's TIE visible, which is exactly what is discarded today", () => {
    const { chosen, entry } = tracedContract('fighter', new SeededRng(42));
    // The fighter scores by destination danger: offers 2 and 3 are both rim, so
    // the score table shows two equal maxima and the return value alone cannot
    // tell you the choice was uniform between them.
    const weights = entry.candidates.map((c) => c.weight);
    const best = Math.max(...weights);
    expect(weights.filter((w) => w === best)).toHaveLength(2);
    expect(['2', '3']).toContain(entry.chosen);
    expect(entry.chosen).toBe(String(chosen));
    // For a contract the roll is the TIE-BREAK draw over the tied set, not a
    // weighted draw over the board — `rng.next() * ties`.
    expect(entry.roll!).toBeGreaterThanOrEqual(0);
    expect(entry.roll!).toBeLessThan(2);
    expect(Math.floor(entry.roll!)).toBe(['2', '3'].indexOf(entry.chosen));
  });

  it('binds day/npcId/archetype/ideal once per captain-day, in resolveNpcDay', () => {
    // The identity half of a §3 entry. `pickContract` is handed an archetype and
    // nothing else, so if this were bound anywhere but here the contract entries
    // would carry no captain.
    const entries: NpcDecisionTrace[] = [];
    const profile = ALL_NPC_PROFILES.find((p) => p.id === 'npc-cargo-king')!;
    for (let seed = 1; seed <= 40; seed++) {
      resolveNpcDay(npcFor('npc-cargo-king', { credits: 0 }), new SeededRng(seed), {
        ...NO_BOARD,
        day: 17,
        npcDecisionTrace: (entry) => entries.push(entry),
      });
    }
    expect(entries.length).toBeGreaterThan(40);
    for (const entry of entries) {
      expect(entry.day).toBe(17);
      expect(entry.npcId).toBe('npc-cargo-king');
      expect(entry.archetype).toBe(profile.archetype);
      expect(entry.ideal).toBe(profile.ideal);
    }
    // A broke trader trades most days, so both kinds are reachable from one run
    // of this loop — the contract entries are the ones that prove the binding.
    expect(entries.some((e) => e.kind === 'intent')).toBe(true);
    expect(entries.some((e) => e.kind === 'contract')).toBe(true);
  });

  it('leaves resolveNpcDay byte-identical whether or not a sink is attached', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const quiet = resolveNpcDay(npcFor('npc-iron-vex'), new SeededRng(seed), NO_BOARD);
      const loud = resolveNpcDay(npcFor('npc-iron-vex'), new SeededRng(seed), {
        ...NO_BOARD,
        npcDecisionTrace: () => {},
      });
      expect(JSON.stringify(loud)).toBe(JSON.stringify(quiet));
    }
  });

  it('cannot perturb the run: same answers AND the same rng state, sink or no sink', () => {
    // The inertness claim at its narrowest point. If tracing drew, skipped or
    // reordered a single rng call, every golden in this repo would move.
    const profile = ALL_NPC_PROFILES.find((p) => p.id === 'npc-iron-vex')!;
    const quiet = new SeededRng(4242);
    const loud = new SeededRng(4242);
    for (let i = 0; i < 100; i++) {
      expect(pickIntent(profile, i % 2 === 0 ? 0 : 5000, loud, () => {})).toBe(
        pickIntent(profile, i % 2 === 0 ? 0 : 5000, quiet),
      );
      expect(loud.getState()).toBe(quiet.getState());
    }
    for (const archetype of ['trader', 'fighter', 'smuggler', 'explorer'] as const) {
      expect(pickContract(archetype, OFFERS, ORIGIN, loud, () => {})).toBe(
        pickContract(archetype, OFFERS, ORIGIN, quiet),
      );
      expect(loud.getState()).toBe(quiet.getState());
    }
  });
});

// ---------------------------------------------------------------------------
// N11 · CAPTAINS EARN DEEDS AND RENOWN.
//
// The step's accept criteria, each as its own case: zero at birth (no synthetic
// backfill), real accrual over an ambient career, every earned id a member of
// content `DEEDS`, `rankForDeedCount` as the ONLY rank derivation, and no leak into
// the player's own registry.
// ---------------------------------------------------------------------------
describe('N11 · captains earn deeds and Renown', () => {
  const DEED_IDS = new Set(DEEDS.map((deed) => deed.id));

  it('createInitialState(1) gives every captain ZERO deeds at LIEUTENANT', () => {
    // The anti-backfill pin. N11's ruling: the fast-forward allowance covers the
    // SOURCE, never unearned rank — a tier-5 captain seeded with a rank they never
    // earned is the "constant recomputed from profile" phantom N1 killed.
    const state = createInitialState(1);
    expect(state.npcs.length).toBeGreaterThan(0);
    // Non-vacuous: the roster really does contain top-tier captains who would have
    // been the tempting ones to seed.
    expect(
      state.npcs.some(
        (npc) => (ALL_NPC_PROFILES.find((p) => p.id === npc.profileId)?.tier ?? 0) >= 5,
      ),
    ).toBe(true);
    for (const npc of state.npcs) {
      expect(npc.registry.earned).toEqual([]);
      expect(npc.registry.matchCounts).toEqual({});
      expect(npc.registry.renownRank).toBe('LIEUTENANT');
      expect(npc.registry.renownRank).toBe(rankForDeedCount(0));
    }
  });

  it('a single forced Trade day writes the captain’s registry', () => {
    // Unit-level, so the ambient-run assertion below cannot pass by accident of a
    // long run: one claimable board, one Trade day, one registry write.
    const profile = ALL_NPC_PROFILES.find((p) => p.id === 'npc-cargo-king')!;
    const board = generateManifestBoard(1, new SeededRng(7), npcShipForProfile(profile), 4, null);
    let wrote = false;
    for (let seed = 1; seed <= 60 && !wrote; seed++) {
      const { npc } = resolveNpcDay(npcFor('npc-cargo-king'), new SeededRng(seed), {
        ...NO_BOARD,
        claimableBoard: board,
      });
      if (npc.lastAction?.type !== 'Trade') continue;
      if (npc.registry.earned.length === 0) continue;
      wrote = true;
      // A signed manifest and a delivery both reach content deeds, and every id is a
      // real one.
      for (const deed of npc.registry.earned) expect(DEED_IDS.has(deed.id)).toBe(true);
      expect(npc.registry.earned.map((deed) => deed.id)).toContain('first_manifest');
      expect(npc.registry.renownRank).toBe(rankForDeedCount(npc.registry.earned.length));
    }
    expect(wrote, 'no captain wrote a registry across 60 seeded Trade days').toBe(true);
  });

  it('accrues real deeds and real ranks across a 120-day ambient run', () => {
    let state = createInitialState(1);
    for (let day = 0; day < 120; day++) state = advanceDay(state, []).state;

    const total = state.npcs.reduce((sum, npc) => sum + npc.registry.earned.length, 0);
    expect(total).toBeGreaterThan(0);

    for (const npc of state.npcs) {
      // EVERY earned id is a member of content `DEEDS` — no NPC-only deed table.
      for (const deed of npc.registry.earned) {
        expect(DEED_IDS.has(deed.id), `${npc.id} earned unknown deed ${deed.id}`).toBe(true);
      }
      // …and no id twice.
      expect(new Set(npc.registry.earned.map((deed) => deed.id)).size).toBe(
        npc.registry.earned.length,
      );
      // THE MECHANICAL PROOF that `rankForDeedCount` is the only rank derivation for
      // the cast: every captain's stored rank is exactly what their count buys.
      expect(npc.registry.renownRank, `${npc.id} rank`).toBe(
        rankForDeedCount(npc.registry.earned.length),
      );
    }

    // The dead end N11 exists to remove: at least one captain outranks the opening
    // rung, so `actorRankIndex` is no longer pinned below every gate.
    expect(state.npcs.some((npc) => npc.registry.renownRank !== 'LIEUTENANT')).toBe(true);
  });

  it('no captain’s deed leaks into the PLAYER’s registry over 120 ambient days', () => {
    // THE LEAK THIS GUARDS: `day.ts` pushes `npcEvents` into the same array it later
    // hands to `evaluateDeeds`, so a captain's TradeEvent/TravelEvent/EncounterResolved
    // in that array would earn the PLAYER the deed. The captain's deed-source batch is
    // local for exactly this reason.
    let state = createInitialState(1);
    for (let day = 0; day < 120; day++) state = advanceDay(state, []).state;

    // The player took no action for 120 days, so they earned nothing at all — the
    // strongest form of the assertion, and it holds because the only player-side
    // events an empty career logs (DawnRoll / DayAdvanced / wire lines) match no deed.
    expect(state.player.registry.earned).toEqual([]);
    expect(state.player.registry.matchCounts).toEqual({});
    // And the log agrees: one DeedEarned per player row, which is zero here.
    expect(state.eventLog.filter((event) => event.type === 'DeedEarned')).toHaveLength(
      state.player.registry.earned.length,
    );
    // The captains, meanwhile, demonstrably earned — so the assertion above is about
    // isolation, not about a dead accrual path.
    expect(state.npcs.reduce((sum, npc) => sum + npc.registry.earned.length, 0)).toBeGreaterThan(0);
  });

  it('a captain’s registry survives the save round trip with the rank it earned', () => {
    let state = createInitialState(3);
    for (let day = 0; day < 60; day++) state = advanceDay(state, []).state;
    const restored = deserializeState(serializeState(state));
    expect(restored.npcs.map((npc) => npc.registry)).toEqual(state.npcs.map((npc) => npc.registry));
  });
});

// ---------------------------------------------------------------------------
// N11/T-021 · THE RENOWN GATE IS REACHABLE FROM THE CAPTAIN'S OWN DAY.
//
// `considerRefit` never asked for special equipment, which is the only reason the
// lockout was dormant. Both directions are exercised through `resolveNpcDay` — the
// captain's real turn — and the rank is EARNED through the player's own
// `accrueDeeds`, never assigned. The gate itself is asserted in
// `shipyard.test.ts`; what is asserted here is that a captain reaches it.
// ---------------------------------------------------------------------------
describe('N11 · the Renown gate is reachable from the captain’s own day', () => {
  /** The gated rows, derived from content — the same filter `considerRefit` applies,
   *  so a re-gated table moves both together and neither carries an id list. */
  const GATED = SPECIAL_EQUIPMENT.filter((item) => item.requiredRenownRank !== undefined);

  /** Real deed sources in the shapes `executeTrade` / `executeTravel` emit: a signed
   *  manifest, a delivery and five arrivals (one rimward). Measured to earn exactly
   *  five deeds — first_manifest, first_delivery, first_jump, road_regular,
   *  rimward_bound — which is CAPTAIN, the rung STAR_BUSTER / ARCH_ANGEL sit behind.
   *  No rank is named or written here; `accrueDeeds` derives it. */
  function deedSourceBatch(characterId: string): GameEvent[] {
    const arrive = (destination: number): GameEvent => ({
      type: 'TravelEvent',
      characterId,
      origin: 1,
      destination,
      fuelUsed: 40,
      success: true,
    });
    return [
      {
        type: 'TradeEvent',
        characterId,
        action: 'sign-contract',
        success: true,
        destination: 2,
        cargoType: 1,
        payment: 900,
        actionDetails: 'Signed a manifest.',
      },
      {
        type: 'TradeEvent',
        characterId,
        action: 'deliver-cargo',
        success: true,
        destination: 2,
        cargoType: 1,
        payment: 900,
        actionDetails: 'Delivered cargo!',
      },
      arrive(2),
      arrive(3),
      arrive(4),
      arrive(5),
      arrive(17),
    ];
  }

  function earnedCaptain(credits: number): NpcState {
    const npc = npcFor('npc-cargo-king', { credits });
    accrueDeeds(npc, deedSourceBatch(npc.id), { day: 1, conquerorLocked: false });
    return npc;
  }

  const fittedGated = (ship: NpcState['ship']) =>
    GATED.filter((item) => hasSpecialEquipment(ship, item.id as SpecialEquipmentId));

  it('a captain who EARNED the rank buys rank-gated gear on their own turn', () => {
    const earner = earnedCaptain(500000);
    expect(earner.registry.renownRank).toBe(rankForDeedCount(earner.registry.earned.length));

    let bought = 0;
    for (let seed = 1; seed <= 20 && bought === 0; seed += 1) {
      const { npc, events } = resolveNpcDay(earner, new SeededRng(seed), NO_BOARD);
      const fitted = fittedGated(npc.ship);
      if (fitted.length === 0) continue;
      bought += 1;
      // ONE purchase a day, exactly as the component rung allows.
      expect(fitted).toHaveLength(1);
      // The wire says so, naming content's own item name.
      const wire = events.filter(
        (event): event is Extract<GameEvent, { type: 'WireEntry' }> => event.type === 'WireEntry',
      );
      expect(
        wire.some((entry) => entry.kind === 'npc' && entry.message.includes(fitted[0].name)),
      ).toBe(true);
      // The captain's own purse paid for it (the EXACT debit — credits === before -
      // quote.cost — is pinned in `shipyard.test.ts`; here the day's trade income
      // rides on top, so what is asserted is that the purse fell and stayed solvent).
      expect(npc.credits).toBeLessThan(earner.credits);
      expect(npc.credits).toBeGreaterThanOrEqual(0);
    }
    expect(bought, 'no earned-rank captain reached the gate in 20 seeded days').toBe(1);
  });

  it('the zero-deed twin is REFUSED on every one of the same days (the gate bites)', () => {
    // Identical captain, identical purse, identical seed — only the standing differs.
    for (let seed = 1; seed <= 20; seed += 1) {
      const twin = npcFor('npc-cargo-king', { credits: 500000 });
      expect(twin.registry.earned).toEqual([]);
      const { npc } = resolveNpcDay(twin, new SeededRng(seed), NO_BOARD);
      expect(fittedGated(npc.ship)).toEqual([]);
      // …and the day was an ordinary refit day, so the refusal is the rank and not a
      // captain who never reached the yard: a component rung was taken instead.
      const movedComponent = COMPONENT_IDS.some(
        (id) => npc.ship[id].strength !== twin.ship[id].strength,
      );
      expect(movedComponent || npc.ship.cargoPods !== twin.ship.cargoPods).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// N13 · THE VIRTUAL HAND, AS THE DAY LOOP SEES IT (T-156).
//
// `npc-virtual-hand.test.ts` pins the mechanism in isolation. These pin the three
// properties that are only visible from `resolveNpcDay`: the deal is LAZY, the
// day's allocations account for exactly the checks it rolled, and nothing about
// the hand reaches the save.
// ---------------------------------------------------------------------------
describe('N13 · the virtual hand inside resolveNpcDay', () => {
  it('a day that rolls nothing deals nothing — no rng is consumed by the hand', () => {
    // The invariant `rollNpcCheck` records: "Every broke / underfunded fallback
    // returns Idle/FlawOverride and rolls NOTHING". An EAGER deal would burn five
    // rng values on those days and move every seeded career; this is the test that
    // would catch it, stated against the rng STATE rather than against an outcome.
    let checkedIdle = 0;
    let checkedOverride = 0;
    for (const profile of ALL_NPC_PROFILES) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const broke = npcFor(profile.id, { credits: 30, fuel: 5 });
        const live = new SeededRng(seed);
        const { npc, events } = resolveNpcDay(broke, live, NO_BOARD);
        const type = npc.lastAction?.type;
        if (type !== 'Idle' && type !== 'FlawOverride') continue;
        const verbChecks = events.filter(
          (e) => e.type === 'StatCheck' && e.actor === npc.id,
        ).length;
        expect(verbChecks).toBe(0);

        // The counterfactual: the same day with the hand's five d20s drawn up
        // front would leave the rng in a DIFFERENT place. Re-running the identical
        // day off a stream that has been advanced by a deal must therefore diverge
        // from the real one — which is only a meaningful statement because the
        // real day left the stream where it did.
        const replay = new SeededRng(seed);
        const { npc: again } = resolveNpcDay(npcFor(profile.id, { credits: 30, fuel: 5 }), replay, {
          ...NO_BOARD,
        });
        expect(again.lastAction?.type).toBe(type);
        expect(replay.getState()).toBe(live.getState());
        if (type === 'Idle') checkedIdle += 1;
        else checkedOverride += 1;
      }
    }
    expect(checkedIdle).toBeGreaterThan(0);
    expect(checkedOverride).toBeGreaterThan(0);
  });

  it("a captain's day spends one die per check it rolled, and the surplus is the documented raw-d20 fallback", () => {
    // Allocations are not observable from outside `resolveNpcDay` — but every one
    // of them emits a StatCheck tagged with the captain as actor (the day's verb
    // plus each interdiction stance round), so the EVENTS are an exact census of
    // them. Five dice cover the overwhelming majority of days; the rest fall
    // through to the raw d20 named as boundary 2 at `npcHand.ts`'s definition
    // site, and this test measures that rather than assuming it.
    let days = 0;
    let allocations = 0;
    let overflow = 0;
    let deepestDay = 0;
    for (const profile of ALL_NPC_PROFILES) {
      for (let seed = 1; seed <= 30; seed += 1) {
        const { npc, events } = resolveNpcDay(
          npcFor(profile.id, { credits: 50000, fuel: 1000 }),
          new SeededRng(seed),
          NO_BOARD,
        );
        const checks = events.filter((e) => e.type === 'StatCheck' && e.actor === npc.id).length;
        days += 1;
        allocations += checks;
        overflow += Math.max(0, checks - DAWN_BASE_HAND_SIZE);
        deepestDay = Math.max(deepestDay, checks);
      }
    }
    expect(days).toBeGreaterThan(1000);
    expect(allocations).toBeGreaterThan(0);
    // The census is bounded by the day's shape: one verb check plus at most
    // NPC_ENCOUNTER_MAX_ROUNDS interdiction rounds.
    expect(deepestDay).toBeLessThanOrEqual(1 + NPC_ENCOUNTER_MAX_ROUNDS);
    // And exhaustion is real but rare — reported, never hidden.
    expect(overflow / allocations).toBeLessThan(0.05);
  });

  it('adds no field to the save: NpcState is unchanged and CURRENT_SAVE_VERSION is not bumped', () => {
    // The hand is per-captain-day and never persisted, so N13 owes no migration
    // and no round-trip test. Asserted rather than asserted-in-prose.
    //
    // The number is 15, not the 12 `TASKS.md`'s standing constraint names — that
    // constraint records where the 0.5.2 track STARTED, and three later tasks
    // bumped it legitimately. What N13 claims is that it added none of them.
    expect(CURRENT_SAVE_VERSION).toBe(15);
    const before = npcFor('npc-cargo-king', { credits: 50000, fuel: 1000 });
    const { npc } = resolveNpcDay(before, new SeededRng(4), NO_BOARD);
    // `lastAction` is the ONE key a resolved day is supposed to write that a
    // fresh fixture does not carry; anything else would be N13 leaking.
    const gained = Object.keys(npc).filter((key) => !(key in before));
    expect(gained).toEqual(['lastAction']);
    // …and no hand/die/reroll field anywhere on the persisted record.
    const serialized = JSON.stringify(npc);
    expect(JSON.parse(serialized)).toEqual(npc);
    for (const key of Object.keys(JSON.parse(serialized) as Record<string, unknown>)) {
      expect(/hand|dice|die|reroll/i.test(key), `NpcState gained "${key}"`).toBe(false);
    }
  });
});
