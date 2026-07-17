export interface StarCoordinates {
  // Rimward uses the seed's x/y plane for route distance. The seed's z value is legacy/special-location lore and is not part of T-101 travel math.
  x: number;
  y: number;
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
   * §7.3 / §7.5 sample turns ("The Spacers Hangout, Sun-3"). This flag is the
   * extensible GATE: only systems flagged here surface the die-costed
   * `VisitHangout` player action (Spacer's Dare + social beats + rumor slot).
   * Set true on Sun-3 first (the sample-turn hub, and the player's start system,
   * so the venue is reachable on day 1); more hubs join later. READER: the
   * hangout gate in engine `day.ts` applyPlayerAction, which emits an
   * ActionBlocked{reason:'no-hangout'} at un-flagged systems, and the UGT
   * protocol legalActions (`packages/sim/src/protocol.ts`), which only advertises
   * VisitHangout at a flagged system. Surfaced to the player by T-1404.
   */
  hasHangout?: boolean;
}

// T-1101 · Real 2D starmap geography (authority: PRD-REIMAGINED §9 — "the map:
// 14 core systems, 6 Rim, Andromeda beyond … the black hole at Nemesis").
//
// These coordinates are AUTHORED for T-1101, not lifted from foundation
// (ref f2f95fa9): the shipped `y=0, x=id-1` line was degenerate — it collapsed
// `calculateDistance` (real Math.hypot) into the plain `|id difference|` it was
// chartered to replace, and it stacked NEMESIS on top of Sun-3 at (0,0), one
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
    name: 'Sun-3',
    isRim: false,
    coordinates: { x: 0, y: 0 },
    fuelBuyPrice: 8,
    fuelSellPrice: 1,
    // T-1303: the Spacers Hangout of the §7.3 / §7.5 sample turns. Sun-3 is the
    // player's home port, so the Hangout verb is reachable from day 1.
    hasHangout: true,
  },
  2: { id: 2, name: 'Aldebaran-1', isRim: false, coordinates: { x: 4, y: 2 } },
  3: { id: 3, name: 'Altair-3', isRim: false, coordinates: { x: 7, y: -1 } },
  4: { id: 4, name: 'Arcturus-6', isRim: false, coordinates: { x: 2, y: 6 } },
  5: { id: 5, name: 'Deneb-4', isRim: false, coordinates: { x: -3, y: 4 } },
  6: { id: 6, name: 'Denebola-5', isRim: false, coordinates: { x: -5, y: -2 } },
  7: { id: 7, name: 'Fomalhaut-2', isRim: false, coordinates: { x: -2, y: -6 } },
  8: {
    id: 8,
    name: 'Mira-9',
    isRim: false,
    coordinates: { x: 3, y: -5 },
    fuelBuyPrice: 4,
    fuelSellPrice: 3,
  },
  9: { id: 9, name: 'Pollux-7', isRim: false, coordinates: { x: 9, y: 4 } },
  10: { id: 10, name: 'Procyon-5', isRim: false, coordinates: { x: 6, y: 7 } },
  11: { id: 11, name: 'Regulus-6', isRim: false, coordinates: { x: 11, y: -3 } },
  12: { id: 12, name: 'Rigel-8', isRim: false, coordinates: { x: -8, y: 3 } },
  13: {
    id: 13,
    name: 'Spica-3',
    isRim: false,
    coordinates: { x: -7, y: -7 },
    fuelSellPrice: 5,
  },
  14: {
    id: 14,
    name: 'Vega-6',
    isRim: false,
    coordinates: { x: 10, y: 9 },
    fuelBuyPrice: 6,
    fuelSellPrice: 4,
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
  28: { id: 28, name: 'NEMESIS', isRim: false, coordinates: { x: 52, y: 96 } }, // moved off (0,0): the far-side black hole
};

// T-1101 · Destination gating. Andromeda (21–26) and the special systems
// MALIGNA / NEMESIS (27–28) are sealed in v1: PRD §10 puts Andromeda out of
// scope, and the Nemesis crossing is the endgame (T-1505), lifted via the
// 'nemesis.crossing.unlocked' flag. READER: the engine gate in day.ts
// applyPlayerAction (emits a typed ActionBlocked with reason 'destination-locked'
// unless the flag is set); the sim travel-destination pickers in
// packages/sim/src/index.ts (which must never target a sealed system); and the
// UGT protocol's legalActions in packages/sim/src/protocol.ts (which must not
// advertise a sealed system as a legal Travel destination).
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
// priced only core/rim, never a five-point gradient. They are Rimward-only: tier 2
// linearly interpolates the core↔rim anchors (0.30↔0.40); tiers 4 and 5 extrapolate
// beyond rim, escalating monotonically for the most dangerous lanes foundation
// never reached.
//
// T-1603 CANONICAL (finalizes these three interim points). They are NOT confined
// to the sealed Andromeda/special systems: `computeRouteDanger` (actions/travel.ts)
// derives the tier as `clampDanger(baseDanger + distanceBump + cargoBump + eraDelta)`,
// so a core lane flown with an active contract or over ≥8 units reaches tier 2, and
// a rim lane with a cargo/distance bump (or a live era event) reaches tier 4 — even
// tier 5 with both bumps. The gradient therefore bites in live play: "below tier
// parity, unprepared" combat is punishing because a loaded rim run climbs into the
// 4/5 band where the encounter chance is highest. The 500-seed T-1603 sweep
// validated this table against every PRD balance target (debt-clear pacing, negative
// unprepared combat EV, route churn, nonzero death rate) with all sim/replay goldens
// byte-identical, so the interim values are RATIFIED unchanged rather than moved —
// see docs/balance/tuning-memo.md. READER: `computeRouteDanger` (actions/travel.ts),
// surfaced to the player as the route read-out's danger chance (T-1401 preview) and
// the realized interdiction rate.
export const ROUTE_DANGER_CHANCE: Record<RouteDangerLevel, number> = {
  1: 0.3, // core — foundation ENCOUNTER_BASE_CHANCE (repair of the 0.08 cut)
  2: 0.35, // canonical — interpolates the core↔rim anchors (loaded/long core lanes)
  3: 0.4, // rim — foundation ENCOUNTER_RIM_CHANCE (repair of the 0.08 cut)
  4: 0.5, // canonical — beyond rim: loaded/long rim lanes and Andromeda
  5: 0.6, // canonical — the most dangerous lanes: special systems, doubly-bumped rim
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
