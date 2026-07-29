import {
  CARGO_TYPES,
  DEFAULT_IDEAL_WEIGHTS,
  FLAWS,
  IDEAL_WEIGHTS,
  INTENT_STAT_AFFINITY,
  NPC_CHECK_DCS,
  NPC_COMPONENT_STAT_AFFINITY,
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
  SHIP_COMPONENTS,
  Stat,
  StatBlock,
  YARD_COMPONENT_TIER_PRICES,
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
  PlayerAction,
  ShipComponentId,
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
  syncMaxFuel,
} from './economy.js';
import { navFuelFactor } from './components.js';
import {
  applyShipyardMutation,
  componentTierForStrength,
  maxCargoPodsForShip,
  quoteShipyard,
} from './actions/shipyard.js';

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
 *  now read exactly once per captain, by {@link npcShipForProfile}; from then on
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
 * N2 · NPC HULL STRENGTH — **the smallest hull that legally carries the
 * captain's cargo, read out of the engine's own pod rule.** This is the removal
 * of N1's fuel exemption, and it is a fuel-scarcity lever, swept as its own knob.
 *
 * WHAT N1 DID AND WHY IT WAS AN EXEMPTION. N1 needed a hull strength (the
 * phantom had none — the call sites passed a bare `hullCondition: 9`) and the
 * engine derives the FUEL TANK from it, so the number chosen decides how much
 * fuel a captain can hold. N1 chose `2 + 2·tier`, calibrated against **the
 * phantom's UNBOUNDED tank** so that the ceiling could never bind and day 1 would
 * be numerically identical rather than merely close. That worked, and it left a
 * tier-1 NPC holding 4 cargo pods and a **1,200-unit tank** where a player with
 * comparable capacity — the junker: 10 pods, hull strength 1 — holds **300**.
 * NPCs flew on ~4× a player's fuel. N1 flagged it at this site as an exemption
 * (NPC_REDESIGN, standing constraint 2: "a number chosen so that a
 * rule will NOT bite is a rule exemption, even when the resulting state is
 * legal") and handed the removal to N2, which is where it lands.
 *
 * WHAT IT IS NOW. The hull the yard would demand for this captain's hold:
 * the smallest strength whose `maxCargoPodsForShip` covers {@link npcCargoPods}.
 * That is 1 at tiers 1–4 (4/6/8/10 pods against a 10-pod ceiling) and 2 at tier 5
 * (12 pods needs a 20-pod ceiling) — tanks of **300 and 600** against the player's
 * 300-unit junker. It is COMPUTED, not tabulated: this function searches with the
 * engine's own `maxCargoPodsForShip`, so if the pod ramp, the hull→capacity rule
 * or `FUEL_CAPACITY_HULL_MULTIPLIER` ever move, the seed moves with them and
 * cannot silently go back to licensing a hull the yard would refuse.
 *
 * WHY IT COULD NOT LAND EARLIER, and this is the load-bearing sequencing point:
 * tightening the tank WITHOUT granting the upgrade path makes a captain
 * permanently poorer with no recourse, which is itself a same-rules violation —
 * a player can buy a better hull. Coupled with {@link considerRefit} it is the
 * intended loop instead: profit → better hull → bigger tank and more pods →
 * longer, richer hauls.
 *
 * THE CLAMP NOW BINDS, ON PURPOSE. {@link NPC_START_FUEL} is 1,000 and the tier-1
 * tank is 300, so the birth tank is clamped in {@link npcShipForProfile} and
 * `refuelIfNeeded`'s ceiling is live from day 1. `npc.test.ts` asserts the new
 * relationship in place of N1's "the ceiling cannot bind" pin — the old assertion
 * was the exemption written down, and deleting it silently would have hidden that.
 *
 * FOUNDATION: no divergence to declare. Foundation (f2f95fa9) gives the named
 * cast no ship stat blocks at all, so — like `npcDrives` and `npcCargoPods` —
 * there is no prior number to preserve.
 */
function npcHullStrength(tier: number): number {
  const pods = npcCargoPods(tier);
  for (let strength = 1; strength <= 9; strength += 1) {
    if (maxCargoPodsForShip({ ...PROBE_SHIP, hull: { strength, condition: 9 } }) >= pods) {
      return strength;
    }
  }
  // Unreachable at the shipped pod ramp (strength 9 licenses 90 pods against a
  // maximum of 12). Kept as the junker-range ceiling rather than throwing: this
  // runs inside a save migration, which must never be the thing that throws.
  return 9;
}

/** A throwaway hull carrier for {@link npcHullStrength}'s search. Only
 *  `hull` / `hasTitaniumHull` are read by `maxCargoPodsForShip`; the rest is
 *  structural filler, which is why it is a frozen module constant rather than a
 *  ship built per call. */
const PROBE_SHIP: ShipState = Object.freeze({
  fuel: 0,
  maxFuel: 0,
  cargoPods: 0,
  hull: { strength: 1, condition: 9 },
  drives: { strength: 1, condition: 9 },
  weapons: { strength: 1, condition: 9 },
  shields: { strength: 1, condition: 9 },
  navigation: { strength: 1, condition: 9 },
  lifeSupport: { strength: 1, condition: 9 },
  robotics: { strength: 1, condition: 9 },
  cabin: { strength: 1, condition: 9 },
  hasTitaniumHull: false,
});

/** Fuel every captain is born with. Unchanged from T-106, where it was a bare
 *  literal in `createInitialState`; named here because {@link npcHullStrength}
 *  is calibrated against it and `npc.test.ts` asserts the relationship. */
export const NPC_START_FUEL = 1000;

/**
 * N2 · THE CAPTAIN'S SHOPPING LADDER — the eight components in the order THIS
 * captain would buy them, strongest appetite first.
 *
 * ONE LADDER, TWO READERS, and that is the point. {@link npcShipForProfile} walks
 * it to decide where a tier-N captain's already-earned career went, and
 * {@link considerRefit} walks the same list to decide what they buy next. A
 * seeded fit is therefore always a state the captain's own shopping could have
 * reached — there is no "starting kit" rule separate from the "buying" rule to
 * drift apart, which is the same structural answer N6 used for the Honor List.
 *
 * DETERMINISTIC, and deliberately not random: appetite comes from
 * `NPC_COMPONENT_STAT_AFFINITY` (content) applied to the captain's own stat block,
 * and ties fall back to `SHIP_COMPONENTS` order — content's declared order, not an
 * order invented here. No rng is consumed anywhere on this path, which is what
 * lets a sweep arm that changes only the ladder stay attributable: on any day a
 * captain buys nothing, the shared rng stream is byte-identical to the arm before.
 */
function npcComponentLadder(stats: StatBlock): ShipComponentId[] {
  // Assigned into the ENGINE's own key union rather than used at content's: if
  // content ever adds a component this line fails to compile with a missing key,
  // instead of silently leaving the new component off every captain's ladder.
  const affinity: Record<ShipComponentId, Stat> = NPC_COMPONENT_STAT_AFFINITY;
  const order = SHIP_COMPONENTS.map((component) => component.id);
  return [...order].sort((a, b) => {
    const appetite = stats[affinity[b]] - stats[affinity[a]];
    return appetite !== 0 ? appetite : order.indexOf(a) - order.indexOf(b);
  });
}

/**
 * N2 · How many of their eight systems a captain has actually put money into.
 *
 * WHY A CAP AT ALL, rather than "tier steps spread over everything". A captain
 * who has upgraded a little of all eight is a captain with no identity, and the
 * Honor List reads identity: N6 measured that a field where tier is the only axis
 * leaves every title held by the same three tier-5 captains. Three specialisms
 * out of eight means a tier-5 gunner tops Strongest Weapons while a tier-5 pilot
 * tops Best Navigation, which is a contest. It is not tuned — 3 is "most of a
 * ship is stock, a few things are yours", the shape every archetype in
 * `docs/PRD-REIMAGINED.md` §6 describes.
 */
const NPC_SPECIALISM_COUNT = 3;

/**
 * N2 · Strength added to each specialism per power tier.
 *
 * DELIBERATELY THE SAME `2 × tier` SLOPE the T-106 ramps already use for
 * {@link npcDrives} (8 + 2·tier) and {@link npcCargoPods} (2 + 2·tier), so this
 * introduces no new pace — it applies the pace the cast already had to the six
 * components that were flat.
 *
 * THESE STRENGTHS SIT BETWEEN YARD TIERS, and that is inherited, not invented.
 * `applyShipyardMutation` only ever sets `strength = tier × 10`, so a strength of
 * 14 is not a state the yard could have sold anyone — exactly as `npcDrives` has
 * not been since T-106 (10, 12, 14, 16, 18). The reason is the same: the yard's
 * ladder has nine rungs a decade apart and the cast has five tiers, so pricing the
 * seed on the yard's scale would leave tier 1 and tier 2 identical and put every
 * navigation specialist on the same fuel discount. The seed says how far along a
 * captain is; the yard says what they can buy NEXT, through
 * `componentTierForStrength` (which floors, so a between-tiers fit is read as the
 * tier below it and the next purchase is always an improvement — asserted in
 * `npc.test.ts`). *Consequence found and reported rather than papered over:* the
 * junker band of `tradeInValue` is indexed by raw strength and reaches 3,000 at
 * strength 9, well past the 50cr tier-1 list price, so a captain seeded at
 * strength ≥ 2 gets their first rung free. That is the engine's own rule meeting a
 * strength band the PLAYER can never occupy; it is one rung, once, per component.
 */
const NPC_SPECIALISM_STRENGTH_PER_TIER = 2;

/**
 * N2 · HULL AND DRIVES ARE OFF THE SEED RAMP, and are still on the shopping
 * ladder — the one asymmetry in this design, so it is stated rather than left to
 * be inferred.
 *
 * Neither was ever flat, which is the whole of N6's finding: `npcDrives` already
 * ramps `8 + 2·tier`, and the hull is not a free axis at all — the engine's own
 * `maxCargoPodsForShip` pins it to the pods the captain carries
 * ({@link npcHullStrength}). Adding a SECOND, independent `2 × tier` on top of
 * either would double-count tier in exactly the two components that never needed
 * it, and on the hull it would be a fuel-scarcity change wearing a component-ramp
 * costume — the confusion N2 splits into two separately-swept knobs precisely to
 * avoid. So the seed's specialisms are drawn from the SIX components N6 measured
 * flat, and every captain gets the same number of them.
 *
 * The live upgrade decision walks the FULL eight-component ladder: once a captain
 * is spending their own money, a hull or a drive is a purchase like any other and
 * refusing to sell them one would be the exemption this step exists to remove.
 */
const NPC_SEED_RAMP_EXCLUDED: readonly ShipComponentId[] = ['hull', 'drives'];

/**
 * N2 · The seeded strength of one component for one captain.
 *
 * `base` is what the PLAYER starts that component at (`state.ts` `starterShip`):
 * 1 for the junker-range four, 10 for the bought-range four. A captain adds
 * `2 × tier` to it if and only if the component is one of their top
 * {@link NPC_SPECIALISM_COUNT} appetites among the rampable six. Condition stays 9
 * for every component, exactly as before — condition is damage, and nothing has
 * damaged them yet.
 */
function npcComponentStrength(
  component: ShipComponentId,
  base: number,
  profile: Pick<NpcProfile, 'tier' | 'stats'>,
  ladder: readonly ShipComponentId[],
): number {
  const specialisms = ladder
    .filter((id) => !NPC_SEED_RAMP_EXCLUDED.includes(id))
    .slice(0, NPC_SPECIALISM_COUNT);
  if (!specialisms.includes(component)) return base;
  return base + NPC_SPECIALISM_STRENGTH_PER_TIER * profile.tier;
}

/**
 * N1 · The day-1 seed: the profile → the {@link ShipState} that captain owns.
 * N2 · Was `npcShipForTier(tier)`. It takes the whole character sheet now,
 * because tier alone cannot produce a field with more than one shape in it.
 *
 * CALLED BY `state.ts` `createInitialState` (world creation) and by the v9→v10
 * save migration in `save.ts`, which is the same mapping applied retroactively —
 * they must never drift, which is why there is one function.
 *
 * WHAT N1 SEEDED AND WHY N2 CHANGED IT. N1's contract was to reproduce the
 * phantom exactly, so it seeded `weapons` / `shields` / `cabin` / `navigation` /
 * `lifeSupport` / `robotics` at the player's junker values for every captain at
 * every tier — an honest choice under that contract ("an invented combat fit would
 * be an unmeasured balance change smuggled in ahead of the step that measures
 * it"). N6 then measured the cost of it: **six of the Honor List's eight titles
 * were uncontestable by construction and the day-120 NPC rows were byte-identical
 * to day 1.** N2 is the step that owns measuring the change, so the ramp lands
 * here. `weapons` and `shields` still have no live reader until N3
 * (`weaponVolleyDamage` / `shieldMitigation`); `navigation` is the one that is
 * live immediately, through `navFuelFactor` → `jumpFuelCost`, and that is what
 * this arm's sweep is measuring.
 *
 * FIELD BY FIELD:
 *   - `cargoPods` / `drives` — the T-106 ramps, unchanged.
 *   - `hull` — {@link npcHullStrength}; see there for the calibration.
 *   - the other six — the player's starting strengths, plus this captain's
 *     specialism ramp ({@link npcComponentStrength}). A captain with no stat above
 *     0 is issued exactly the junker fit N1 issued everyone.
 *   - `condition: 9` throughout — the literal the pre-N1 `rollContract` call sites
 *     passed. Condition is damage; nothing has damaged them yet.
 *   - every special-equipment flag false — the phantom had none, and the yard
 *     gates all of them behind Renown, which no NPC holds.
 *
 * NO SAVE-VERSION BUMP, AND THE DECISION IS DELIBERATE (ENGINEERING-POLICY
 * constraint 3; the question N2 is required to answer out loud).
 *
 *   - **No shape changed.** `NpcState` and `ShipState` are byte-identical types
 *     across N2; only the VALUES this function returns moved. There is no key to
 *     backfill, so `MIGRATIONS` has nothing to do and `validateGameState` accepts
 *     every existing v10 save unaltered.
 *   - **Existing v10 rosters are NOT re-seeded, and must not be.** The v7→v8
 *     precedent (save.ts) says a migration is owed when the RULE behind a
 *     persisted DERIVED value moves. `npc.ship` is precisely NOT derived — N1's
 *     restated deliverable is that a captain's capability became "mutable state
 *     the captain owns instead of a constant recomputed from their profile", and
 *     N2 is what makes it move. A migration that re-seeded the roster could not
 *     tell a ship that was ISSUED the old way from one the captain BOUGHT, so it
 *     would confiscate purchases. A pre-N2 save's captain simply reads, correctly,
 *     as someone who already owned a bigger hull.
 *   - **A v9 save DOES get the new ramp**, because `MIGRATIONS[9]` calls
 *     `seedNpcShip` rather than restating a mapping — N1's design, kept. That is
 *     the right answer, not a side effect: a v9 roster never had ships at all, so
 *     there is nothing to preserve and the current rule is the only honest source.
 *     `save.test.ts` asserts exactly what such a save carries across.
 */
export function npcShipForProfile(profile: Pick<NpcProfile, 'tier' | 'stats'>): ShipState {
  const ladder = npcComponentLadder(profile.stats);
  const strength = (component: ShipComponentId, base: number): number =>
    npcComponentStrength(component, base, profile, ladder);
  const hull = { strength: npcHullStrength(profile.tier), condition: 9 };
  // Through the engine's own capacity function — never a restated formula.
  const maxFuel = calculateFuelCapacity(hull.strength, hull.condition);
  return {
    // N2 · CLAMPED, and the clamp now bites: the player-shaped hull holds 300
    // (600 at tier 5) against a 1,000-unit birth tank. Pre-N2 the ramp was chosen
    // so this could never bind — see {@link npcHullStrength} for why that was the
    // exemption this step removes. A captain cannot be born holding more fuel
    // than their hull holds, exactly as `syncMaxFuel` refuses for the player.
    fuel: Math.min(NPC_START_FUEL, maxFuel),
    maxFuel,
    cargoPods: npcCargoPods(profile.tier),
    hull,
    drives: npcDrives(profile.tier),
    weapons: { strength: strength('weapons', 1), condition: 9 },
    shields: { strength: strength('shields', 1), condition: 9 },
    navigation: { strength: strength('navigation', 10), condition: 9 },
    lifeSupport: { strength: strength('lifeSupport', 10), condition: 9 },
    robotics: { strength: strength('robotics', 10), condition: 9 },
    cabin: { strength: strength('cabin', 1), condition: 9 },
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
 * N2 · The captain a save names but the cast no longer contains — a hand-edited
 * or corrupted `profileId`. The weakest tier with a flat stat block, which walks
 * out of {@link npcShipForProfile} as exactly the player's junker fit: no
 * specialism, no ramp, nothing invented. Pre-N2 this case was a bare `?? 1` on the
 * tier; it needs a whole sheet now, and a sheet of zeroes is the honest answer to
 * "we do not know who this is".
 */
const UNKNOWN_CAPTAIN: Pick<NpcProfile, 'tier' | 'stats'> = {
  tier: 1,
  stats: { PILOT: 0, GUNS: 0, TRADE: 0, GRIT: 0, GUILE: 0 },
};

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
 * An unknown `profileId` resolves to {@link UNKNOWN_CAPTAIN} rather than throwing:
 * a migration must never be the thing that throws (save.ts registry header).
 */
export function seedNpcShip(profileId: string, carriedFuel: unknown): ShipState {
  const profile = NPC_PROFILES.find((p) => p.id === profileId);
  const ship = npcShipForProfile(profile ?? UNKNOWN_CAPTAIN);
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

/**
 * N2 · THE UPGRADE DECISION — *"if the NPC never upgrades their ship, they never
 * increase their trade profit"* (owner, and the reason this whole track exists).
 *
 * PRICED AND APPLIED THROUGH THE ENGINE'S OWN YARD, with no arithmetic of its
 * own. `quoteShipyard` decides whether the purchase is legal and what it costs;
 * `applyShipyardMutation` performs it; `componentTierForStrength` says which rung
 * is next; `maxCargoPodsForShip` says whether the hold has room. There is no
 * parallel cost model here, which is the standing constraint stated as code — and
 * R2c is why it matters: the sim's private copy of this yard's maths had inherited
 * the engine's own trade-in bug and therefore agreed with the engine *for the
 * wrong reason*, hiding a live economy defect for months. `NpcState` satisfies
 * `ShipyardActor` structurally, so the captain IS the argument; there is no NPC
 * adapter to drift.
 *
 * WHAT IT BUYS. The captain walks their own {@link npcComponentLadder} — the same
 * ladder their seeded fit was cut from — and takes the next rung of the first
 * component they can afford. Two captains with the same purse therefore buy
 * different ships, which is what makes this a decision rather than an escalator.
 *
 * CARGO PODS RIDE THE HULL RUNG, AND NOTHING ELSE, and that placement is the one
 * judgement in this function — recorded because the first version got it wrong and
 * the measurement said so. Pods are the direct trade-profit lever (`rollContract`
 * prices a manifest off serviceable pods) and at 10cr the cheapest capability in
 * the game, so a version that filled every captain's hold FIRST, before their
 * ladder, was measured over 10 seeds × 120 days to drive 20 of 31 captains onto an
 * IDENTICAL maxed fit and one purse to 1.49M credits — the step's own Disproves
 * clause, "every NPC converges on the same fit (the decision is not a decision)",
 * fired on a rule this function had imposed on every captain rather than on
 * anything the captains chose. Capacity is the HULL's capability: `cargoPods` is
 * bounded by `maxCargoPodsForShip` and pods above that ceiling are unbuyable,
 * while ceiling without pods is unused. So they are one purchase, taken when this
 * captain's own appetite reaches the hull, and a captain who never invests in
 * their hull never becomes a hauler. That is a decision with a real cost.
 *
 * WHAT IT COSTS THE CAPTAIN'S DAY: nothing extra, and that is the parity
 * argument rather than a favour. A player buys at the yard with ONE die out of
 * five and still runs their two-leg trade plan — N9's `planCaptainOverhead`
 * queues die-costed purchases last for precisely that reason, "so income actions
 * are never displaced". An NPC's single coarse action stands in for a whole day,
 * so a captain who hauled cargo can also have stopped at the yard. What throttles
 * it is money, not time: ONE purchase per day, and never below the reserve.
 *
 * IT CONSUMES NO RNG, deliberately. Every branch is a comparison against state, so
 * on any day a captain buys nothing the shared stream is byte-identical to the arm
 * without this function — which is what makes the four N2 sweep arms attributable
 * to their own knob instead of to stream drift.
 *
 * READERS OF WHAT IT WRITES: `ui/format.ts` `honorList` (the 31-way board, whose
 * six frozen titles this is what unfreezes), `contractSpecFromShip` (pods and hull
 * price the captain's next manifest), `npcJumpFuelCost` (drives and navigation
 * price their next jump), and the wire line below.
 *
 * COST, MEASURED. Up to eight `quoteShipyard` calls per captain per day (the
 * ladder is walked until something is affordable) puts the ambient game day at
 * 0.658 → **0.892 ms** over 300 days × 30 captains, and the 1,000-seed capstone at
 * 1m50s → 2m25s. That is ~0.23 ms against the ~39 ms of headroom N0 bought, and
 * `quoteShipyard`'s throwaway is now one SHIP rather than one `GameState`, which
 * is what keeps it in that range.
 */
function considerRefit(npc: NpcState, profile: NpcProfile, day: number, events: GameEvent[]): void {
  const spendable = npc.credits - NPC_YARD_RESERVE;
  if (spendable <= 0) return;

  const buy = (action: Extract<PlayerAction, { type: 'Shipyard' }>, what: string): boolean => {
    const quote = quoteShipyard(npc, action);
    if (!quote.ok || quote.cost > spendable) return false;
    applyShipyardMutation(npc, action);
    // The player's chokepoint, applied to the captain: `day.ts` runs `syncMaxFuel`
    // once at the end of every player action so a hull purchase reaches the tank.
    // Without it a captain could buy a bigger hull and still fly on the old tank.
    syncMaxFuel(npc.ship);
    events.push({
      type: 'WireEntry',
      day,
      kind: 'npc',
      message: `${npc.name} put the ${profile.shipName} in at ${systemName(npc.currentSystemId)} for ${what}.`,
    });
    return true;
  };

  for (const component of npcComponentLadder(profile.stats)) {
    const tier = componentTierForStrength(npc.ship[component].strength) + 1;
    if (tier > MAX_YARD_TIER) continue;
    const action: Extract<PlayerAction, { type: 'Shipyard' }> = {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component,
      tier,
      spendDie: 0,
    };
    if (!buy(action, `a tier-${tier} ${componentDisplayName(component)} refit`)) continue;
    // The hull rung carries the hold with it — see the header. Priced through the
    // yard like everything else, and sized against what the JUST-BOUGHT hull
    // licenses, so a captain never buys a pod the ceiling would refuse.
    if (component === 'hull') fillHold(npc, profile, day, events);
    return;
  }
}

/** Buy as many cargo pods as the captain's new hull licenses and their purse (less
 *  {@link NPC_YARD_RESERVE}) covers. Called only from the hull rung of
 *  {@link considerRefit}; the quote is still what authorises and charges it. */
function fillHold(npc: NpcState, profile: NpcProfile, day: number, events: GameEvent[]): void {
  const room = maxCargoPodsForShip(npc.ship) - npc.ship.cargoPods;
  const spendable = npc.credits - NPC_YARD_RESERVE;
  const quantity = Math.min(room, Math.floor(spendable / CARGO_POD_PRICE));
  if (quantity <= 0) return;
  const action: Extract<PlayerAction, { type: 'Shipyard' }> = {
    type: 'Shipyard',
    action: 'buy-cargo-pods',
    quantity,
    spendDie: 0,
  };
  const quote = quoteShipyard(npc, action);
  if (!quote.ok || quote.cost > spendable) return;
  applyShipyardMutation(npc, action);
  events.push({
    type: 'WireEntry',
    day,
    kind: 'npc',
    message: `${npc.name} racked ${quantity} more cargo pod${quantity === 1 ? '' : 's'} onto the ${profile.shipName} at ${systemName(npc.currentSystemId)}.`,
  });
}

/** The yard's own pod price (`shipyardCost`'s `quantity * 10`), named here only so
 *  the affordability arithmetic above can size a purchase before quoting it. The
 *  QUOTE is still what authorises and charges it — this never decides a cost. */
const CARGO_POD_PRICE = 10;

/** The top of `YARD_COMPONENT_TIER_PRICES`, and the bound `validateTierPurchase`
 *  throws above. Read from the price ladder rather than restated so a longer
 *  ladder needs no change here. */
const MAX_YARD_TIER = YARD_COMPONENT_TIER_PRICES.length;

/** Content's authored name for a component, for the wire line. */
function componentDisplayName(component: ShipComponentId): string {
  return SHIP_COMPONENTS.find((entry) => entry.id === component)?.name ?? component;
}

/**
 * N2 · What a captain will not spend at the yard.
 *
 * It is {@link NPC_POVERTY_CREDITS} — the line the cast already lives by, below
 * which `pickIntent` puts a captain under poverty pressure and sends them looking
 * for paying work. Deliberately NOT a new tuning constant: the game already had a
 * number for "this captain has discretionary money", and a second one would be a
 * second definition of the same thing (the E8 precedent, where the player's
 * subsistence floor was set to the cast's existing broke line rather than to a
 * fresh invention). A captain who would be pushed under it by a purchase does not
 * make the purchase.
 */
const NPC_YARD_RESERVE = NPC_POVERTY_CREDITS;

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
  // not need `mutableNpc`. The JSON round trip STAYS, against the instinct to
  // match `mutableNpc`'s `structuredClone` on the same type: N1 grew this record
  // ~10x (it owns a ship with eight nested component objects), and on the fatter
  // record structuredClone is the slower of the two. Re-measured 2026-07-29
  // (OI-1) over 10 seeds x 120 days of ambient NPC days, three alternated runs
  // per side on node 24: 0.355 ms/game-day for the JSON round trip against 0.399
  // for structuredClone — ~12% more, and the two spreads do not overlap. Same
  // depth of copy either way, so the cheaper one keeps the line.
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

  // 4. N2 · THE YARD. Last, on the day's closing balance, so a captain spends
  //    what the day actually earned rather than what they started it with — and
  //    so the verb⟺StatCheck invariant above is untouched (this rolls nothing and,
  //    deliberately, consumes no rng). `lastAction` stays the day's VERB: the refit
  //    is a purchase made alongside the day's work, not instead of it, exactly as a
  //    player's yard die rides beside their trade plan.
  considerRefit(updatedNpc, profile, ctx.day, events);

  updatedNpc.lastAction = action;

  events.push({
    type: 'NpcAction',
    npcId: updatedNpc.id,
    actionDetails: action.details,
  });

  return { npc: updatedNpc, events, claimedContractIndex };
}
