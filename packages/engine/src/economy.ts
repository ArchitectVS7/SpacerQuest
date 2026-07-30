import {
  CARGO_TYPES,
  FUEL_DEFAULT_BUY_PRICE,
  RIM_FUEL_BUY_PRICE,
  STAR_SYSTEMS,
  SYSTEM_DANGER_LEVELS,
  distance as systemDistance,
} from '@spacerquest/content';
import { CargoContract, EraEventState, GameState, ShipState } from './types.js';
import { SeededRng } from './rng.js';
import { eraFuelPriceMultiplier, eraPaymentMultiplier } from './era.js';

/** A drive block, the only part of a ship the jump-cost math cares about. */
export interface DriveBlock {
  strength: number;
  condition: number;
}

/**
 * Fuel required for a jump — the ONE travel-cost function (T-106 binding
 * constraint 3): the player (actions/travel.ts), the manifest-board payment
 * math, and the NPC simulation all price jumps through here.
 *
 * T-1102 · Fuel scarcity overhaul (PRD-REIMAGINED §4 differentiator 3 — "fuel is
 * the plot" — and §7.1 "two jumps costs 240 units; you're carrying 300").
 * DIVERGENCE FROM FOUNDATION (ref f2f95fa9:foundation/rules/travel.ts
 * `calculateFuelCost`): foundation computed `floor(min(perUnit·dist + 10, 100)/2)`.
 * The `min(…,100)` cap flattened every jump of distance ≥ 8 to a constant 50 fuel
 * — which made fuel INERT, the exact defect this task fixes: distance stopped
 * mattering, so scarcity never bit. We drop the cap entirely (cost rises without
 * ceiling) AND the `+10`/`÷2` packaging (unnecessary once the cap is gone; it only
 * existed to keep the pre-cap number in the 0–50 band). Result: a strictly
 * per-distance cost, `perUnit × distance`. Starter drives (strength 10, condition
 * 9) → perUnit 12, so a two-jump route of distance 14 + 6 = 240 fuel against a 300
 * starter tank, exactly the §7.1 scenario.
 */
export function jumpFuelCost(
  drives: DriveBlock,
  routeDistance: number,
  hasTransWarp = false,
  navFactor = 1,
): number {
  const effectiveStrength = drives.strength + (hasTransWarp ? 10 : 0);
  const af = Math.min(effectiveStrength, 21);
  let perUnit = 21 - af + (10 - drives.condition);
  if (perUnit < 1) perUnit = 1;
  // T-1605 · navigation is a deterministic discount on the burn (engine
  // components.ts `navFuelFactor`); 1 for a junker, so every existing number and
  // golden is unchanged until nav is actually upgraded. Floored at 1 so a jump
  // is never free.
  return Math.max(1, Math.round(perUnit * routeDistance * navFactor));
}

/**
 * Maximum fuel a hull can hold — derived from the hull's strength and condition
 * so a fresh junker's tank and a fitted freighter's tank both fall out of the
 * ship, not a hardcoded constant. T-1102: this replaces the old flat
 * `maxFuel: 10000`.
 *
 * PORTED FROM FOUNDATION (ref f2f95fa9:foundation/rules/travel.ts
 * `calculateFuelCapacity`): `(condition + 1) × strength × MULT`.
 * DIVERGENCE: foundation used MULT = 10, which puts the fresh junker (strength 1,
 * condition 9) at only 100 fuel — below even a single starter jump under the new
 * per-distance cost. PRD §7.1 pins the fresh tank at ~300 ("you're carrying 300"),
 * so MULT = 30. Chosen over bumping the starter `hull.strength`, because
 * `hull.strength` is load-bearing elsewhere (cargo-pod serviceable-capacity in
 * economy `rollContract`, shipyard tier gates and equipment pricing), and moving
 * it would ripple through the economy and combat. The ×30 scales every hull
 * uniformly and keeps the hull-upgrade A/B monotonic: a stronger/healthier hull
 * always holds strictly more fuel.
 */
export const FUEL_CAPACITY_HULL_MULTIPLIER = 30;

export function calculateFuelCapacity(hullStrength: number, hullCondition: number): number {
  if (hullStrength < 1 || hullCondition < 1) return 0;
  return (hullCondition + 1) * hullStrength * FUEL_CAPACITY_HULL_MULTIPLIER;
}

/**
 * Recompute a ship's `maxFuel` from its (possibly just-changed) hull and clamp
 * the current fuel to the new ceiling. T-1102 single chokepoint: called once at
 * the end of `applyPlayerAction` (day.ts) so every player action that touched the
 * hull — shipyard upgrade, astraxial/cloaker fits, repairs, combat damage —
 * propagates to the tank, and again on load (`deserializeState`) as the
 * fuel-capacity save migration. Deliberately NOT invoked inside the low-level
 * resolvers: several unit tests build a ship with a manual `maxFuel` and call
 * resolvers directly, and that must stay honoured.
 */
export function syncMaxFuel(ship: ShipState): void {
  ship.maxFuel = calculateFuelCapacity(ship.hull.strength, ship.hull.condition);
  if (ship.fuel > ship.maxFuel) ship.fuel = ship.maxFuel;
}

/**
 * Largest integer jump distance (>=1) whose fuel cost the ship can currently
 * afford, or 0 if it cannot afford even a 1-unit jump. The starmap fuel-range
 * ring (T-304) is drawn at this radius; per-system reachability there also uses
 * `jumpFuelCost`, and the two agree because core/rim systems sit at integer
 * distances. `jumpFuelCost` is monotonic non-decreasing in distance, so the
 * first distance the ship cannot afford ends the reachable range.
 */
export function maxJumpDistance(
  drives: DriveBlock,
  fuel: number,
  hasTransWarp = false,
  maxSpan = 60,
): number {
  let best = 0;
  for (let d = 1; d <= maxSpan; d++) {
    if (jumpFuelCost(drives, d, hasTransWarp) <= fuel) best = d;
    else break; // monotonic — first unaffordable distance ends the range
  }
  return best;
}

/** Local depot fuel price from canon tables — shared by the player's market
 *  and NPC refueling (no free NPC economics). An active era event (e.g. a fuel
 *  crisis) can re-price the depot when the system is in scope (T-107). */
export function localFuelPrice(systemId: number, eraEvent: EraEventState | null = null): number {
  const system = STAR_SYSTEMS[systemId];
  let price: number;
  if (!system) price = FUEL_DEFAULT_BUY_PRICE;
  else if (system.isRim) price = RIM_FUEL_BUY_PRICE;
  else price = system.fuelBuyPrice ?? FUEL_DEFAULT_BUY_PRICE;
  return Math.round(price * eraFuelPriceMultiplier(eraEvent, systemId));
}

/** T-1401 · A pure advisory preview of a fuel purchase — what the engine WILL
 *  charge vs. what actually lands in the tank. Nothing here mutates state or
 *  changes `resolveTrade`; it only exposes the clamp the resolver already applies
 *  so the UI can warn before committing. */
export interface FuelPurchaseQuote {
  /** `fuelAmount * localFuelPrice` — the full cost the engine deducts (trade.ts). */
  cost: number;
  /** What actually reaches the tank: `min(fuelAmount, maxFuel - fuel)`. */
  fuelDelivered: number;
  /** The overflow you pay for but never receive: `fuelAmount - fuelDelivered`. */
  fuelWasted: number;
  /** True when the request overfills the tank — the pre-commit warning trigger. */
  overspends: boolean;
  /** Whether credits cover the full cost. */
  canAfford: boolean;
}

/**
 * T-1401 · Preview a `buy-fuel` before committing. `resolveTrade` (actions/trade.ts
 * ~L25-32) charges `fuelAmount * localFuelPrice` in full, then CLAMPS the tank to
 * `maxFuel` — so a spacer who buys more than the tank can hold pays for fuel that
 * is discarded. This quote mirrors that exact cost + clamp (reading the stored
 * `market.localFuelPrice`, the same number the resolver charges) so `overspends`
 * can never disagree with the real charge. It is a READ-ONLY advisory: it does NOT
 * change the resolver's charge/clamp (that would be a behavior change). CONSUMER:
 * T-1402 surfaces `overspends` as a "you're paying for X fuel you can't hold"
 * warning before the buy is confirmed.
 */
export function quoteFuelPurchase(state: GameState, fuelAmount: number): FuelPurchaseQuote {
  const ship = state.player.ship;
  const cost = fuelAmount * state.market.localFuelPrice;
  const room = Math.max(0, ship.maxFuel - ship.fuel);
  const fuelDelivered = Math.min(fuelAmount, room);
  const fuelWasted = fuelAmount - fuelDelivered;
  return {
    cost,
    fuelDelivered,
    fuelWasted,
    overspends: fuelWasted > 0,
    canAfford: state.player.credits >= cost,
  };
}

/** The parts of a ship the contract-payment math cares about. NPC hulls are
 *  abstracted to the same shape so their contract income scales exactly like
 *  the player's manifest payments. */
export interface ContractShipSpec {
  cargoPods: number;
  hullCondition: number;
  drives: DriveBlock;
}

export function contractSpecFromShip(ship: ShipState): ContractShipSpec {
  return {
    cargoPods: ship.cargoPods,
    hullCondition: ship.hull.condition,
    drives: { strength: ship.drives.strength, condition: ship.drives.condition },
  };
}

/**
 * T-1104 · Chance a contraband-allowing port issues a Contraband (type 10)
 * contract instead of its pool pick. Rare on purpose — the smuggling pillar is a
 * high-stakes exception, not the daily trade — but frequent enough that the
 * 200-seed coverage sweep across the six rim ports reliably surfaces it.
 * DIVERGENCE from foundation (ref f2f95fa9): foundation never issued type 10 at
 * all, so there is no prior number to preserve; 0.08 is a Rimward-authored rate.
 */
export const CONTRABAND_CONTRACT_CHANCE = 0.08;

/**
 * T-1104 · Chance a contract's destination is a Rim system (15–20) rather than a
 * core system (1–14). The Rim is the RARE, high-stakes "one more run" (PRD §9),
 * NOT a routine third of the board: a uniform 1–20 roll put ~30% of every 4-slot
 * board on the Rim, and because a rim run pays the most (the 3× danger + 5× fuel
 * premium) the greedy contract rankers signed it every day — then failed the
 * long jump's high pilot DC and never delivered, poverty-trapping every
 * competent policy (verified: a fighter signed 118 unwinnable rim runs in 120
 * days, 0 delivered). Offering the Rim ~12% of the time keeps it the exceptional
 * temptation the design names while still giving the 200-seed coverage sweep
 * every rim system many times over.
 * DIVERGENCE from foundation (ref f2f95fa9): foundation never issued a rim
 * destination at all, so there is no prior weighting to preserve.
 */
export const RIM_DESTINATION_CHANCE = 0.12;

/**
 * T-1104 · Base per-danger-tier payment cap. DIVERGENCE from foundation's flat
 * 15000 ceiling (ref f2f95fa9): a flat cap FLATTENS the rim payday this task
 * exists to create — a rim run's distance-driven fuel term alone blows past
 * 15000, so a single ceiling would erase the "3× danger + 5× fuel" premium and
 * make a rim run pay the same as a core hop. Scaling the cap by the destination
 * danger tier (core tier 1 → 15000 unchanged; rim tier 3 → 45000) preserves core
 * numerics exactly while letting the rim premium actually land.
 */
export const PAYMENT_CAP_PER_DANGER = 15000;

/**
 * T-1605 · The flat term every manifest payment carries, and the balance knob
 * that pays for removing the void jump.
 *
 * It was an inline `+ 1000` (T-1104). Naming it made it tunable, and it needed
 * tuning: once a failed pilot check stopped voiding jumps, the trader's Tour One
 * clear rate went 0.748 -> 0.918 and the median clear day 24 -> 21 over the
 * committed 500-seed sweep, i.e. the design bands were calibrated against a
 * ~31% wasted-fuel tax that no longer exists.
 *
 * HELD AT ITS ORIGINAL 1000 — naming it is the useful part, the tuning is not.
 * Two compensating levers were measured on the committed 500-seed sweep and BOTH
 * cost more than they bought:
 *   - raising the cost of a jump (a junker nav-fuel penalty) pushed destinations
 *     out of a dry captain's range and broke the T-1605b anti-poverty-trap
 *     invariant outright;
 *   - cutting this premium to 850 landed smuggler/gambler/fleet within a few
 *     points of their old rates but took the sim suite from 5 failures to 10,
 *     because contract payments are pinned by route-EV, deed and replay tests.
 * The remaining gap is therefore a TARGETS question, not an economy question:
 * the bands were calibrated against a ~31% wasted-fuel tax that no longer exists.
 */
export const CONTRACT_FLAT_PREMIUM = 1000;

/**
 * Rolls a single cargo contract offer from a system's job pool.
 *
 * T-1104 · Rim & contraband contract economy. Previously this only ever issued
 * destinations 1–14 and cargo types 1–9, so no contract routed to the Rim, the
 * six rim cargo types (15–20) were never issued, and Contraband (10) was
 * unobtainable — the namesake region had no payday and the smuggling pillar no
 * supply. Now:
 *   - destination is rolled 1–20 (core + rim), never a gated system (21+);
 *   - the cargo pool is data-driven: core 1–9 always, plus rim goods 15–20 when
 *     the origin `isRim` (rim cargo originates at rim ports);
 *   - Contraband (10) is rare, flagged, and PORT-GATED — only issued from ports
 *     with `allowsContraband` (the ungoverned rim, PRD §10);
 *   - the rim premium is priced against 5× fuel (the `fuelRequired * 5` term,
 *     large on rim distances) and 3× danger (the `dangerMult` from
 *     SYSTEM_DANGER_LEVELS, which is 3 on the rim, 1 in the core), so "one more
 *     run to the rim" (PRD §9) is the high-stakes payday the design names as its
 *     soul. Core payments are numerically UNCHANGED (dangerMult 1, cap 15000).
 */
export function rollContract(
  originSystem: number,
  rng: SeededRng,
  spec: ContractShipSpec,
  eraEvent: EraEventState | null = null,
  guildManifestPenalty = 1,
): CargoContract {
  const origin = STAR_SYSTEMS[originSystem];

  // --- Cargo type (T-1104) ---
  // Pool is built from CONTENT flags, not hardcoded engine branches: core 1–9
  // always, rim goods 15–20 when the origin is a rim port. Draw order (cargo
  // pool → contraband gate → destination) is fixed and load-bearing for
  // determinism — the economy tests pin exact seeded outputs against it.
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  if (origin?.isRim) pool.push(15, 16, 17, 18, 19, 20);
  let cargoType = pool[Math.floor(rng.next() * pool.length)];
  // Contraband override: only a contraband-allowing port can supply type 10,
  // and only on a rare roll. This is the smuggling pillar's SUPPLY.
  if (origin?.allowsContraband && rng.next() < CONTRABAND_CONTRACT_CHANCE) {
    cargoType = 10;
  }

  // Destination: core 1–14 is the everyday board; the Rim 15–20 is offered only
  // RARELY (RIM_DESTINATION_CHANCE) so "one more run to the rim" stays the
  // exception, not the rule. Gated systems (21+) are excluded by construction —
  // never rolled. Draw order is fixed and load-bearing for determinism.
  let destination: number;
  if (rng.next() < RIM_DESTINATION_CHANCE) {
    destination = 15 + Math.floor(rng.next() * 6); // rim 15–20
  } else {
    destination = 1 + Math.floor(rng.next() * 14); // core 1–14
  }
  if (destination === originSystem) {
    destination = originSystem < 20 ? destination + 1 : destination - 1;
  }

  const routeDistance = systemDistance(originSystem, destination);

  // Serviceable pods = cargoPods * (hullCondition + 1) / 10
  const cargoPods = spec.cargoPods;
  const hullCondition = spec.hullCondition;
  let upodX: number = 1;
  if (cargoPods >= 1 && hullCondition >= 1) {
    const y = hullCondition + 1;
    let rawX = cargoPods * y;
    if (rawX < 10) rawX = 10;
    upodX = Math.floor(rawX / 10);
  }

  // Fuel required for calculation — same math as the actual jump
  const fuelRequired = jumpFuelCost(spec.drives, routeDistance);

  // --- Payment (T-1104) ---
  // valueMult comes from content (CARGO_TYPES), NOT an engine id→value branch.
  // For CORE cargo valueMult === id, so `valueMult * routeDistance` reproduces
  // the old `floor(cargoType*3*dist/3)` exactly (core numerics unchanged).
  const valueMult = CARGO_TYPES[cargoType]?.valueMultiplier ?? cargoType;
  // dangerMult is the "3× danger" premium: 3 on the rim, 1 in the core (no-op).
  const dangerMult = SYSTEM_DANGER_LEVELS[destination] ?? 1;
  let payment = valueMult * routeDistance;
  if (payment < 1) payment = 1;
  payment = payment * upodX;
  payment = payment * dangerMult; // T-1104: 3× danger premium (core dangerMult=1)
  payment = payment + fuelRequired * 5 + CONTRACT_FLAT_PREMIUM; // T-1104 fuel premium; T-1605 flat term
  // T-1104: cap scales with danger so the rim premium isn't flattened (see
  // PAYMENT_CAP_PER_DANGER). Core (tier 1) keeps the exact 15000 foundation cap.
  const cap = PAYMENT_CAP_PER_DANGER * dangerMult;
  if (payment > cap) payment = cap;

  // T-107: an active era event re-prices the run. Applied AFTER the base cap so
  // "the economy fights back" — a plague can push medicine past the normal
  // ceiling — then re-normalized to a pod multiple below.
  const eraMultiplier = eraPaymentMultiplier(eraEvent, destination, cargoType);
  if (eraMultiplier !== 1) {
    payment = Math.floor(payment * eraMultiplier);
  }

  // T-1309 · Port-clerk flag → worse manifest terms. A flagged captain (unpaid
  // Tour One marker) gets the lower-paying runs: the payment is scaled by a <1
  // guild penalty computed from the flag's stored severity (engine guild.ts
  // guildManifestPenalty, passed down from day.ts startDay). Applied AFTER the era
  // multiplier and BEFORE the pod-normalize below — and GUARDED on `!== 1`, so a
  // clean captain (penalty 1, the default) leaves the number and the rng stream
  // untouched: every existing economy golden is byte-identical. READER named at the
  // call site (day.ts startDay → generateManifestBoard).
  if (guildManifestPenalty !== 1) {
    payment = Math.floor(payment * guildManifestPenalty);
    if (payment < 1) payment = 1;
  }

  // Normalize to pod multiple
  if (cargoPods > 0) {
    const perPod = Math.floor(payment / cargoPods);
    payment = perPod * cargoPods;
  }

  return {
    destination,
    cargoType,
    payment,
    pods: upodX,
  };
}

// ---------------------------------------------------------------------------
// N10 · THE SHARED JOB POOL — one place that owns the depletion arithmetic.
//
// `MarketState.jobPoolClaims` is the state; these four functions are the only
// things allowed to read or write it. That is deliberate and it is the lesson N4
// paid for twice: `isSimulatedCaptain` exists because four sites each spelled
// "the simulated field" their own way and two of them were wrong. A per-system
// tally invites exactly the same drift (`claims[id]` vs `claims[String(id)]` vs
// a forgotten clamp), so the key spelling and the clamp live here once.
//
// THESE ARE THE STEP'S KNOBS. The Change clause for N10 says the T-106 throttles
// are "throttles from the texture era: sweep them as knobs here rather than
// inheriting them silently" — so they are named constants with measured
// alternatives recorded at the definition site, not literals in a call site.
// ---------------------------------------------------------------------------

/** Offers a fully-stocked port puts on the board. The T-106 literal `4`, named. */
export const JOB_POOL_BOARD_SIZE = 4;

/** A port never goes completely dark: the board floor, however drained the pool. */
export const JOB_POOL_MIN_BOARD = 1;

/**
 * Jobs a port restocks per day, applied by {@link regeneratePools} at dawn.
 *
 * WHY A REGEN RATE EXISTS AT ALL. T-106's counter was reset to 0 every dawn, so
 * a claim could only ever thin ONE following board. Under N10 the tally persists
 * (that is the whole point — the player has to be able to arrive somewhere the
 * cast has been working), and a persisting tally with no recovery ratchets: 30
 * captains over 120 days would leave every port permanently at the floor, which
 * is attrition rather than competition and would fire this step's own Disproves
 * ("boards empty and Tour One clear collapses").
 *
 * WHY 2. Measured load is ~13 NPC hauls/day spread over 20 systems — 0.65
 * claims/system/day on average, but the cast CLUSTERS (contract destinations are
 * core-weighted), so hot systems take several a day and quiet ones take none.
 * A regen of 2 lets a busy hub sit visibly thin for a day or two while a quiet
 * port is always full, which is the signal this step exists to create.
 *
 * NOTE THE SPECIAL CASE THIS GENERALISES: at `>= JOB_POOL_BOARD_SIZE` this rule
 * reduces exactly to T-106's dawn reset, so the pre-N10 behaviour is a value of
 * this knob rather than a different mechanism. The sweep is recorded under N10 in
 * `docs/NPC_REDESIGN.md`.
 */
export const JOB_POOL_REGEN_PER_DAY = 2;

/**
 * The deepest a pool can be drained. Clamped so the board floor is reached but
 * never banked past: without this a hub could accumulate a 40-claim debt and take
 * twenty quiet days to work it off, which no longer reads as a job pool.
 * `BOARD_SIZE - MIN_BOARD` is the drain that already produces the floor, so any
 * tally above it is arithmetic with no visible consequence.
 */
export const JOB_POOL_MAX_CLAIMS = JOB_POOL_BOARD_SIZE - JOB_POOL_MIN_BOARD;

/** The one key spelling. `Record<string, number>` (the `matchCounts` precedent):
 *  a JSON round trip returns string keys whatever TypeScript was told. */
function poolKey(systemId: number): string {
  return String(systemId);
}

/** Offers this system's pool can currently supply — the board size for anyone
 *  reading it, player or captain. Never below {@link JOB_POOL_MIN_BOARD}. */
export function jobPoolDepth(
  claims: Readonly<Record<string, number>> | undefined,
  systemId: number,
): number {
  const drained = claims?.[poolKey(systemId)] ?? 0;
  return Math.max(JOB_POOL_MIN_BOARD, JOB_POOL_BOARD_SIZE - drained);
}

/** Records one claim against a system's pool, clamped to
 *  {@link JOB_POOL_MAX_CLAIMS}. Mutates in place — the CALLER owns the market
 *  record (day.ts), the same division of labour as `claimedContractIndex`. */
export function debitJobPool(claims: Record<string, number>, systemId: number): void {
  const key = poolKey(systemId);
  claims[key] = Math.min(JOB_POOL_MAX_CLAIMS, (claims[key] ?? 0) + 1);
}

/**
 * One day of restocking, across the whole galaxy. Steps every tally back toward
 * 0 by {@link JOB_POOL_REGEN_PER_DAY} and DELETES the ones that reach it, so a
 * quiet galaxy serializes as `{}` rather than growing a zero per system.
 */
export function regeneratePools(claims: Record<string, number>): void {
  for (const key of Object.keys(claims)) {
    const restocked = (claims[key] ?? 0) - JOB_POOL_REGEN_PER_DAY;
    if (restocked > 0) claims[key] = restocked;
    else delete claims[key];
  }
}

/**
 * Generates the daily manifest board. Normally {@link JOB_POOL_BOARD_SIZE}
 * contracts; contract competition drains the pool — each job claimed out of this
 * system by a captain thins it, down to a floor of {@link JOB_POOL_MIN_BOARD} so
 * a port never goes completely dark. The depth comes from
 * {@link jobPoolDepth}; N10 made that pool per-system and shared, so this is the
 * same function and the same numbers for the player's board and for a captain
 * working a port the player has never visited.
 */
export function generateManifestBoard(
  originSystem: number,
  rng: SeededRng,
  shipState: ShipState,
  count = 4,
  eraEvent: EraEventState | null = null,
  guildManifestPenalty = 1,
): CargoContract[] {
  const board: CargoContract[] = [];
  const spec = contractSpecFromShip(shipState);

  for (let i = 0; i < count; i++) {
    // T-1309: `guildManifestPenalty` (< 1 for a flag-carrying captain, 1 otherwise)
    // is threaded to every contract on the board. Default 1 keeps every existing
    // caller and golden byte-identical.
    board.push(rollContract(originSystem, rng, spec, eraEvent, guildManifestPenalty));
  }

  return board;
}

/**
 * T-1104 · The "carrying contraband" state. DERIVED from the already-serialized
 * `player.activeContract.cargoType` (no new GameState field, no save migration):
 * signing a Contraband contract sets `activeContract` (actions/trade.ts) → this
 * becomes true; delivering it clears `activeContract` (actions/travel.ts) → this
 * clears. Because it reads a serialized field it survives JSON round-trip for
 * free (asserted in economy.test.ts) with zero risk of desync against a
 * redundant boolean.
 *
 * READER: T-1305 patrol scans, via `isCarryingIllicit` below. A patrol boarding
 * calls that predicate (which unions this with the derelict-pod flag) to decide
 * whether to roll a GUILE scan against the player for carrying illegal cargo
 * (PRD §7.2: "patrol captains roll GUILE checks against smugglers"). As of
 * T-1305 the boarding consequence exists (engine actions/patrol.ts), so this
 * carrying state is now CONSUMED, not merely declared.
 */
export function isCarryingContraband(state: GameState): boolean {
  const c = state.player.activeContract;
  return !!c && CARGO_TYPES[c.cargoType]?.isContraband === true;
}

/**
 * T-1305 · The unified "is the player holding illicit goods a patrol would
 * scan for" predicate. Unions the TWO contraband sources the game can put in
 * your hold:
 *   1. a type-10 Contraband CONTRACT (T-1104) — `isCarryingContraband` above; and
 *   2. the derelict SEALED POD — the `signal.contraband.carrying` flag set by the
 *      `derelict.sealed-pod` storylet's "take it" choice. That flag had NO reader
 *      before T-1305 (the task's core gap: "take it" was strictly dominant); this
 *      predicate is finally it.
 *
 * READER: `applyPatrolContrabandScan` (engine actions/patrol.ts) — the patrol
 * GUILE scan fires only when this is true. Every branch that mutates hold state
 * on a caught scan (null the contract / clear the pod flag) checks the two
 * sources INDEPENDENTLY, so this union predicate is a gate, not a source of
 * truth about which cargo to confiscate.
 */
export function isCarryingIllicit(state: GameState): boolean {
  return isCarryingContraband(state) || state.flags['signal.contraband.carrying'] === true;
}
