import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  IDEAL_WEIGHTS,
  INTENT_STAT_AFFINITY,
  NAV_FUEL_FLOOR,
  NPC_CHECK_DCS,
  NPC_PROFILES,
  NpcIntentType,
  STAR_SYSTEMS,
  distance,
} from '@spacerquest/content';
import {
  NPC_START_FUEL,
  applyDisposition,
  npcDrives,
  npcShipForProfile,
  resolveNpcDay,
} from '../npc.js';
import { componentTierForStrength, maxCargoPodsForShip } from '../actions/shipyard.js';
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
  const profile = NPC_PROFILES.find((p) => p.id === profileId)!;
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

const NO_BOARD = { day: 1, claimableBoard: null, eraEvent: null };

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
    for (const profile of NPC_PROFILES) {
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
    for (const profile of NPC_PROFILES) {
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
    for (const profile of NPC_PROFILES) {
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
    expect(discounted).toBeLessThan(NPC_PROFILES.length);
  });

  it("seeds a hull the yard would license for the captain's hold, and no larger", () => {
    // THE REMOVED EXEMPTION, pinned from the other side. The hull must cover the
    // pods (or the captain is born holding cargo the engine says they cannot) and
    // must be the SMALLEST that does (or the tank is a gift the player never got).
    for (const profile of NPC_PROFILES) {
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
    for (const profile of NPC_PROFILES) {
      const ship = npcShipForProfile(profile);
      expect(ship.maxFuel).toBeLessThan(NPC_START_FUEL);
      expect(ship.fuel).toBe(ship.maxFuel);
    }
    // And a tier-1 captain now holds exactly what the player's junker holds.
    const junker = starterShip();
    const lowest = npcShipForProfile({ tier: 1, stats: NPC_PROFILES[0].stats });
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
    for (const profile of NPC_PROFILES) {
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
    for (const profile of NPC_PROFILES) {
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
        expect(npc.ship.cargoPods).toBeLessThanOrEqual(maxCargoPodsForShip(npc.ship));
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
      const { npc } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
      if (npc.lastAction?.type !== 'Travel') continue;

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

    for (const profile of NPC_PROFILES) {
      for (const funding of fundings) {
        for (let seed = 1; seed <= 40; seed += 1) {
          const { npc, events } = resolveNpcDay(
            npcFor(profile.id, funding),
            new SeededRng(seed),
            NO_BOARD,
          );
          const type = npc.lastAction!.type;
          const statChecks = events.filter((e) => e.type === 'StatCheck');

          if (type in VERB_CONTEXT) {
            // A resolved verb ⟺ exactly one StatCheck with the matching context.
            expect(
              statChecks,
              `${profile.id} ${type} seed ${seed} should emit exactly one StatCheck`,
            ).toHaveLength(1);
            const check = statChecks[0];
            expect(check.type === 'StatCheck' && check.actionContext).toBe(VERB_CONTEXT[type]);
            expect(check.type === 'StatCheck' && check.actor).toBe(npc.id);
            seenContexts.add(VERB_CONTEXT[type]);
          } else {
            // Idle / FlawOverride are NOT verb resolutions — they roll nothing
            // through check(), so no StatCheck may be emitted (keeps the sim's
            // trade-failure denominator honest).
            expect(
              statChecks,
              `${profile.id} ${type} seed ${seed} must emit no StatCheck`,
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
        const profile = NPC_PROFILES.find((p) => p.id === profileId)!;
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
