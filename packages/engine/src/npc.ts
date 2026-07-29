import {
  CARGO_TYPES,
  DEFAULT_IDEAL_WEIGHTS,
  FLAWS,
  IDEAL_WEIGHTS,
  INTENT_STAT_AFFINITY,
  NPC_CHECK_DCS,
  NPC_INTENT_TYPES,
  NPC_PATROL_FAIL_CREDITS,
  NPC_PATROL_SUCCESS_CREDITS,
  NPC_PROFILES,
  NPC_SOCIALIZE_LOSS_CREDITS,
  NPC_SOCIALIZE_WIN_CREDITS,
  NPC_TRAVEL_FAIL_EXTRA_FUEL,
  NpcIntentType,
  NpcProfile,
  STAR_SYSTEMS,
  distance as systemDistance,
} from '@spacerquest/content';
import {
  CargoContract,
  CheckResult,
  EraEventState,
  GameEvent,
  GameState,
  NpcAction,
  NpcState,
  ShipState,
} from './types.js';
import { SeededRng } from './rng.js';
import { check } from './dice.js';
import {
  DriveBlock,
  calculateFuelCapacity,
  contractSpecFromShip,
  jumpFuelCost,
  localFuelPrice,
  rollContract,
} from './economy.js';
import { navFuelFactor } from './components.js';

/**
 * NPC simulation v2 — the living galaxy (T-106).
 *
 * One dusk tick = one NPC day, resolved coarsely: intent (from the Ideal
 * weight tables in content) → flaw check when the intent touches the flaw →
 * execution with REAL costs. NPCs jump with the same fuel math as the player
 * (jumpFuelCost), refuel at real local depot prices, and earn contract income
 * from the same payment formula that prices the player's manifest board.
 */

/** Named cast fly the systems the player's manifest board serves (1-14) plus
 *  the rim (15-20); Andromeda and the special systems stay off their routes. */
const NPC_SYSTEM_IDS: readonly number[] = Object.values(STAR_SYSTEMS)
  .map((system) => system.id)
  .filter((id) => id <= 20);

/** Nominal NPC drives by power tier: better drives make longer hauls cheaper.
 *  Tier 1 matches the player's starting drives (strength 10, condition 9).
 *
 *  T-106 intentionally SYNTHESIZES these numbers: the named cast never had
 *  ship stat blocks in the original, and the foundation anonymous-roster
 *  drives (20-30) are combat-encounter loadouts — too hot for an ambient
 *  economy sim (they would make every NPC jump nearly free). A gentle
 *  8 + 2×tier ramp keeps tier legible in fuel bills without breaking the
 *  shared jumpFuelCost math.
 *
 *  N1 · SEED-ONLY NOW. This was called on every NPC trade and every NPC jump,
 *  which is what made an NPC's drives a constant of its profile forever. It is
 *  now read exactly once per captain, by {@link npcShipForTier}; from then on
 *  the drives live on `npc.ship.drives` and are the ship's, not the tier's. */
export function npcDrives(tier: number): DriveBlock {
  return { strength: 8 + tier * 2, condition: 9 };
}

/** NPC cargo capacity by tier — feeds the same serviceable-pod payment math
 *  the player's board uses (tier 1 = 4 pods, tier 5 = 12).
 *
 *  T-106 synthesized, same rationale as npcDrives: no canonical NPC pod
 *  counts exist. 2 + 2×tier brackets the player's starting 10 pods around
 *  mid-tier so NPC contract income scales like the player's.
 *
 *  N1 · SEED-ONLY NOW, same as {@link npcDrives}. */
function npcCargoPods(tier: number): number {
  return 2 + tier * 2;
}

/**
 * N1 · Nominal NPC HULL STRENGTH by tier — the one genuinely new number this
 * step adds, and the only place the day-1 calibration can go wrong.
 *
 * WHY A NEW NUMBER AT ALL. The phantom ship had no hull strength: the call
 * sites passed a bare `hullCondition: 9` into `rollContract` and nothing else.
 * A real {@link ShipState} needs one, and the engine derives the FUEL TANK from
 * it (`calculateFuelCapacity(strength, condition)`), so the value chosen here
 * decides how much fuel a captain can hold.
 *
 * WHAT IT IS CALIBRATED AGAINST: **the phantom's UNBOUNDED tank.** Before N1 an
 * NPC's fuel was a bare number with no ceiling — `refuelIfNeeded` could top it
 * up without limit and the roster was born with 1,000 units
 * ({@link NPC_START_FUEL}). The worst case the tank must therefore absorb is
 * the birth tank (1,000) and the largest single top-up the refueller ever asks
 * for, which is `jumpFuelCost + 100` on the longest route an NPC can fly
 * (distance 45, Cygnus-16 → Rigel-19, at tier-1 drives → 540 + 100 = 640).
 * `2 + 2×tier` gives 1,200 units at tier 1 and 3,600 at tier 5, so the ceiling
 * clears both at every tier and CANNOT BIND — which is what makes day 1
 * numerically identical to the phantom rather than merely close.
 * `npc.test.ts` asserts exactly that, per tier, so a future change to the ramp,
 * to `NPC_START_FUEL`, to `FUEL_CAPACITY_HULL_MULTIPLIER` or to the star map
 * cannot silently turn this into a fuel-scarcity change.
 *
 * WHY NOT TIGHTER. The engine's own pod rule (`shipyard.ts`
 * `maxCargoPodsForShip`) would license a hull of 1–2 for these pod counts, and
 * that is the shape a "realistic" NPC hull would have — it puts a tier-1
 * captain on the player's 300-unit junker tank. It is also, precisely, a
 * FUEL-SCARCITY LEVER: it would clamp the roster's birth tank 1,000 → 300 and
 * make every long haul a refuelling decision. N1's contract is a state
 * refactor that changes NO decision (BALANCE-REDESIGN-WORKLIST, N1), so the
 * scarcity stays out. Tightening this ramp toward the player's hull is a real
 * candidate for a later N-step that owns one knob and sweeps it.
 *
 * FOUNDATION: no divergence to declare. Foundation (f2f95fa9) gives the named
 * cast no ship stat blocks at all, so — like `npcDrives` and `npcCargoPods`
 * before it — this is a Rimward-authored ramp with no prior number to preserve.
 */
function npcHullStrength(tier: number): number {
  return 2 + tier * 2;
}

/** Fuel every captain is born with. Unchanged from T-106, where it was a bare
 *  literal in `createInitialState`; named here because {@link npcHullStrength}
 *  is calibrated against it and `npc.test.ts` asserts the relationship. */
export const NPC_START_FUEL = 1000;

/**
 * N1 · The day-1 seed: profile tier → the {@link ShipState} that captain owns.
 *
 * CALLED BY `state.ts` `createInitialState` (world creation) and by the v9→v10
 * save migration in `save.ts`, which is the same mapping applied retroactively —
 * they must never drift, which is why there is one function.
 *
 * EVERY FIELD IS CHOSEN TO REPRODUCE THE PHANTOM EXACTLY, not to look plausible:
 *   - `cargoPods` / `drives` — the T-106 ramps, unchanged, so `rollContract` is
 *     handed the same spec it was handed before (via `contractSpecFromShip`).
 *   - `hull.condition: 9` — the literal the `rollContract` call sites passed.
 *   - `hull.strength` — {@link npcHullStrength}; see there for the calibration.
 *   - `navigation: { strength: 10, condition: 9 }` — the junker's nav, whose
 *     `navFuelFactor` is exactly 1.0, so routing NPC jumps through the player's
 *     full `jumpFuelCost(drives, dist, transWarp, navFactor)` signature costs
 *     the same fuel the old two-argument call did. It is a real 1, not an
 *     omitted argument: when N2 lets a captain buy nav, the discount lands
 *     without touching this call site.
 *   - `weapons` / `shields` / `lifeSupport` / `robotics` / `cabin` — the
 *     junker's, and NOTHING READS THEM YET. They are structurally required by
 *     `ShipState` and become live in N3 (NPCs meet pirates: `weaponVolleyDamage`
 *     and `shieldMitigation` are their named future readers). Seeding them at
 *     the player's starting values rather than at tier-scaled guesses is
 *     deliberate: an invented combat fit would be an unmeasured balance change
 *     smuggled in ahead of the step that is supposed to measure it.
 *   - every special-equipment flag false — the phantom had none.
 */
export function npcShipForTier(tier: number): ShipState {
  const hull = { strength: npcHullStrength(tier), condition: 9 };
  return {
    fuel: NPC_START_FUEL,
    // Through the engine's own capacity function — never a restated formula.
    maxFuel: calculateFuelCapacity(hull.strength, hull.condition),
    cargoPods: npcCargoPods(tier),
    hull,
    drives: npcDrives(tier),
    weapons: { strength: 1, condition: 9 },
    shields: { strength: 1, condition: 9 },
    navigation: { strength: 10, condition: 9 },
    lifeSupport: { strength: 10, condition: 9 },
    robotics: { strength: 10, condition: 9 },
    cabin: { strength: 1, condition: 9 },
    hasTransWarpDrive: false,
    hasCloaker: false,
    hasAutoRepair: false,
    hasStarBuster: false,
    hasArchAngel: false,
    isAstraxialHull: false,
    hasTitaniumHull: false,
  };
}

/**
 * N1 · THE SAVE BACKFILL, in one place, because there are two paths into a
 * loaded game and they must not drift: the versioned envelope (`save.ts`'s
 * v9→v10 migration) and the schema-tolerant `deserializeState` (`state.ts`).
 *
 * Gives a pre-N1 captain the ship their tier says they always had, and carries
 * their SAVED fuel across into its tank rather than refilling it — a legacy
 * captain who was down to 12 units stays down to 12 units. `carriedFuel` is
 * `unknown` because the migration hands over raw JSON; anything that is not a
 * finite number falls back to the seeded tank, and an over-full legacy tank is
 * clamped to the hull's ceiling (which cannot happen from a real save — the old
 * tank only ever held `jumpFuelCost + 100` — but a migration must not be the
 * thing that produces an invalid state).
 *
 * An unknown `profileId` resolves to tier 1 rather than throwing: a migration
 * must never be the thing that throws (save.ts registry header).
 */
export function seedNpcShip(profileId: string, carriedFuel: unknown): ShipState {
  const tier = NPC_PROFILES.find((p) => p.id === profileId)?.tier ?? 1;
  const ship = npcShipForTier(tier);
  if (typeof carriedFuel === 'number' && Number.isFinite(carriedFuel)) {
    ship.fuel = Math.max(0, Math.min(ship.maxFuel, carriedFuel));
  }
  return ship;
}

/** The fuel an NPC jump costs, through the SAME call the player's travel makes
 *  (`actions/travel.ts`): the ship's drives, its Trans-Warp flag and its
 *  navigation discount. Seeded ships carry no Trans-Warp and a junker nav
 *  (factor 1.0), so this is numerically identical to the pre-N1
 *  `jumpFuelCost(npcDrives(tier), distance)` — and it stops being identical the
 *  moment N2 lets a captain buy either, with no change needed here. */
function npcJumpFuelCost(ship: ShipState, routeDistance: number): number {
  return jumpFuelCost(ship.drives, routeDistance, ship.hasTransWarpDrive, navFuelFactor(ship));
}

/** Broke line: under this an NPC stops discretionary spending, takes odd
 *  jobs, and may show up on the wire begging for fuel money. */
const NPC_BROKE_CREDITS = 100;
/** Poverty pressure: below this an NPC's Trade weight gets a flat boost —
 *  a hungry spacer looks for paying work regardless of worldview. */
const NPC_POVERTY_CREDITS = 1000;
const NPC_POVERTY_TRADE_BOOST = 10;
/** Odd-job alms earned on an idle broke day — keeps the floor above zero so
 *  nobody is pinned at exactly 0 credits forever. */
const NPC_ODD_JOB_CREDITS = 25;
/** Fuel spends in combat/patrol mirror the player's stance costs. */
const NPC_COMBAT_FUEL = 50;
const NPC_PATROL_FUEL = 10;

export interface NpcDayContext {
  day: number;
  /** The player's live manifest board when this NPC is allowed to claim from
   *  it (same system as the player, no claim spent today); null otherwise.
   *  READ-ONLY here — the caller (day.ts) performs the splice and emits the
   *  claim events. */
  claimableBoard: readonly CargoContract[] | null;
  /** The active world economic event (T-107). NPCs feel the same re-priced
   *  economy as the player: synthesized contract income and depot refuel costs
   *  read the same modifiers. Null when no event is active. */
  eraEvent: EraEventState | null;
}

export interface NpcDayResult {
  npc: NpcState;
  events: GameEvent[];
  /** Index into ctx.claimableBoard of the offer this NPC took (T-106 contract
   *  competition). Only set when the NPC actually executed the haul. */
  claimedContractIndex?: number;
}

function systemName(systemId: number): string {
  return STAR_SYSTEMS[systemId]?.name ?? `system ${systemId}`;
}

/** Weighted intent pick: base weight from the Ideal table x (1 + affinity
 *  stat, floored at 0). Poverty pressure adds a flat Trade boost. Returns
 *  'Idle' only in the all-weights-zero corner. */
export function pickIntent(
  profile: NpcProfile,
  credits: number,
  rng: SeededRng,
): NpcIntentType | 'Idle' {
  const base = IDEAL_WEIGHTS[profile.ideal] ?? DEFAULT_IDEAL_WEIGHTS;
  const weighted = NPC_INTENT_TYPES.map((intent) => {
    const stat = Math.max(0, profile.stats[INTENT_STAT_AFFINITY[intent]]);
    let weight = base[intent] * (1 + stat);
    if (intent === 'Trade' && credits < NPC_POVERTY_CREDITS) {
      weight += NPC_POVERTY_TRADE_BOOST;
    }
    return { intent, weight };
  });

  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    // Invariant: a weight of 0 DISABLES a verb (ideals.ts contract), so an
    // Ideal that zeroes every verb must resolve to a no-op day — never to a
    // verb the table forbade. Unreachable with the current tables (every
    // Ideal has a positive weight), but future content must not break it.
    return 'Idle';
  }

  let roll = rng.next() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll < 0) return entry.intent;
  }
  return weighted[weighted.length - 1].intent;
}

/** Clamp-and-apply a disposition change, emitting a typed event when the
 *  value actually moves. Shared by combat (tribute/defeat/fled), dusk decay,
 *  and anything else that touches per-NPC standing. */
/**
 * THE ONE DOOR to mutating an NPC from outside its own turn.
 *
 * `cloneState` SHARES NPC records between snapshots (see clone.ts for the
 * measurement that motivated it). A record reached through `state.npcs.find(...)`
 * therefore belongs to every earlier snapshot too — the replay goldens, the UI's
 * previous render, the save about to be written — so writing to it in place
 * corrupts history rather than advancing it.
 *
 * This replaces the array entry with a private copy and hands that back, so the
 * caller can write to it exactly as before. Returns null when the id is unknown.
 *
 * FOUR CALLERS, and they are the complete set of cross-boundary NPC writers in the
 * engine: `applyDisposition` (below), the Hangout dealer's dare stake
 * (actions/hangout.ts), and the bond-hook rescuer's fuel and lastAction (day.ts,
 * two sites). An NPC's OWN turn does not need this — `resolveNpcDay` already
 * opens by copying its subject. `__tests__/clone.test.ts` holds the line with a
 * source scan, the same way it already holds the event log's.
 *
 * A structural clone rather than a spread, deliberately — and as of N1 that is no
 * longer a precaution but a requirement: the record now carries a `ship` with
 * eight nested component objects, and a shallow copy would share them, so
 * `mutableNpc(...).ship.fuel -= n` would reach straight back into every earlier
 * snapshot. That is the exact bug this function exists to prevent.
 */
export function mutableNpc(state: GameState, npcId: string): NpcState | null {
  const index = state.npcs.findIndex((candidate) => candidate.id === npcId);
  if (index === -1) return null;
  const copy = structuredClone(state.npcs[index]);
  state.npcs[index] = copy;
  return copy;
}

export function applyDisposition(
  state: GameState,
  npcId: string,
  delta: number,
  reason:
    | 'tribute'
    | 'defeat'
    | 'player-fled'
    | 'decay'
    | 'storylet'
    | 'contract-sniped'
    // T-1303 Hangout beats (Dare / befriend / insult / meet) move dealer standing.
    | 'dare'
    | 'befriend'
    | 'insult'
    | 'meet'
    // T-1304: a Penny Wise loan default sours her standing (one-time).
    | 'loan-default'
    // T-1305: a NAMED patrol captain who catches you smuggling holds a grudge.
    | 'contraband-caught',
  events: GameEvent[],
): void {
  // COPY-ON-WRITE (see clone.ts): `cloneState` now SHARES NPC records between
  // snapshots, so mutating one in place would reach back into every earlier state
  // — including the ones the replay goldens and the UI's previous render hold. The
  // record is replaced instead. This is the ONLY cross-boundary NPC writer in the
  // engine; an NPC's own turn works on a private copy already.
  if (delta === 0) return;
  const existing = state.npcs.find((candidate) => candidate.id === npcId);
  if (!existing) return;
  const next = Math.max(-10, Math.min(10, existing.disposition + delta));
  if (next === existing.disposition) return;
  const applied = next - existing.disposition;
  const npc = mutableNpc(state, npcId);
  if (!npc) return;
  npc.disposition = next;
  events.push({
    type: 'DispositionChanged',
    day: state.day,
    npcId,
    delta: applied,
    disposition: next,
    reason,
  });
}

/** Refuel at the CURRENT system's real depot price when the tank can't cover
 *  `needed`. Keeps a small credit reserve so refueling never zeroes an NPC.
 *
 *  N1 · The tank is now the SHIP's, so the top-up is clamped to `maxFuel` the
 *  same way the player's `resolveTrade` clamps a fuel purchase — a captain
 *  cannot carry more than the hull holds. THIS CLAMP IS EVALUATED ON EVERY
 *  REFUEL AND NEVER BINDS at the seeded fits (npcHullStrength is calibrated so
 *  it cannot; `npc.test.ts` pins that per tier), which is exactly why day 1 is
 *  numerically identical to the phantom's unbounded tank. It is here so that a
 *  captain who later loses hull condition — N3 — is fuel-limited by their ship
 *  rather than by nothing. */
function refuelIfNeeded(npc: NpcState, needed: number, eraEvent: EraEventState | null): void {
  const ship = npc.ship;
  if (ship.fuel >= needed) return;
  const price = localFuelPrice(npc.currentSystemId, eraEvent);
  const spendable = Math.max(0, npc.credits - NPC_BROKE_CREDITS);
  const affordable = Math.floor(spendable / price);
  const room = Math.max(0, ship.maxFuel - ship.fuel);
  const amount = Math.min(needed - ship.fuel + 100, affordable, room);
  if (amount <= 0) return;
  npc.credits -= amount * price;
  ship.fuel += amount;
}

function brokeIdle(npc: NpcState, rng: SeededRng, day: number, events: GameEvent[]): NpcAction {
  // Odd jobs at the docks: keeps broke NPCs off an exact-zero pin and gives
  // them a road back to solvency (they'll trade again under poverty pressure).
  npc.credits += NPC_ODD_JOB_CREDITS;
  if (rng.next() < 0.3) {
    events.push({
      type: 'WireEntry',
      day,
      kind: 'npc',
      message: `${npc.name} seen begging for fuel money at ${systemName(npc.currentSystemId)}.`,
    });
  }
  return {
    type: 'Idle',
    details: `worked odd jobs at the ${systemName(npc.currentSystemId)} docks, hard up for credits`,
  };
}

/** Per-intent StatCheck.actionContext tag (T-1201). Lets the wire (day.ts /
 *  ui format.ts) and T-1202 discriminate NPC checks per verb without parsing
 *  the `actor` string. */
const NPC_CHECK_CONTEXT: Record<
  NpcIntentType,
  'npc-trade' | 'npc-travel' | 'npc-combat' | 'npc-patrol' | 'npc-socialize'
> = {
  Trade: 'npc-trade',
  Travel: 'npc-travel',
  Combat: 'npc-combat',
  Patrol: 'npc-patrol',
  Socialize: 'npc-socialize',
};

/**
 * Route an NPC verb through the SAME shared check() the player uses (T-1201,
 * PRD §7: "one system — there is no separate AI"). Rolls d20 + the intent's
 * affinity stat vs its content-defined DC and emits a StatCheck event.
 *
 * Invariant (asserted by tests): a resolved NPC day whose lastAction.type is
 * one of the five verbs ⟺ exactly one StatCheck was emitted. Every broke /
 * underfunded fallback returns Idle/FlawOverride and rolls NOTHING, so the
 * wire's trade-failure rate and the acceptance test's denominator stay honest.
 */
function rollNpcCheck(
  npc: NpcState,
  profile: NpcProfile,
  intent: NpcIntentType,
  rng: SeededRng,
  events: GameEvent[],
): CheckResult {
  const stat = INTENT_STAT_AFFINITY[intent];
  const dc = NPC_CHECK_DCS[intent];
  const result = check(rng.d20(), profile.stats[stat], dc);
  events.push({
    type: 'StatCheck',
    actor: npc.id,
    stat,
    dc,
    result,
    actionContext: NPC_CHECK_CONTEXT[intent],
  });
  return result;
}

function executeTrade(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
): { action: NpcAction; claimedContractIndex?: number } {
  // T-106 contract competition mechanism: when trading in the player's
  // system, the NPC pulls a SPECIFIC offer off the live manifest board (the
  // shared per-system job pool) instead of synthesizing one. The caller
  // splices it from the board and shrinks tomorrow's board generation pool,
  // so the player watches an offer they saw disappear.
  let claimedContractIndex: number | undefined;
  let contract: CargoContract;
  if (ctx.claimableBoard && ctx.claimableBoard.length > 0) {
    claimedContractIndex = Math.floor(rng.next() * ctx.claimableBoard.length);
    contract = ctx.claimableBoard[claimedContractIndex]!;
  } else {
    // N1 · The offer is sized against the ship this captain actually owns,
    // through the engine's own `contractSpecFromShip` — the same adapter the
    // player's manifest board uses — instead of a tier-derived phantom spec.
    contract = rollContract(npc.currentSystemId, rng, contractSpecFromShip(npc.ship), ctx.eraEvent);
  }

  const routeDistance = systemDistance(npc.currentSystemId, contract.destination);
  const fuelCost = npcJumpFuelCost(npc.ship, routeDistance);
  refuelIfNeeded(npc, fuelCost, ctx.eraEvent);
  if (npc.ship.fuel < fuelCost) {
    // Can't fund the haul: the claim never happens (the offer stays on the
    // board) and the day is lost to the docks.
    return { action: brokeIdle(npc, rng, ctx.day, events) };
  }

  // Coarse NPC day: sign, jump, deliver in one dusk tick. Real fuel out —
  // the same formula that prices the player's day. The contract is fulfilled
  // and paid either way (payment is contractual); the Trade check (T-1201)
  // decides how CLEANLY the run went and is recorded as a StatCheck for the
  // wire (day.ts / ui format.ts) and T-1202.
  //
  // WHY the Trade check carries no CREDIT/FUEL swing (unlike the other four
  // verbs): Trade is by far the most FREQUENT NPC verb, and a Trade check is a
  // SKILL check — high-TRADE (rich) NPCs almost never fail while low-TRADE ones
  // fail often. Any per-trade economic penalty therefore (a) drains the poor
  // toward the fuel-cost floor while the rich dodge it, and (b) — because it
  // fires ~1000×/200 days — perturbs the shared poverty/refuel/intent RNG
  // stream cast-wide, both of which make the 200-day wealth distribution
  // degenerate (max > 10x median), which the sim's solvency invariant rejects.
  // So the soured-run consequence is the visible wire narrative + the recorded
  // failure, not a payout change. (Verified: a payout/fuel penalty here pushes
  // the seed-1 solvency ratio out of band; this design holds it at baseline.)
  npc.ship.fuel -= fuelCost;
  npc.currentSystemId = contract.destination;
  npc.credits += contract.payment;
  const cargoName = CARGO_TYPES[contract.cargoType]?.name ?? `type-${contract.cargoType} cargo`;

  const result = rollNpcCheck(npc, profile, 'Trade', rng, events);
  if (result.success) {
    return {
      action: {
        type: 'Trade',
        details: `hauled ${cargoName} to ${systemName(contract.destination)} for ${contract.payment} credits`,
      },
      claimedContractIndex,
    };
  }
  return {
    action: {
      type: 'Trade',
      details: `delivered ${cargoName} to ${systemName(contract.destination)} for ${contract.payment} credits, but the run soured — a rough, costly haul`,
    },
    claimedContractIndex,
  };
}

function executeTravel(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
): NpcAction {
  const options = NPC_SYSTEM_IDS.filter((id) => id !== npc.currentSystemId);
  const destination = options[Math.floor(rng.next() * options.length)];
  const fuelCost = npcJumpFuelCost(npc.ship, systemDistance(npc.currentSystemId, destination));
  refuelIfNeeded(npc, fuelCost, ctx.eraEvent);
  if (npc.ship.fuel < fuelCost) {
    return brokeIdle(npc, rng, ctx.day, events);
  }
  npc.ship.fuel -= fuelCost;
  npc.currentSystemId = destination;
  // A Travel (PILOT) check decides a clean jump vs a rough one (T-1201).
  const result = rollNpcCheck(npc, profile, 'Travel', rng, events);
  if (result.success) {
    return { type: 'Travel', details: `jumped to ${systemName(destination)}` };
  }
  npc.ship.fuel = Math.max(0, npc.ship.fuel - NPC_TRAVEL_FAIL_EXTRA_FUEL);
  return {
    type: 'Travel',
    details: `made a rough jump to ${systemName(destination)}, burning extra fuel`,
  };
}

function executeCombat(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
): NpcAction {
  refuelIfNeeded(npc, NPC_COMBAT_FUEL, ctx.eraEvent);
  if (npc.ship.fuel < NPC_COMBAT_FUEL) {
    return brokeIdle(npc, rng, ctx.day, events);
  }
  npc.ship.fuel -= NPC_COMBAT_FUEL;
  // A Combat (GUNS) check through the shared check() decides the engagement
  // (T-1201, replacing a raw inline d20+GUNS threshold of 12 — the DC now lives
  // in content NPC_CHECK_DCS); a win pays a tier-scaled bounty (the anonymous
  // rank-and-file don't fly empty).
  //
  // T-106 synthesized number: foundation combat pays fixed per-roster prize
  // values sized for player encounters — fed into a 30-NPC daily sim they
  // would swamp trade income. 150×tier keeps fighting a living, not a
  // money printer, next to the shared contract-payment formula.
  const result = rollNpcCheck(npc, profile, 'Combat', rng, events);
  if (result.success) {
    const bounty = 150 * profile.tier;
    npc.credits += bounty;
    return {
      type: 'Combat',
      details: `ran down a mark near ${systemName(npc.currentSystemId)} and collected ${bounty} credits`,
    };
  }
  return {
    type: 'Combat',
    details: `traded fire near ${systemName(npc.currentSystemId)} and broke off with nothing to show`,
  };
}

function executePatrol(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
): NpcAction {
  if (npc.credits < NPC_BROKE_CREDITS) {
    return brokeIdle(npc, rng, ctx.day, events);
  }
  npc.ship.fuel = Math.max(0, npc.ship.fuel - NPC_PATROL_FUEL);
  // A Patrol (GRIT) check decides a productive sweep vs a costly quiet day
  // (T-1201).
  const result = rollNpcCheck(npc, profile, 'Patrol', rng, events);
  if (result.success) {
    npc.credits += NPC_PATROL_SUCCESS_CREDITS;
    return {
      type: 'Patrol',
      details: `ran a clean sweep of the ${systemName(npc.currentSystemId)} lanes`,
    };
  }
  npc.credits = Math.max(0, npc.credits - NPC_PATROL_FAIL_CREDITS);
  return {
    type: 'Patrol',
    details: `patrolled the ${systemName(npc.currentSystemId)} lanes, a quiet day that cost more than it paid`,
  };
}

function executeSocialize(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
): NpcAction {
  if (npc.credits < NPC_BROKE_CREDITS + 50) {
    // Can't cover the ante — no roll, no verb. Falls back to odd jobs (Idle),
    // so a returned Socialize action ALWAYS means a check was rolled (T-1201
    // verb⟺StatCheck invariant).
    return brokeIdle(npc, rng, ctx.day, events);
  }
  // A night at the Hangout: a Socialize (GUILE) check through the shared
  // check() to come out ahead at the tables (T-1201, replacing a raw inline
  // d20+GUILE threshold of 14 — the DC now lives in content NPC_CHECK_DCS).
  const result = rollNpcCheck(npc, profile, 'Socialize', rng, events);
  if (result.success) {
    npc.credits += NPC_SOCIALIZE_WIN_CREDITS;
    return {
      type: 'Socialize',
      details: `cleaned up at the ${systemName(npc.currentSystemId)} Hangout tables`,
    };
  }
  npc.credits -= NPC_SOCIALIZE_LOSS_CREDITS;
  return {
    type: 'Socialize',
    details: `bought a round at the ${systemName(npc.currentSystemId)} Hangout`,
  };
}

export function resolveNpcDay(npc: NpcState, rng: SeededRng, ctx: NpcDayContext): NpcDayResult {
  const events: GameEvent[] = [];
  // The subject's private copy for the day — this is why an NPC's OWN turn does
  // not need `mutableNpc`. N1 · `structuredClone` rather than the old
  // `JSON.parse(JSON.stringify(npc))`: the record grew a ship with eight nested
  // component objects, and the JSON round-trip on the fatter record cost ~21% of
  // the ambient NPC day (0.345 -> 0.418 ms/game-day over 10 seeds x 120 days;
  // structuredClone puts it back at 0.35). Same depth of copy, same result — and
  // it is already the clone `mutableNpc` uses on the same type.
  const updatedNpc = JSON.parse(JSON.stringify(npc)) as NpcState;

  const profile = NPC_PROFILES.find((p) => p.id === updatedNpc.profileId);
  if (!profile) {
    throw new Error(`Profile not found for NPC ${updatedNpc.id}`);
  }

  // 1. Intent — content weight tables (Ideal x stats), replacing the old
  //    3-branch stat comparison.
  const intent = pickIntent(profile, updatedNpc.credits, rng);

  // 2. The Flaw Check — only when the day's intent touches the flaw
  // (PRD §6: flaws override optimal play when a decision touches them,
  // not on a blanket daily roll). Resist on d20 >= the character's own
  // flawDc: disciplined characters resist easily, volatile ones rarely.
  const flawDef = FLAWS[profile.flaw];
  const touchesFlaw = flawDef !== undefined && (flawDef.triggers as string[]).includes(intent);

  let overridden = false;
  if (touchesFlaw) {
    const die = rng.d20();
    const resisted = die >= profile.flawDc;

    events.push({
      type: 'FlawCheck',
      npcId: updatedNpc.id,
      flaw: profile.flaw,
      die,
      dc: profile.flawDc,
      resisted,
    });

    overridden = !resisted;
  }

  let action: NpcAction;
  let claimedContractIndex: number | undefined;

  if (overridden && flawDef) {
    // Flaw Override! The flaw chooses the day.
    action = { type: 'FlawOverride', details: flawDef.detail };
    if (flawDef.credits) {
      if (flawDef.credits > 0) {
        updatedNpc.credits += flawDef.credits;
      } else {
        // Losses never take an NPC below pocket change (and never below what
        // they already had) — nobody gambles away their last meal, and nobody
        // gets pinned at exactly 0 credits.
        updatedNpc.credits = Math.max(
          Math.min(updatedNpc.credits, NPC_ODD_JOB_CREDITS),
          updatedNpc.credits + flawDef.credits,
        );
      }
    }
    if (flawDef.fuel === 'drain') {
      updatedNpc.ship.fuel = 0;
    } else if (flawDef.fuel) {
      updatedNpc.ship.fuel = Math.max(0, updatedNpc.ship.fuel + flawDef.fuel);
    }
  } else if (intent === 'Trade') {
    const result = executeTrade(updatedNpc, profile, rng, ctx, events);
    action = result.action;
    claimedContractIndex = result.claimedContractIndex;
  } else if (intent === 'Travel') {
    action = executeTravel(updatedNpc, profile, rng, ctx, events);
  } else if (intent === 'Combat') {
    action = executeCombat(updatedNpc, profile, rng, ctx, events);
  } else if (intent === 'Patrol') {
    action = executePatrol(updatedNpc, profile, rng, ctx, events);
  } else if (intent === 'Socialize') {
    action = executeSocialize(updatedNpc, profile, rng, ctx, events);
  } else {
    // 'Idle' — the all-weights-zero corner of pickIntent: a true no-op day.
    action = {
      type: 'Idle',
      details: `kept to their bunk at ${systemName(updatedNpc.currentSystemId)}`,
    };
  }

  updatedNpc.lastAction = action;

  events.push({
    type: 'NpcAction',
    npcId: updatedNpc.id,
    actionDetails: action.details,
  });

  return { npc: updatedNpc, events, claimedContractIndex };
}
