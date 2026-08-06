export interface StarCoordinates {
  // Rimward uses the seed's x/y plane for route distance. The seed's z value is legacy/special-location lore and is not part of T-101 travel math.
  x: number;
  y: number;
}

/**
 * T-188 · 3c — a system's position on the generated 3D "orbital/atomic" layout.
 * NOT wired into gameplay: `distance`/`calculateDistance` (used by
 * `travel.ts`'s `jumpFuelCost`/`travelDc`/`calculateRouteDanger`) still read
 * the 2D `coordinates` above. See {@link distance3D} and the module-scope
 * population loop below {@link STAR_SYSTEMS} for how these are derived.
 */
export interface Star3DCoordinates {
  x: number;
  y: number;
  z: number;
}

export interface StarSystem {
  id: number;
  name: string;
  isRim: boolean;
  coordinates: StarCoordinates;
  fuelBuyPrice?: number; // Base buy price for fuel, if defined
  fuelSellPrice?: number; // Base sell price for fuel, if defined
  /**
   * T-1104 · Whether this port supplies Contraband (cargo type 10) contracts.
   * The smuggling pillar's SUPPLY gate: only ports flagged here can issue a
   * Contraband run (engine `rollContract`). Set true for the six rim systems —
   * PRD §10 ("the Rebel Alliance … smuggling lanes, the frontier ungoverned")
   * makes the ungoverned rim the natural source of illegal cargo, so contraband
   * is both port-gated AND reachable (the coverage sweep iterates rim origins).
   * Contraband READER for the carrying consequence is T-1305 patrol scans.
   */
  allowsContraband?: boolean;
  /**
   * T-1303 · Whether this port hosts a Spacers Hangout the player can visit.
   * The Hangout is a core PRD verb ("Visit the Hangout", §7) and the site of the
   * §7.3 / §7.5 sample turns ("The Spacers Hangout, Sol-3"). This flag is the
   * extensible GATE: only systems flagged here surface the die-costed
   * `VisitHangout` player action (Spacer's Dare + social beats + rumor slot).
   *
   * T-121 · THE REACH CHANGE — a bar at all fourteen CORE spaceports, ids 1–14
   * (Sol-3 … Vega-6), and nowhere else (`docs/HANGOUT_REDESIGN.md` §4.5). It was
   * set on Sol-3 alone from T-1303 until now, which made the whole Hangout pillar
   * reachable only when a route happened to pass home.
   *
   * THE RIM (15–20), ANDROMEDA (21–26), MALIGNA (27) AND NEMESIS (28) CARRY NO
   * VENUE, AND THAT IS A DESIGN REQUIREMENT RATHER THAN AN OMISSION. §4.5 gives
   * two reasons: fourteen core ports is the owner's target verbatim, and
   * `ActionBlocked{reason:'no-hangout'}` is a shipped engine behaviour whose three
   * tests become unwritable the moment the un-flagged set is empty. Do not "finish
   * the job" by flagging the rim.
   *
   * THIS FLAG STAYS THE AUTHORITATIVE GATE (§2.2 ruling 3). The paired table
   * `PORT_HANGOUTS` (`./portHangouts.ts`) carries a port's PARAMETERS — venues,
   * wager band, DCs, disposition deltas, clientele, prose — and never decides
   * whether a bar exists; a flagged port with no row of its own resolves to
   * `DEFAULT_PORT_HANGOUT` and renders as a generic house. The two sets are held
   * equal in both directions by the enumerating test in
   * `packages/engine/src/__tests__/hangoutRules.test.ts`, so neither can drift.
   *
   * READER: the hangout gate in engine `day.ts` applyPlayerAction, which emits an
   * ActionBlocked{reason:'no-hangout'} at un-flagged systems, and the UGT
   * protocol legalActions (`packages/sim/src/protocol.ts`), which only advertises
   * VisitHangout at a flagged system. Surfaced to the player by T-1404.
   */
  hasHangout?: boolean;
  /**
   * T-188 · 3c — see {@link Star3DCoordinates}. Optional ONLY at the type
   * level because the 28 literal entries below predate this field; every
   * entry is populated unconditionally by the loop directly under
   * {@link STAR_SYSTEMS}'s declaration, so by the time any importer sees this
   * module, every system carries one. Read through {@link coordinates3D} (a
   * non-optional accessor) rather than this field directly when you want the
   * type system to hold that guarantee for you.
   */
  coordinates3D?: Star3DCoordinates;
}

/**
 * T-1505b · The black hole at the end of the arc — the ONE gated destination the
 * `nemesis.crossing.unlocked` flag opens (see the destination-gating note below,
 * at `GATED_DESTINATION_MIN_ID`). Exported so no reader has to spell the literal
 * `28`: the engine gate, the sim protocol, the UI starmap band and the crossing's
 * own travel rules all key off this constant. Declared above STAR_SYSTEMS because
 * the table's own row uses it.
 */
export const NEMESIS_SYSTEM_ID = 28;

// T-1101 · Real 2D starmap geography (authority: PRD-REIMAGINED §9 — "the map:
// 14 core systems, 6 Rim, Andromeda beyond … the black hole at Nemesis").
//
// These coordinates are AUTHORED for T-1101, not lifted from foundation
// (ref f2f95fa9): the shipped `y=0, x=id-1` line was degenerate — it collapsed
// `calculateDistance` (real Math.hypot) into the plain `|id difference|` it was
// chartered to replace, and it stacked NEMESIS on top of Sol-3 at (0,0), one
// jump from home. §9 keeps the MAP (its systems/names), not any particular
// route cost, so authoring a genuine 2D spread contradicts no foundation
// number; fuel/danger repricing is out of scope here (T-1102) and left as-is.
//
// Layout: core (1–14) clusters near the origin with real 2D route choice
// (non-collinear, so distance ≠ id-diff); rim (15–20) forms an outer shell
// ~20–24 units out — comfortably past the ~11 core–core mean (so genuinely
// outlying, per the acceptance metric) yet still inside a single starter jump,
// so a strong die can clear the pilot DC to the rim; the special systems
// MALIGNA (27) and NEMESIS (28) sit remote (>60 from Sol → beyond the starter
// fuel ring even before the T-1101 destination gate seals them).
export const STAR_SYSTEMS: Record<number, StarSystem> = {
  // Core Systems (clustered near origin; genuine 2D route choice)
  1: {
    id: 1,
    // T-188 · renamed from 'Sun-3' (owner, 2026-08-04) — "Sol-3" is the base
    // game's name and reads more sci-fi. Display text only: the numeric id
    // (1) is unchanged, as is the persisted deed id `liars_dice_cleared_sun_3`
    // (`deeds.ts`) and the `SUN_3_HANGOUT` code identifier (`portHangouts.ts`)
    // — neither is player-visible text, and renaming either is a distinct,
    // separately-scoped save-migration / rename question the owner did not
    // ask for here.
    name: 'Sol-3',
    isRim: false,
    coordinates: { x: 0, y: 0 },
    fuelBuyPrice: 8,
    fuelSellPrice: 1,
    // T-1303: the Spacers Hangout of the §7.3 / §7.5 sample turns. Sol-3 is the
    // player's home port, so the Hangout verb is reachable from day 1.
    // T-121: no longer the only one — every core port below carries the flag too.
    hasHangout: true,
  },
  2: { id: 2, name: 'Aldebaran-1', isRim: false, coordinates: { x: 4, y: 2 }, hasHangout: true },
  3: { id: 3, name: 'Altair-3', isRim: false, coordinates: { x: 7, y: -1 }, hasHangout: true },
  4: { id: 4, name: 'Arcturus-6', isRim: false, coordinates: { x: 2, y: 6 }, hasHangout: true },
  5: { id: 5, name: 'Deneb-4', isRim: false, coordinates: { x: -3, y: 4 }, hasHangout: true },
  6: { id: 6, name: 'Denebola-5', isRim: false, coordinates: { x: -5, y: -2 }, hasHangout: true },
  7: { id: 7, name: 'Fomalhaut-2', isRim: false, coordinates: { x: -2, y: -6 }, hasHangout: true },
  8: {
    id: 8,
    name: 'Mira-9',
    isRim: false,
    coordinates: { x: 3, y: -5 },
    fuelBuyPrice: 4,
    fuelSellPrice: 3,
    hasHangout: true,
  },
  9: { id: 9, name: 'Pollux-7', isRim: false, coordinates: { x: 9, y: 4 }, hasHangout: true },
  10: { id: 10, name: 'Procyon-5', isRim: false, coordinates: { x: 6, y: 7 }, hasHangout: true },
  11: { id: 11, name: 'Regulus-6', isRim: false, coordinates: { x: 11, y: -3 }, hasHangout: true },
  12: { id: 12, name: 'Rigel-8', isRim: false, coordinates: { x: -8, y: 3 }, hasHangout: true },
  13: {
    id: 13,
    name: 'Spica-3',
    isRim: false,
    coordinates: { x: -7, y: -7 },
    fuelSellPrice: 5,
    hasHangout: true,
  },
  14: {
    id: 14,
    name: 'Vega-6',
    isRim: false,
    coordinates: { x: 10, y: 9 },
    fuelBuyPrice: 6,
    fuelSellPrice: 4,
    hasHangout: true,
  },

  // Rim Systems (outer shell ~20–24 units out — an order past the ~11 core–core
  // mean, so genuinely outlying, yet still inside a single starter jump: a strong
  // die clears the pilot DC, keeping "one more run to the rim" reachable in one
  // hop rather than pilot-locked behind the DC ceiling of a fresh spacer).
  // T-1104: allowsContraband on all six — the ungoverned rim supplies the
  // smuggling pillar (PRD §10). This is the port gate for cargo type 10.
  15: {
    id: 15,
    name: 'Antares-5',
    isRim: true,
    coordinates: { x: 16, y: 13 },
    allowsContraband: true,
  },
  16: {
    id: 16,
    name: 'Capella-4',
    isRim: true,
    coordinates: { x: -20, y: 6 },
    allowsContraband: true,
  },
  17: {
    id: 17,
    name: 'Polaris-1',
    isRim: true,
    coordinates: { x: -12, y: -18 },
    allowsContraband: true,
  },
  18: {
    id: 18,
    name: 'Mizar-9',
    isRim: true,
    coordinates: { x: 6, y: -21 },
    allowsContraband: true,
  }, // Sage of Mizar-9 (§9)
  19: {
    id: 19,
    name: 'Achernar-5',
    isRim: true,
    coordinates: { x: 21, y: -10 },
    allowsContraband: true,
  },
  20: {
    id: 20,
    name: 'Algol-2',
    isRim: true,
    coordinates: { x: -22, y: -7 },
    allowsContraband: true,
  },

  // Andromeda Systems (beyond, on the far side of the Nemesis crossing)
  21: { id: 21, name: 'NGC-44', isRim: false, coordinates: { x: 44, y: 22 } },
  22: { id: 22, name: 'NGC-55', isRim: false, coordinates: { x: 55, y: 33 } },
  23: { id: 23, name: 'NGC-66', isRim: false, coordinates: { x: 66, y: 44 } },
  24: { id: 24, name: 'NGC-77', isRim: false, coordinates: { x: 77, y: 55 } },
  25: { id: 25, name: 'NGC-88', isRim: false, coordinates: { x: 88, y: 66 } },
  26: { id: 26, name: 'NGC-99', isRim: false, coordinates: { x: 99, y: 77 } },

  // Special Systems (remote; both >60 from Sol, beyond the ring even ungated)
  27: { id: 27, name: 'MALIGNA', isRim: false, coordinates: { x: -50, y: 42 } },
  28: { id: NEMESIS_SYSTEM_ID, name: 'NEMESIS', isRim: false, coordinates: { x: 52, y: 96 } }, // moved off (0,0): the far-side black hole
};

// T-188 · 3a-3c — populate `coordinates3D` for every system above, once, at
// module load. RADIUS PRESERVED FROM THE EXISTING 2D LAYOUT: each system's
// distance from Sol on the sphere below is EXACTLY its distance from Sol in
// the hand-authored 2D `coordinates` above (`calculateDistance` against
// system 1), so every Sol-relative number this repo has tuned against — the
// rim ring at ~20-24, the core mean at ~11, the fuel/DC/danger baselines in
// `docs/balance/BASELINE-T-1603a.md` — is unchanged by this step. What's new
// is the ANGULAR placement: a Fibonacci-sphere point distribution (the
// standard even-coverage algorithm — golden-angle steps in longitude, an
// arccos step in latitude) instead of the old flat scatter's ad hoc x/y, so
// systems disperse across a sphere rather than collapsing onto one plane.
// Iteration order is by id (ascending) so the layout is deterministic and
// reproducible from this file alone, with no separate seed to keep in sync.
const GOLDEN_ANGLE_RADIANS = Math.PI * (3 - Math.sqrt(5)); // ~137.5°

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

(function populateOrbitalCoordinates3D(): void {
  const sol = STAR_SYSTEMS[1];
  const ids = Object.values(STAR_SYSTEMS)
    .map((system) => system.id)
    .sort((a, b) => a - b);
  const n = ids.length;
  ids.forEach((id, index) => {
    const system = STAR_SYSTEMS[id];
    const radius = id === sol.id ? 0 : calculateDistance(sol.coordinates, system.coordinates);
    if (radius === 0) {
      system.coordinates3D = { x: 0, y: 0, z: 0 };
      return;
    }
    // Fibonacci-sphere: latitude from an evenly-spaced arccos step, longitude
    // from the golden-angle increment. Both are functions of INDEX (this
    // system's rank among all 28 by id), not of radius, so two systems at the
    // same Sol-distance still land at different points on their shared shell.
    const phi = Math.acos(1 - (2 * (index + 0.5)) / n);
    const theta = index * GOLDEN_ANGLE_RADIANS;
    system.coordinates3D = {
      x: round2(radius * Math.sin(phi) * Math.cos(theta)),
      y: round2(radius * Math.sin(phi) * Math.sin(theta)),
      z: round2(radius * Math.cos(phi)),
    };
  });
})();

// T-1101 · Destination gating. Andromeda (21–26) and the special systems
// MALIGNA / NEMESIS (27–28) are sealed in v1: PRD §10 puts Andromeda out of
// scope, and the Nemesis crossing is the endgame (T-1505), lifted via the
// 'nemesis.crossing.unlocked' flag.
//
// T-1505b · THE LIFT IS NEMESIS-ONLY (design call D1). The flag now has a setter
// (the crossing stake, engine `commitCrossingStake`), and paying the stake opens
// EXACTLY ONE id: {@link NEMESIS_SYSTEM_ID}. Andromeda (21–26) and MALIGNA (27)
// stay sealed forever in v1 — PRD-REIMAGINED §10 puts "Andromeda as playable
// space" out of scope ("the crossing is v1's ending; the far side is an
// expansion"), so a flag that lifted all eight would advertise six systems with
// no content behind them. `isGatedDestination` is therefore unchanged (28 is
// still a gated id); only the LIFT is narrowed, and every reader below encodes
// the same NEMESIS-only predicate.
//
// READERS of the flag (all three must agree, and are asserted to):
//  1. the engine gate in day.ts applyPlayerAction (emits a typed ActionBlocked
//     with reason 'destination-locked' unless the flag is set AND the destination
//     is NEMESIS_SYSTEM_ID) — `packages/engine/src/__tests__/day.test.ts`;
//  2. the UGT protocol's legalActions in packages/sim/src/protocol.ts (must not
//     advertise a sealed system as a legal Travel destination, and must not
//     advertise Andromeda even post-unlock) — `protocol.test.ts`;
//  3. the UI starmap band in packages/ui/src/format.ts `starmapGlobe`
//     (renders id 28 only once the stake is paid) — `e2e/nemesis-crossing.spec.ts`.
// The sim travel-destination pickers in packages/sim/src/index.ts also consult
// `isGatedDestination` and must never target a sealed system.
export const GATED_DESTINATION_MIN_ID = 21;

export function isGatedDestination(id: number): boolean {
  return id >= GATED_DESTINATION_MIN_ID;
}

export const FUEL_DEFAULT_BUY_PRICE = 5;
export const FUEL_DEFAULT_SELL_PRICE = 2;
// T-1102: repriced 25 → 8 to MATCH the fuel-scarcity overhaul. The old flat
// 50-fuel jump cap meant a rim jump burned ~50 units → ~1250 cr at 25/unit. With
// the cap removed a rim-exit jump now burns ~240–290 units, so 25/unit would cost
// ~6–7k cr and strand every NPC (and the player) that drifts to the frontier —
// broke and unable to afford the one jump home. Dividing the per-unit price by
// ~3 keeps the CREDITS cost of a rim jump close to its pre-change value, so the
// rim stays proportionally expensive (still above the 5 core default) without
// becoming a one-way credit trap. Verified against the 200-day galaxy-solvency
// campaign test (NPCs stay mobile, wealth spread stays non-degenerate).
export const RIM_FUEL_BUY_PRICE = 8;

export type RouteDangerLevel = 1 | 2 | 3 | 4 | 5;

export const SYSTEM_DANGER_LEVELS: Record<number, RouteDangerLevel> = {
  1: 1,
  2: 1,
  3: 1,
  4: 1,
  5: 1,
  6: 1,
  7: 1,
  8: 1,
  9: 1,
  10: 1,
  11: 1,
  12: 1,
  13: 1,
  14: 1,
  15: 3,
  16: 3,
  17: 3,
  18: 3,
  19: 3,
  20: 3,
  21: 4,
  22: 4,
  23: 4,
  24: 4,
  25: 4,
  26: 4,
  27: 5,
  28: 5,
};

// T-1103 · Encounter-rate repair. Re-anchored to foundation's headline combat
// numbers (ref f2f95fa9:foundation/rules/constants.ts:187-188):
//   ENCOUNTER_BASE_CHANCE = 0.30 (core), ENCOUNTER_RIM_CHANCE = 0.40 (rim).
// The prior table cut tier 1 to 0.08 — an UNCOMMENTED 4× reduction of the game's
// headline mechanic (every core system is danger tier 1 via SYSTEM_DANGER_LEVELS,
// so encounters fired on ~1 jump in 12). Reverting that cut is a repair, not a
// divergence: tier 1 (0.30) restores ENCOUNTER_BASE_CHANCE and tier 3 (0.40)
// restores ENCOUNTER_RIM_CHANCE exactly.
//
// Tiers 2, 4, and 5 ARE divergences under Standing-constraint 5 — foundation
// priced only core/rim, never a five-point gradient. They are Rimward-only: tier
// 2 linearly interpolates the core↔rim anchors (0.30↔0.40); tiers 4 and 5
// extrapolate beyond rim for the Andromeda / special (MALIGNA, NEMESIS) lanes,
// which foundation never reached.
//
// CANONICAL (T-1603b, 2026-07-26) — RATIFIED UNCHANGED at 0.35 / 0.50 / 0.60.
// The interpolation/extrapolation is KEPT DELIBERATELY, and is still the
// divergence rationale of record; what T-1603b adds is the measurement behind it,
// so these three points are now set values rather than placeholders. Evidence
// (`docs/balance/BASELINE-T-1603a.md`, 3,500 careers / 122,500 sim days, plus the
// after-arms in `docs/balance/TUNING-T-1603.md` §3):
//   - these tiers are NOT dead lanes. `calculateRouteDanger` is
//     `max(origin, destination) + distanceBump + cargoBump + eraDelta`, clamped
//     1..5, so a core→core delivery lands on tier 2 (the most-flown lane class in
//     the game) and a rim run under an active contract lands on tier 4 or 5;
//   - the resulting encounter load is 5.2 per 35-day Tour One run (0.15/day under
//     the 0.5x TOUR_ONE_ENCOUNTER_MULTIPLIER damp) and 0.20/day post-flip —
//     frequent enough to matter, rare enough that `travelCompleted` holds at
//     82–87% in every parity cell;
//   - fleet route diversity is healthy at these rates (397 distinct routes, top
//     route 1.3% of 58,726 legs) and IMPROVES after the era flip (1.0%), so
//     nothing about the danger gradient is funnelling traffic onto a safe lane.
// Nothing in either arm asked for a move, so nothing moved.
//
// IF THIS EVER NEEDS A COUNTER-LEVER: tier 2 is the dial. It is the lane class
// Tour One deliveries actually fly and it is damped 0.5x inside Tour One, so it
// is the gentlest way to push the trader's median debt-clear day back up if a
// future change drops it toward the [22, 30] floor. T-1603b did not need it — the
// renown rescale left that median at 23 — but it is the intended first move.
//
// READERS: `calculateRouteDanger` → `generateEncounter` (engine
// `actions/travel.ts`), which is the only consumer; surfaced to the player as the
// route's danger readout on the travel plot and as the interceptions themselves.
export const ROUTE_DANGER_CHANCE: Record<RouteDangerLevel, number> = {
  1: 0.3, // core — restores foundation ENCOUNTER_BASE_CHANCE (repair of the 0.08 cut)
  2: 0.35, // canonical (T-1603b) — interpolates core↔rim; the core-delivery lane class
  3: 0.4, // rim — restores foundation ENCOUNTER_RIM_CHANCE (repair of the 0.08 cut)
  4: 0.5, // canonical (T-1603b) — extrapolates beyond rim for Andromeda / rim contracts
  5: 0.6, // canonical (T-1603b) — extrapolates for special (MALIGNA, NEMESIS) lanes
};

export function calculateDistance(origin: StarCoordinates, destination: StarCoordinates): number {
  const raw = Math.hypot(destination.x - origin.x, destination.y - origin.y);
  return raw === 0 ? 1 : Math.ceil(raw);
}

export function distance(originSystemId: number, destinationSystemId: number): number {
  const origin = STAR_SYSTEMS[originSystemId];
  const destination = STAR_SYSTEMS[destinationSystemId];
  if (!origin || !destination) {
    throw new Error(`Unknown star system route: ${originSystemId} -> ${destinationSystemId}`);
  }
  return calculateDistance(origin.coordinates, destination.coordinates);
}

/** Typed, non-optional read of a system's 3c sphere position — see
 *  {@link Star3DCoordinates} and the population loop above `STAR_SYSTEMS`.
 *  Throws rather than returning `undefined`, since by construction every
 *  system is populated at module load; a throw here means that invariant
 *  broke, not that the caller passed a bad id (an unknown id is its own
 *  distinct failure — see {@link distance3D}). */
export function coordinates3D(systemId: number): Star3DCoordinates {
  const system = STAR_SYSTEMS[systemId];
  if (!system) {
    throw new Error(`Unknown star system: ${systemId}`);
  }
  if (!system.coordinates3D) {
    throw new Error(
      `System ${systemId} has no coordinates3D — the population loop above STAR_SYSTEMS did not run for it.`,
    );
  }
  return system.coordinates3D;
}

/**
 * T-188 · 3d — 3D Euclidean distance between any two systems' sphere
 * positions ({@link coordinates3D}). Same rounding convention as
 * {@link calculateDistance} (ceil, minimum 1) so the two are directly
 * comparable, but this is a SEPARATE function from {@link distance} and is
 * NOT wired into `travel.ts`'s live fuel/DC/danger formulas (see the T-188
 * task block in `TASKS.md` for why — swapping the live formula is a
 * rulesFingerprint-moving, balance-affecting change filed as its own
 * follow-on step, not bundled into this geometry-data commit).
 */
export function distance3D(originSystemId: number, destinationSystemId: number): number {
  const origin = coordinates3D(originSystemId);
  const destination = coordinates3D(destinationSystemId);
  const raw = Math.hypot(
    destination.x - origin.x,
    destination.y - origin.y,
    destination.z - origin.z,
  );
  return raw === 0 ? 1 : Math.ceil(raw);
}

/**
 * T-188 · 3b — the 2D "orbital/atomic" layout: every system placed at its
 * EXACT 2D-derived Sol-distance ({@link calculateDistance} against system 1,
 * same radius {@link coordinates3D} preserves onto the sphere), spread by a
 * golden-angle increment per id-rank rather than the old hand-authored
 * scatter or a linear line (explicitly rejected — see the T-188 task block).
 * Exported for the T-188 flat-map prototype (candidate 4a); not read by
 * gameplay.
 *
 * T-215 · The live `Starmap` now projects {@link coordinates3D} — the ruled 4B
 * globe replaced the flat SVG map outright — so this is NOT the layout the
 * cockpit draws. It is RETAINED DELIBERATELY rather than deleted: `systems.ts`
 * is a hashed rule source (`packages/sim/src/balance/rules-fingerprint.ts`), so
 * removing live code here would move `rulesFingerprint` and owe an 8,000-run
 * capstone re-pin for zero gameplay benefit.
 */
export function orbitalLayout2D(): Record<number, StarCoordinates> {
  const sol = STAR_SYSTEMS[1];
  const ids = Object.values(STAR_SYSTEMS)
    .map((system) => system.id)
    .sort((a, b) => a - b);
  const result: Record<number, StarCoordinates> = {};
  ids.forEach((id, index) => {
    const system = STAR_SYSTEMS[id];
    const radius = id === sol.id ? 0 : calculateDistance(sol.coordinates, system.coordinates);
    if (radius === 0) {
      result[id] = { x: 0, y: 0 };
      return;
    }
    const theta = index * GOLDEN_ANGLE_RADIANS;
    result[id] = { x: round2(radius * Math.cos(theta)), y: round2(radius * Math.sin(theta)) };
  });
  return result;
}
