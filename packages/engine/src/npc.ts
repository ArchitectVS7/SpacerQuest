import {
  ARCHETYPE_INTENT_MULTIPLIERS,
  CARGO_TYPES,
  DEFAULT_IDEAL_WEIGHTS,
  FLAWS,
  IDEAL_WEIGHTS,
  INTENT_STAT_AFFINITY,
  NEUTRAL_INTENT_MULTIPLIERS,
  NPC_CHECK_DCS,
  NPC_INTENT_TYPES,
  NPC_COMPONENT_STAT_AFFINITY,
  NPC_PATROL_FAIL_CREDITS,
  NPC_PATROL_SUCCESS_CREDITS,
  ALL_NPC_PROFILES,
  NPC_SOCIALIZE_LOSS_CREDITS,
  NPC_SOCIALIZE_WIN_CREDITS,
  NPC_TRAVEL_FAIL_EXTRA_FUEL,
  NpcArchetype,
  NpcIntentType,
  NpcProfile,
  STAR_SYSTEMS,
  SYSTEM_DANGER_LEVELS,
  SHIP_COMPONENTS,
  SPECIAL_EQUIPMENT,
  Stat,
  StatBlock,
  YARD_COMPONENT_TIER_PRICES,
  distance as systemDistance,
  EraId,
  // N3 · the interdiction's numbers, all of them the player's own
  CLOAK_ENCOUNTER_MULTIPLIER,
  COMBAT_SALVAGE_PER_TIER,
  FIGHT_FUEL_COST,
  NPC_ENCOUNTER_MAX_ROUNDS,
  RETREAT_KILL_EDGE,
  RUN_FUEL_COST,
  TOUR_ONE_ENCOUNTER_MULTIPLIER,
} from '@spacerquest/content';
import {
  CargoContract,
  CheckResult,
  Edition,
  EncounterInterceptorState,
  EraEventState,
  GameEvent,
  GameState,
  NpcAction,
  NpcState,
  PlayerAction,
  ShipComponentId,
  ShipState,
  SpecialEquipmentId,
} from './types.js';
import { SeededRng } from './rng.js';
import { check } from './dice.js';
import { weaponVolleyDamage } from './components.js';
// N3 · The interdiction reaches the engine's own encounter machinery. `travel.ts`
// does NOT import this file, so this direction closes no cycle (unlike
// `actions/combat.ts`, which imports `applyDisposition` from here — the reason the
// shared damage rule lives in the neutral `combatRules.ts`).
import { routeDangerFor, selectAnonymousInterceptor } from './actions/travel.js';
import {
  applyInterceptorHit,
  interceptorPressureDc,
  interceptorRefusesTribute,
  tributeForRound,
} from './combatRules.js';
import {
  DriveBlock,
  calculateFuelCapacity,
  generateManifestBoard,
  jobPoolDepth,
  jumpFuelCost,
  localFuelPrice,
  syncMaxFuel,
} from './economy.js';
import { navFuelFactor } from './components.js';
// N11 · The captain's deeds accrue through the PLAYER's own deed machinery — one
// matcher, one count ladder, one `rankForDeedCount`. `deeds.ts` does not import
// this file, so this direction closes no cycle.
import { accrueDeeds } from './deeds.js';
import { demoLocked } from './demo.js';
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
  const profile = ALL_NPC_PROFILES.find((p) => p.id === profileId);
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
/** Poverty pressure: below this a captain leans on paying work. (Pre-N4 this
 *  scaled a Trade WEIGHT; N4's deterministic `pickIntent` reduced it to a
 *  probability gate, and the reopened N4 blend makes it a weight again — owner
 *  RULING 1, docs/NPC_REDESIGN.md: *"the poverty override stays"*.) */
const NPC_POVERTY_CREDITS = 1000;
/**
 * How much harder a broke captain leans on Trade — a MULTIPLIER on their own
 * Trade weight, deliberately not the flat `+10` this was before N4.
 *
 * The flat term cannot come back, for two independent reasons. **It breaks the
 * veto:** an Ideal's `0` means "this captain does not do that", and `0 + 10` hands
 * the Warden (`Justice`, Trade 0) the one verb their worldview forbids the moment
 * their purse dips — a rule exemption bought with a constant, which is exactly
 * what the standing constraint's consequence 2 names. **And its scale was wrong
 * by an order of magnitude:** pre-N4 weights carried the `x (1 + stat)` term and
 * ran to ~70, so `+10` was a nudge; the blend's weights top out near 12, where
 * `+10` would be a near-deterministic order to trade.
 *
 * 3x is chosen to land a broke fighter near the pre-N4 behaviour it replaces
 * (Iron Vex at ~15% Trade against pre-N4's ~22%) while leaving a broke trader
 * effectively committed (Cargo King ~90%). It is a pacing constant, so it is a
 * legitimate knob for a later sweep — but it must stay a multiplier.
 */
const NPC_POVERTY_TRADE_MULTIPLIER = 3;
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
  /**
   * N10 · The shared per-system job pool (`MarketState.jobPoolClaims`), READ-ONLY
   * here: it sizes the local board a captain trading AWAY from the player draws
   * from, so a port the cast has been working supplies fewer jobs to the next
   * captain through it exactly as it will to the player.
   *
   * The WRITE goes back through {@link NpcDayResult.claimedFromPool} rather than
   * happening here, the same division of labour `claimedContractIndex` already
   * uses: `day.ts` owns the market record, an NPC turn owns its own captain.
   */
  jobPoolClaims: Readonly<Record<string, number>>;
  /** The active world economic event (T-107). NPCs feel the same re-priced
   *  economy as the player: synthesized contract income and depot refuel costs
   *  read the same modifiers. Null when no event is active. */
  eraEvent: EraEventState | null;
  /** N3 · The campaign era, for the interdiction rate. Tour One is gentler on the
   *  cast for the same reason it is gentler on the player — the lane multiplier
   *  `TOUR_ONE_ENCOUNTER_MULTIPLIER` is a property of the ERA, not of who is
   *  flying, so exempting the cast from it would be an exemption in the other
   *  direction. Read by {@link resolveNpcEncounter}. */
  era: EraId;
  /**
   * N11 · The career's licence, for the CONQUEROR ceiling on a captain's deed
   * accrual. The mirror of the `era` field directly above, and the same argument: a
   * demo licence belongs to the WORLD, not to who is flying it, so a captain meets
   * the same capstone lock the player does — asked through the one `demoLocked`
   * predicate (`demo.ts`), never re-implemented here. The reverted attempt exempted
   * the cast from this cap in a code comment; that exemption is not re-granted.
   */
  edition: Edition;
}

export interface NpcDayResult {
  npc: NpcState;
  events: GameEvent[];
  /** Index into ctx.claimableBoard of the offer this NPC took (T-106 contract
   *  competition). Only set when the NPC actually executed the haul. */
  claimedContractIndex?: number;
  /**
   * N10 · The system whose shared job pool this captain claimed out of, when the
   * claim did NOT come off the player's live board — i.e. the ordinary case,
   * anywhere in the galaxy. The caller debits it (`debitJobPool`), which is what
   * makes the next board the player sees in that system thinner.
   *
   * MUTUALLY EXCLUSIVE with `claimedContractIndex` by construction: a claim is
   * either the visible snipe off the player's board or a draw against the local
   * pool, never both. Both are absent when the haul did not happen at all.
   */
  claimedFromPool?: number;
}

function systemName(systemId: number): string {
  return STAR_SYSTEMS[systemId]?.name ?? `system ${systemId}`;
}

/**
 * N4 · Which verb a captain wants today: their Ideal, BIASED by their archetype,
 * drawn as a distribution. Returns 'Idle' only in the all-weights-zero corner.
 *
 * `weight = IDEAL_WEIGHTS[ideal] x ARCHETYPE_INTENT_MULTIPLIERS[archetype]`, and
 * the multiplicative shape is the owner's ruling (docs/NPC_REDESIGN.md N4 RULING
 * 1), not a convenience. Three properties come out of it and all three are
 * load-bearing:
 *
 *   1. **Two captains of the same archetype stay different people.** Cargo King
 *      (Wealth) draws Trade ~75% / Travel ~13%; Zero Risk (Survival) draws Trade
 *      ~62% / Patrol ~15%. Both are traders. Over the curated roster the average
 *      captain has 4.3 verbs at 5% or better.
 *   2. **An Ideal's authored `0` is a VETO and survives the multiply** — 0 x 2 is
 *      still 0, so the Stellar Monk's `Balance` never initiates combat no matter
 *      what archetype sits on top of it, and the Warden's `Justice` never haggles.
 *      A multiplier can re-weight a worldview; it cannot overrule one.
 *   3. **The archetype effect is SEPARABLE**, so N4 could be graded: an arm with
 *      every multiplier set to {@link NEUTRAL_INTENT_MULTIPLIERS} is a real
 *      control, and *"archetype makes no measurable difference"* is therefore
 *      distinguishable from *"archetype is the only input left"*.
 *
 * WHAT THIS REPLACED, so it is not re-derived: N4 first shipped a deterministic
 * `switch` returning one fixed verb per archetype. Ten trader captains became
 * literally the same function (`return 'Trade'`, every day, forever) — further
 * from this step's own hypothesis than the weight table it replaced, and it
 * destroyed the control arm that makes the step gradeable at all.
 *
 * NOT IN THE PRODUCT: the pre-N4 `x (1 + affinity stat)` term. It concentrated
 * the average captain onto 3.1 verbs (a TRADE-5 trader onto ONE), which is the
 * same collapse by a subtler route — the measurement is recorded at
 * ARCHETYPE_INTENT_MULTIPLIERS. {@link INTENT_STAT_AFFINITY} still decides which
 * stat ROLLS the day's check ({@link rollNpcCheck}); a captain's stats therefore
 * shape how WELL the day goes rather than how often they choose it.
 */
export function pickIntent(
  profile: NpcProfile,
  credits: number,
  rng: SeededRng,
): NpcIntentType | 'Idle' {
  const base = IDEAL_WEIGHTS[profile.ideal] ?? DEFAULT_IDEAL_WEIGHTS;
  const archetype = ARCHETYPE_INTENT_MULTIPLIERS[profile.archetype] ?? NEUTRAL_INTENT_MULTIPLIERS;
  const weighted = NPC_INTENT_TYPES.map((intent) => {
    let weight = base[intent] * archetype[intent];
    // Poverty pressure is a WEIGHT, not a branch: a broke captain leans harder on
    // paying work without being ordered to take it, so the poorest fighter still
    // sometimes fights and a Justice idealist — whose Trade weight is an authored
    // 0 — is not handed the one verb their worldview forbids. (The N4 switch made
    // this a 50% early return, which did exactly that.)
    if (intent === 'Trade' && credits < NPC_POVERTY_CREDITS) {
      weight *= NPC_POVERTY_TRADE_MULTIPLIER;
    }
    return { intent, weight };
  });

  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    // Invariant: a weight of 0 DISABLES a verb (ideals.ts contract), so a
    // captain whose every verb is zeroed must resolve to a no-op day — never to
    // a verb the table forbade. Unreachable with the current tables (every Ideal
    // has a positive weight and no multiplier is 0), but future content must not
    // break it, which is why the branch exists and is tested.
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
 * ── N11/T-021 · RANK-GATED SPECIAL EQUIPMENT, AND WHY IT IS THE FIRST RUNG ────
 *
 * WHY RANK-GATED ONLY, AS A DATA FILTER AND NOT A LIST. The captain asks the yard
 * for every `SPECIAL_EQUIPMENT` entry that declares a `requiredRenownRank`, read
 * off content — so a newly gated item joins the cast's appetite for free and an
 * ungated one never does, and there is no NPC-side id list to drift from the table.
 * The scope is N11's: make the Renown gate REACHABLE. The four ungated items
 * (CLOAKER, AUTO_REPAIR, TITANIUM_HULL, TRANS_WARP) are a separate appetite
 * question, deliberately deferred — TITANIUM_HULL alone adds +50 pods, which would
 * put a non-Renown economy swing inside the very arm T-023 has to attribute to the
 * Renown gate. The player-side precedent is the same shape: `planSpecialEquipment`
 * (`sim/src/index.ts`) also drives a rank-gated priority list, cheapest gate first,
 * with the fighter's AUTO_REPAIR the documented exception (priced, not gated).
 *
 * NO RANK COMPARISON HAPPENS HERE, and that is the standing constraint as code.
 * The captain merely ASKS; `quoteShipyard` → `specialEquipmentFailure`'s
 * `requiredRank` check (`actions/shipyard.ts`) is the ONE AND ONLY gate, so
 * `renownRankIndex` / `RENOWN_DEED_THRESHOLDS` appear nowhere in this file. Nor is
 * anything pre-filtered by id: ALREADY_INSTALLED (so the repeat purchase is
 * impossible without NPC bookkeeping), ASTRAXIAL_HULL's drives-25 prerequisite and
 * INSUFFICIENT_CREDITS are all the yard's own refusals. Let the quote say no.
 *
 * WHY IT IS CONSIDERED BEFORE THE COMPONENT LADDER — the one judgement in this
 * change, recorded because it decides whether the gate is exercised at all. The
 * captain gets ONE purchase a day and the component loop takes the first AFFORDABLE
 * rung, so an equipment rung placed after it would fire only once all eight
 * components were maxed or unaffordable — i.e. effectively never, and N11 would ship
 * a mechanism nothing exercises (the R0a/R2a class of mistake this track keeps
 * paying for). Placed first, the throttle is the two lines that ALREADY exist:
 * EARNED rank (5 deeds for CAPTAIN, accrued at step 5 of the captain's day) and
 * {@link NPC_YARD_RESERVE} (so ~11,000cr in hand for a 10,000cr item). It displaces
 * at most one component rung per gated item per career, because the yard refuses
 * the repeat.
 *
 * WHAT THE PURCHASE DOES FOR THE CAPTAIN, so it is not mistaken for cosmetics:
 * `weaponVolleyDamage` reads `hasStarBuster` and `shieldMitigation` /
 * `applyInterceptorHit` read `hasArchAngel` (`components.ts`, `combatRules.ts`) —
 * both called by N3's interdiction — so a captain who clears the gate genuinely
 * fights and survives better, which feeds back into `first_combat_win`. This is
 * N11's "the player's progression spine is CONTESTED, not copied" becoming real.
 *
 * WATCH ITEM HANDED TO T-023, named rather than hidden: every captain who reaches
 * CAPTAIN with ~11,000cr eventually owns BOTH CAPTAIN-gated items, so the equipment
 * axis converges even though the component fit does not; ASTRAXIAL_HULL stays
 * unreachable at T-020's measured 13-deed / ADMIRAL ceiling. If T-023 grades that as
 * renown inflation or convergence, the next lever is an ARCHETYPE-SHAPED APPETITE (a
 * content mapping, an owner call and its own capstone) — never a tuning constant
 * here. NO NEW PACING CONSTANT was added: the discretionary-money line is
 * {@link NPC_YARD_RESERVE}, for the reason argued at its own definition site (the E8
 * precedent — the game already had a number for "this captain has spare money").
 *
 * OUT OF SCOPE AND STILL OPEN: OI-9, the NPC refit spends no die. `spendDie: 0` on
 * the equipment action is the component rung's existing convention, not a claim that
 * the die question is settled.
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
 * COST, RE-MEASURED AT T-021 (the earlier note claimed eight calls and 0.892 ms; both
 * are superseded, and a stale measurement in a comment is worse than none). Up to
 * ELEVEN `quoteShipyard` calls per captain per day — three gated-equipment asks plus
 * the eight-rung ladder, each walked only until something is affordable. Ambient day
 * over 300 days × the shipped 41-record roster, seven samples, best-of: **0.87 ms with
 * the equipment rung against 0.88 ms without it** (medians 0.90 / 0.90) — i.e. the
 * three added asks are inside run-to-run noise, and that is structural rather than
 * lucky: a REFUSED quote never reaches `structuredClone`, and the common case for a
 * gated item is a refusal (unearned rank, then ALREADY_INSTALLED forever after). The
 * N2 measurement it replaces (0.658 → 0.892 ms at 30 captains) still describes what
 * introducing the refit cost; nothing since has moved it.
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

  // N11/T-021 · THE RANK-GATED RUNG, FIRST. See the header for why it leads and why
  // the filter is `requiredRenownRank !== undefined` read off content rather than an
  // NPC-side id list. Content order is already cheapest-gate-first (STAR_BUSTER and
  // ARCH_ANGEL at CAPTAIN, then ASTRAXIAL_HULL at TOP_DOG), which is the player's own
  // ordering, so re-sorting here would be a second ladder.
  for (const entry of SPECIAL_EQUIPMENT) {
    if (entry.requiredRenownRank === undefined) continue;
    const action: Extract<PlayerAction, { type: 'Shipyard' }> = {
      type: 'Shipyard',
      action: 'buy-special-equipment',
      // `SPECIAL_EQUIPMENT` is widened to its declared interface (`id: string`) while
      // the action takes the engine's narrower `SpecialEquipmentId` union, so this cast
      // is the one place the content table and the union are assumed to agree. It is
      // ASSERTED rather than assumed, and the failure mode is worth naming:
      // `installSpecialEquipment`'s final `else` fits a Trans-Warp, so an unmodelled
      // content id would quietly install the WRONG item. The N11 block in
      // `shipyard.test.ts` drives every gated content row through the real quote and
      // reads the fit back through `hasSpecialEquipment`, so such a row reddens there
      // instead of reaching a captain's ship.
      equipment: entry.id as SpecialEquipmentId,
      spendDie: 0,
    };
    // "for the Arch Angel", definite article on purpose: content names start with
    // both vowels and consonants, and "a Arch Angel" on a player-facing wire line is
    // the price of an indefinite article the engine would have to inflect.
    if (buy(action, `the ${entry.name}`)) return;
  }

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

/**
 * N3 · A CAPTAIN MEETS A PIRATE, AND ANSWERS IT — resolved inside the dusk tick.
 *
 * Called from every NPC jump ({@link executeTravel} and {@link executeTrade}), which
 * is what makes the cast carry the same lane risk the player does. Returns `true`
 * when the captain lost their ship, so the caller can stop resolving their day.
 *
 * ── WHAT IS SHARED, AND WHY THAT IS THE WHOLE POINT ──────────────────────────
 * Every rule below is the engine's own, reached through the engine's own function:
 *   · the lane's danger and interception chance — `routeDangerFor`, including the
 *     loaded-run bump, so a captain hauling INTO a port is in more danger too
 *   · the interceptor and its tier band — `selectAnonymousInterceptor`
 *   · every roll — the shared `check()`
 *   · the fight DC — `10 + interceptor.tier`, the player's number
 *   · the volley — `weaponVolleyDamage(ship)`
 *   · the tribute schedule — `tributeForRound`, class and tier-gap modifiers and all
 *   · the flaw refusal — `interceptorRefusesTribute`, so a Bloodthirsty pirate slams
 *     the tribute door on a captain exactly as it does on the player
 *   · the incoming damage — `applyInterceptorHit` (`combatRules.ts`), margin, tier
 *     gap, shield mitigation and the hull-to-0 kill, one definition for both sides
 *   · the fuel prices — RUN_FUEL_COST / FIGHT_FUEL_COST
 *   · the post-kill escape — the opposed PILOT roll with RETREAT_KILL_EDGE
 *
 * ── THE ONE SANCTIONED ABSTRACTION, NAMED AT ITS DEFINITION SITE ─────────────
 * OWNER RULING (2026-07-29): this does NOT call `resolveCombat`. It cannot — that
 * function spends a die from `player.dawnHand`, and the cast holds no hand until
 * N13 builds them a decision surface. So the fight runs here, on the primitives
 * above, and gives up EXACTLY ONE THING: **die CHOICE**. A player picks which of
 * five visible dice to spend, which is the game's central decision; a captain in the
 * coarse one-verb day has no hand to pick from, so its die is `rng.d20()`.
 *
 * That is a real gap and it is not to be described as parity. **N13 is the step
 * that closes it** — when the cast holds a hand, the stance picker below reads it
 * instead of drawing raw, and this note comes out. Until then the PARITY LEDGER
 * says "shared primitives, one-tick", never "full parity via resolveCombat"; the
 * 2026-07-29 audit found that exact false claim in this document and it is not to
 * be re-introduced.
 *
 * The second, smaller abstraction: the encounter resolves in ONE tick rather than
 * spanning days on a fresh hand. `NPC_ENCOUNTER_MAX_ROUNDS` bounds it, and a captain
 * still on the field at the cap breaks off unharmed.
 */
function resolveNpcEncounter(
  npc: NpcState,
  profile: NpcProfile,
  origin: number,
  destination: number,
  /** The contract destination when this jump is a delivery — raises the lane a
   *  danger level, the same rule the player's loaded run obeys. */
  haulingTo: number | undefined,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
  /** N11 · The captain's LOCAL deed-source batch. See {@link resolveNpcDay} for why
   *  it is separate from `events`: anything pushed into `events` reaches the shared
   *  day array (`day.ts`) and would earn the PLAYER the deed. */
  deedSource: GameEvent[],
): boolean {
  const danger = routeDangerFor(origin, destination, ctx.eraEvent, haulingTo);
  // The multiplier chain, in the player's order. Two of the player's four terms
  // have NO NPC ANALOGUE and are absent rather than zeroed: a defaulted Penny Wise
  // loan and a Guild debt flag are player-only mechanics, so there is nothing to
  // read. That is an absent INPUT, not a threshold tuned so a rule will not bite —
  // the distinction the standing constraint's consequence 2 turns on.
  let chance =
    ctx.era === 'TOUR_ONE'
      ? danger.routeDangerChance * TOUR_ONE_ENCOUNTER_MULTIPLIER
      : danger.routeDangerChance;
  if (npc.ship.hasCloaker) chance *= CLOAK_ENCOUNTER_MULTIPLIER;

  if (rng.next() >= chance) return false;

  const interceptor = selectAnonymousInterceptor(
    profile.tier,
    origin,
    destination,
    danger.routeDangerLevel,
    rng,
  );
  if (!interceptor) return false;

  const stances: ('talk' | 'run' | 'fight')[] = [];
  let creditsPaid = 0;
  let enemyHull = Math.max(1, interceptor.tier);
  let resolution: 'talked-down' | 'escaped' | 'defeated' | 'destroyed' | 'survived' = 'survived';
  let round = 1;

  for (; round <= NPC_ENCOUNTER_MAX_ROUNDS; round += 1) {
    const stance = pickNpcStance(npc, profile, interceptor, round, rng);
    stances.push(stance);

    if (stance === 'talk') {
      const demand = tributeForRound(
        round,
        interceptor.kind,
        Math.max(0, interceptor.tier - profile.tier),
      );
      // The interceptor's flaw can slam the door — the player's rule, unchanged.
      const refused = interceptorRefusesTribute(interceptor, rng, events);
      const result = rollEncounterCheck(
        npc,
        profile,
        Stat.TRADE,
        'npc-encounter-talk',
        rng,
        events,
        interceptor,
      );
      if (!refused && result.success && npc.credits >= demand) {
        npc.credits -= demand;
        creditsPaid += demand;
        resolution = 'talked-down';
        break;
      }
    } else if (stance === 'run') {
      npc.ship.fuel = Math.max(0, npc.ship.fuel - RUN_FUEL_COST);
      const result = rollEncounterCheck(
        npc,
        profile,
        Stat.PILOT,
        'npc-encounter-run',
        rng,
        events,
        interceptor,
      );
      if (result.success) {
        resolution = 'escaped';
        break;
      }
    } else {
      npc.ship.fuel = Math.max(0, npc.ship.fuel - FIGHT_FUEL_COST);
      const result = rollEncounterCheck(
        npc,
        profile,
        Stat.GUNS,
        'npc-encounter-fight',
        rng,
        events,
        interceptor,
      );
      if (result.success) {
        enemyHull = Math.max(0, enemyHull - weaponVolleyDamage(npc.ship));
        if (enemyHull <= 0) {
          // The dying interceptor's opposed PILOT retreat — PRD §7.4's miracle
          // burn, available against a captain exactly as against the player.
          const enemyDie = rng.d20();
          const npcDie = rng.d20();
          const npcPin = npcDie + profile.stats[Stat.PILOT] + RETREAT_KILL_EDGE;
          const escaped = check(enemyDie, interceptor.stats[Stat.PILOT], npcPin);
          events.push({
            type: 'StatCheck',
            actor: interceptor.name,
            stat: Stat.PILOT,
            dc: escaped.dc,
            result: escaped,
            actionContext: 'retreat',
          });
          resolution = escaped.success ? 'survived' : 'defeated';
          if (resolution === 'defeated') {
            npc.credits += COMBAT_SALVAGE_PER_TIER * interceptor.tier;
          }
          break;
        }
      }
    }

    // The interceptor answers. Same DC, same damage rule, same killing blow.
    const pressure = check(
      rng.d20(),
      interceptor.stats[Stat.GUNS],
      interceptorPressureDc(profile.stats),
    );
    if (pressure.success) {
      const hit = applyInterceptorHit(npc.ship, profile.tier, interceptor.tier, pressure, rng);
      if (hit.shipLost) {
        resolution = 'destroyed';
        break;
      }
    }
  }

  const rounds = Math.min(round, NPC_ENCOUNTER_MAX_ROUNDS);
  // N11 · THE FIGHT AS A DEED SOURCE — the player's own `EncounterResolved`, in the
  // shape `actions/combat.ts:65` emits it, for the three resolutions that have an
  // EXACT player analogue: `talked-down`, `escaped`, `defeated` (with the same
  // `COMBAT_SALVAGE_PER_TIER x tier` the NpcEncounter record already carries). That
  // is what reaches content `first_combat_win` / `silver_tongue` / `clean_getaway`
  // through the same matcher the player's fight goes through.
  //
  // `survived` and `destroyed` emit NOTHING, deliberately and not as a withholding:
  // `survived` is the round-limit break-off (or an interceptor that won its own
  // retreat roll) and `destroyed` is the captain's death — no content deed matches
  // either resolution today, and inventing a resolution literal so one would is
  // authoring a rule, not accruing against one.
  //
  // The id is a LOCAL correlation id in `travel.ts`'s format. It labels a batch that
  // never enters `state.eventLog`, so it names no persisted encounter — and no deed
  // matcher reads `encounterId` (it is not on `EVENT_PATHS.EncounterResolved`).
  if (resolution === 'talked-down' || resolution === 'escaped' || resolution === 'defeated') {
    deedSource.push({
      type: 'EncounterResolved',
      encounterId: `npc-enc-${ctx.day}-${npc.id}-${origin}-${destination}-${interceptor.id}`,
      resolution,
      round: rounds,
      interceptorId: interceptor.id,
      ...(resolution === 'defeated'
        ? { salvageCredits: COMBAT_SALVAGE_PER_TIER * interceptor.tier }
        : {}),
    });
  }
  events.push({
    type: 'NpcEncounter',
    day: ctx.day,
    npcId: npc.id,
    interceptorId: interceptor.id,
    interceptorName: interceptor.name,
    stances,
    resolution,
    rounds,
    ...(creditsPaid > 0 ? { creditsPaid } : {}),
    ...(resolution === 'defeated'
      ? { salvageCredits: COMBAT_SALVAGE_PER_TIER * interceptor.tier }
      : {}),
  });

  if (resolution === 'destroyed') {
    // PERMANENT. No succession, no replacement, no respawn — the seat empties and
    // stays empty (owner ruling 2026-07-28). The record is MARKED, never deleted,
    // because the wire, the Honor List's history and the player's grudges all still
    // reference it; every "living field" reader skips it instead (see the field's
    // doc comment on `NpcState.dead` for the four that matter).
    npc.dead = true;
    events.push({
      type: 'NpcShipLost',
      day: ctx.day,
      npcId: npc.id,
      npcName: npc.name,
      interceptorId: interceptor.id,
      interceptorName: interceptor.name,
      systemId: destination,
    });
    return true;
  }
  return false;
}

/**
 * N3 · Which corner of the triangle a captain plays this round.
 *
 * The player's three options priced by what a captain can actually afford, then
 * broken by archetype — the same "run, talk, or fight" decision, made without a
 * hand to read (see the abstraction note on {@link resolveNpcEncounter}).
 *
 * The affordability gates come FIRST and they are the honest part: firing costs
 * FIGHT_FUEL_COST and a captain that cannot pay it cannot shoot, exactly as a player
 * with a dry tank cannot. A captain who can afford nothing talks, because tribute is
 * the only corner that costs no fuel.
 */
function pickNpcStance(
  npc: NpcState,
  profile: NpcProfile,
  interceptor: EncounterInterceptorState,
  round: number,
  rng: SeededRng,
): 'talk' | 'run' | 'fight' {
  const canFight = npc.ship.fuel >= FIGHT_FUEL_COST;
  const canRun = npc.ship.fuel >= RUN_FUEL_COST;
  const canPay =
    npc.credits >=
    tributeForRound(round, interceptor.kind, Math.max(0, interceptor.tier - profile.tier));

  // Outgunned by two tiers or more, nobody's archetype makes them brave.
  const outgunned = interceptor.tier - profile.tier >= 2;

  switch (profile.archetype) {
    case 'fighter':
      if (canFight && !outgunned) return 'fight';
      return canRun ? 'run' : 'talk';
    case 'veteran':
      // Fights what it can beat, buys off what it cannot, runs as a last resort.
      if (canFight && interceptor.tier <= profile.tier) return 'fight';
      if (canPay) return 'talk';
      return canRun ? 'run' : 'talk';
    case 'smuggler':
      // Carrying contraband: never stay to chat if the tank can carry you out.
      if (canRun) return 'run';
      return canPay ? 'talk' : canFight ? 'fight' : 'talk';
    case 'trader':
      // A haul is worth more than a fight — pay the toll and keep the cargo.
      if (canPay) return 'talk';
      return canRun ? 'run' : canFight ? 'fight' : 'talk';
    case 'explorer':
      if (canRun) return 'run';
      return canPay ? 'talk' : 'talk';
    case 'gambler':
    default: {
      // Reckless: picks a corner by feel, from what it can afford.
      const options: ('talk' | 'run' | 'fight')[] = ['talk'];
      if (canRun) options.push('run');
      if (canFight && !outgunned) options.push('fight');
      return options[Math.floor(rng.next() * options.length)];
    }
  }
}

/** N3 · One encounter-round roll for a captain, emitted with an interdiction
 *  context so it reaches the wire without inflating the T-1201 verb ⟺ StatCheck
 *  count (see the `actionContext` union in types.ts for why that split matters). */
function rollEncounterCheck(
  npc: NpcState,
  profile: NpcProfile,
  stat: Stat,
  actionContext: 'npc-encounter-talk' | 'npc-encounter-run' | 'npc-encounter-fight',
  rng: SeededRng,
  events: GameEvent[],
  interceptor: EncounterInterceptorState,
): CheckResult {
  const dc = 10 + interceptor.tier;
  const result = check(rng.d20(), profile.stats[stat], dc);
  events.push({ type: 'StatCheck', actor: npc.id, stat, dc, result, actionContext });
  return result;
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

/**
 * N10 · WHICH job a captain takes off a board, by archetype. Exported and pure —
 * the per-archetype strategy is unit-testable in isolation, which is the one
 * thing worth salvaging from the reverted first attempt at this step.
 *
 * Returns an INDEX into `offers`, because both callers need the index and not
 * just the contract: the co-located path hands it to `day.ts` to splice out of
 * the player's live board.
 *
 * THE SHAPE, and why it is a score rather than a filter chain. Each archetype
 * supplies one comparable number per offer; the best-scoring offers are the
 * candidate set and `rng` breaks the tie. Ties are the common case, not the
 * corner: a four-offer core board has one danger level across all of it, so a
 * fighter with nothing to prefer picks uniformly — the honest answer, and the
 * pre-N10 behaviour, rather than a spurious preference invented by an
 * argmax-takes-index-0 rule.
 *
 * WHAT EACH ARCHETYPE IS ACTUALLY SAYING, since a score table reads as arbitrary
 * unless the sentence behind each row is written down:
 *
 *   - `trader` — the biggest cheque. The professional's read, and the one the
 *     wealth table already shows them winning with.
 *   - `veteran` — the biggest cheque PER UNIT OF DISTANCE. Seasoned captains do
 *     not chase gross revenue across the map; they price the fuel.
 *   - `gambler` — payment weighted by the destination's danger. The long-odds
 *     payday: the rim run that pays triple, consequences later.
 *   - `explorer` — the FARTHEST destination. Same instinct as N4's rim-biased
 *     `executeTravel`, and it costs them the same way: `routeDangerFor` prices
 *     the long lane as the dangerous one it is.
 *   - `fighter` — the most dangerous destination. They are not avoiding trouble;
 *     a haul is a reason to be somewhere trouble is.
 *   - `smuggler` — contraband first, then any rim destination. This is N4's
 *     rim-first filter GENERALISED, not replaced: with contraband absent the
 *     candidate set is exactly the rim subset N4 filtered to, so the smuggler's
 *     selection behaviour is deliberately unchanged in shape and their column in
 *     N4's table stays comparable.
 */
export function pickContract(
  archetype: NpcArchetype,
  offers: readonly CargoContract[],
  originSystemId: number,
  rng: SeededRng,
): number {
  // THE ORIGIN IS A PARAMETER, and the reverted attempt is why it is spelled out
  // here: it measured every archetype's distance reasoning as
  // `systemDistance(0, destination)` — from system 0, not from where the captain
  // was standing — and threw `Unknown star system route: 0 -> 11` outright.
  const score = (offer: CargoContract): number => {
    const danger = SYSTEM_DANGER_LEVELS[offer.destination] ?? 1;
    const legDistance = systemDistance(originSystemId, offer.destination);
    switch (archetype) {
      case 'trader':
        return offer.payment;
      case 'veteran':
        return offer.payment / Math.max(1, legDistance);
      case 'gambler':
        return offer.payment * danger;
      case 'explorer':
        return legDistance;
      case 'fighter':
        return danger;
      case 'smuggler':
        // The contraband test is the CONTENT flag, never the id: `cargoType === 10`
        // would be the engine restating a content table (constraint 4), and the
        // same literal has already been factored out of the payment math.
        return CARGO_TYPES[offer.cargoType]?.isContraband
          ? 2
          : STAR_SYSTEMS[offer.destination]?.isRim
            ? 1
            : 0;
    }
  };

  let best = -Infinity;
  const candidates: number[] = [];
  for (let i = 0; i < offers.length; i++) {
    const value = score(offers[i]);
    if (value > best) {
      best = value;
      candidates.length = 0;
      candidates.push(i);
    } else if (value === best) {
      candidates.push(i);
    }
  }

  return candidates[Math.floor(rng.next() * candidates.length)];
}

function executeTrade(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
  /** N11 · The captain's LOCAL deed-source batch — see {@link resolveNpcDay}. */
  deedSource: GameEvent[],
): { action: NpcAction; claimedContractIndex?: number; claimedFromPool?: number } {
  // THE SHARED JOB POOL (T-106, generalised by N10). A captain trading anywhere
  // works the same per-system pool the player's board is drawn from, through the
  // engine's own `generateManifestBoard` at the depth that system's pool can
  // currently supply. Two paths, ONE pool:
  //
  //   - IN THE PLAYER'S SYSTEM, with the dusk's claim unspent, they take a
  //     specific offer off the player's LIVE board — the visible snipe. The
  //     caller splices it and narrates it.
  //   - ANYWHERE ELSE they draw the local board and claim from that, and the
  //     claim debits the same ledger, so the next board the PLAYER sees in that
  //     system is thinner. `claimedFromPool` carries the system id back to the
  //     caller, which owns the market record.
  //
  // WHY THE SECOND PATH IS NOT THE "PRIVATE BOARD" THE REVERTED ATTEMPT SHIPPED.
  // That attempt also called `generateManifestBoard` per captain — at a hardcoded
  // depth of 4, depleting nothing, invisible to the player, which is the parallel
  // cost model the standing constraint forbids. The difference is the coupling in
  // BOTH directions: the depth is read from the shared ledger and the claim is
  // written back to it. Remove either and this becomes that.
  let claimedContractIndex: number | undefined;
  let claimedFromPool: number | undefined;
  let contract: CargoContract;
  if (ctx.claimableBoard && ctx.claimableBoard.length > 0) {
    claimedContractIndex = pickContract(
      profile.archetype,
      ctx.claimableBoard,
      npc.currentSystemId,
      rng,
    );
    contract = ctx.claimableBoard[claimedContractIndex]!;
  } else {
    // N1 · The offers are sized against the ship this captain actually owns,
    // through `generateManifestBoard`'s own `contractSpecFromShip` — the same
    // adapter the player's board uses — instead of a tier-derived phantom spec.
    // N10 · A BOARD, not a single roll: a captain who cannot choose between jobs
    // has no strategy to express, so the archetype selector would have nothing to
    // act on and `pickContract` would be decoration.
    const localBoard = generateManifestBoard(
      npc.currentSystemId,
      rng,
      npc.ship,
      jobPoolDepth(ctx.jobPoolClaims, npc.currentSystemId),
      ctx.eraEvent,
    );
    contract = localBoard[pickContract(profile.archetype, localBoard, npc.currentSystemId, rng)]!;
    claimedFromPool = npc.currentSystemId;
  }

  const routeDistance = systemDistance(npc.currentSystemId, contract.destination);
  const fuelCost = npcJumpFuelCost(npc.ship, routeDistance);
  refuelIfNeeded(npc, fuelCost, ctx.eraEvent);
  if (npc.ship.fuel < fuelCost) {
    // Can't fund the haul: the claim never happens — the offer stays on the
    // player's board AND the system's pool is not debited (neither
    // `claimedContractIndex` nor `claimedFromPool` is returned) — and the day is
    // lost to the docks.
    return { action: brokeIdle(npc, rng, ctx.day, events) };
  }

  // N11 · THE CLAIM IS SIGNED HERE, and this is the earliest honest place for it:
  // the bail directly above is where the code's own comment says "the claim never
  // happens", so past it the manifest IS on this captain's papers. The player's own
  // sign-contract shape (`actions/trade.ts`), which is what reaches content
  // `first_manifest` through the same matcher.
  deedSource.push({
    type: 'TradeEvent',
    characterId: npc.id,
    action: 'sign-contract',
    success: true,
    destination: contract.destination,
    cargoType: contract.cargoType,
    payment: contract.payment,
    actionDetails: `Signed a manifest for ${systemName(contract.destination)}.`,
  });

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
  const origin = npc.currentSystemId;
  npc.currentSystemId = contract.destination;
  const cargoName = CARGO_TYPES[contract.cargoType]?.name ?? `type-${contract.cargoType} cargo`;
  // N3 · The loaded run is the dangerous one, for a captain exactly as for the
  // player: `haulingTo` is the contract destination, which raises the lane a full
  // danger level inside `routeDangerFor`. A captain lost with the cargo aboard is
  // never paid — the delivery did not happen.
  if (
    resolveNpcEncounter(
      npc,
      profile,
      origin,
      contract.destination,
      contract.destination,
      rng,
      ctx,
      events,
      deedSource,
    )
  ) {
    // N11 · The leg that ended in a wreck, in the player's own interrupted-jump
    // shape (`actions/travel.ts`, the interdiction branch): no arrival, so
    // `success: false` — which is why it matches none of the four TravelEvent deeds,
    // all of which require `success: true`.
    deedSource.push({
      type: 'TravelEvent',
      characterId: npc.id,
      origin,
      destination: contract.destination,
      fuelUsed: fuelCost,
      success: false,
      interrupted: true,
    });
    // The job was taken off the board even though it was never delivered — the
    // pool is debited on the CLAIM, not on the payout, which is why a captain
    // lost with the cargo aboard still thins the port they signed at.
    return {
      action: {
        type: 'Trade',
        details: `was lost hauling ${cargoName} to ${systemName(contract.destination)}`,
      },
      claimedContractIndex,
      claimedFromPool,
    };
  }
  // N11 · THE JUMP ARRIVED. One `TravelEvent` per jump actually taken, in
  // `actions/travel.ts`'s arrival shape. Note the parity fact that makes
  // `success: true` correct even on a rough jump: since T-1605 an ORDINARY player
  // jump takes no pilot check and ALWAYS arrives, so a captain's failed
  // `rollNpcCheck('Travel')` costs extra fuel but is still an arrival. Reaches
  // `first_jump`, `road_regular`, `rimward_bound` and — evaluated against this
  // captain's own tank — `fuel_fumes_arrival`.
  deedSource.push({
    type: 'TravelEvent',
    characterId: npc.id,
    origin,
    destination: contract.destination,
    fuelUsed: fuelCost,
    success: true,
  });
  npc.credits += contract.payment;

  const result = rollNpcCheck(npc, profile, 'Trade', rng, events);
  // N11 · THE DELIVERY, emitted AFTER the check so no unresolved outcome is stamped
  // — the reverted attempt's defect #5 fixed at its root rather than by flipping a
  // flag. `success: true` is the honest value on two pieces of evidence:
  //
  //   (i) the PLAYER's delivery emits `success: true` whenever the payment lands
  //       (`actions/travel.ts`, the activeContract branch) — it is not gated on any
  //       check either, and the credit above has already landed here;
  //   (ii) this file's own ruling, forty lines up: the NPC Trade check "decides how
  //       CLEANLY the run went" and carries NO economic swing by design.
  //
  // Gating the deed on `result.success` would make `first_delivery` / `fat_manifest`
  // / `rim_runner` strictly HARDER for a captain than for the player — an exemption
  // in the other direction — and it would land that penalty on precisely the
  // low-TRADE poor captains N11's Disproves limb warns about. Recorded as a ruling
  // under N11 in `docs/NPC_REDESIGN.md`, not left as a silent code comment.
  deedSource.push({
    type: 'TradeEvent',
    characterId: npc.id,
    action: 'deliver-cargo',
    success: true,
    destination: contract.destination,
    cargoType: contract.cargoType,
    payment: contract.payment,
    actionDetails: `Delivered cargo! Earned ${contract.payment} credits.`,
  });
  if (result.success) {
    return {
      action: {
        type: 'Trade',
        details: `hauled ${cargoName} to ${systemName(contract.destination)} for ${contract.payment} credits`,
      },
      claimedContractIndex,
      claimedFromPool,
    };
  }
  return {
    action: {
      type: 'Trade',
      details: `delivered ${cargoName} to ${systemName(contract.destination)} for ${contract.payment} credits, but the run soured — a rough, costly haul`,
    },
    claimedContractIndex,
    claimedFromPool,
  };
}

function executeTravel(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
  /** N11 · The captain's LOCAL deed-source batch — see {@link resolveNpcDay}. */
  deedSource: GameEvent[],
): NpcAction {
  let options = NPC_SYSTEM_IDS.filter((id) => id !== npc.currentSystemId);

  // N4 · An explorer charts the rim rather than the core lanes. Note what this
  // costs them: `routeDangerFor` prices a rim destination as the dangerous lane it
  // is, so this preference BUYS the archetype its own mortality rate rather than
  // being free flavour — which is the half of N3's risk-allocation finding that
  // an intent weight alone cannot express.
  if (profile.archetype === 'explorer') {
    const rimOptions = options.filter((id) => STAR_SYSTEMS[id]?.isRim);
    if (rimOptions.length > 0) {
      options = rimOptions;
    }
  }

  const destination = options[Math.floor(rng.next() * options.length)];
  const fuelCost = npcJumpFuelCost(npc.ship, systemDistance(npc.currentSystemId, destination));
  refuelIfNeeded(npc, fuelCost, ctx.eraEvent);
  if (npc.ship.fuel < fuelCost) {
    return brokeIdle(npc, rng, ctx.day, events);
  }
  npc.ship.fuel -= fuelCost;
  const origin = npc.currentSystemId;
  npc.currentSystemId = destination;
  // N3 · The lane can be interdicted. A captain who loses the ship here is done —
  // no verb resolves, and their day ends with the wreck.
  if (
    resolveNpcEncounter(npc, profile, origin, destination, undefined, rng, ctx, events, deedSource)
  ) {
    // N11 · The wreck's leg, in the player's interrupted-jump shape. No arrival, so
    // `success: false` matches none of the TravelEvent deeds.
    deedSource.push({
      type: 'TravelEvent',
      characterId: npc.id,
      origin,
      destination,
      fuelUsed: fuelCost,
      success: false,
      interrupted: true,
    });
    return { type: 'Travel', details: `was lost on the run to ${systemName(destination)}` };
  }
  // A Travel (PILOT) check decides a clean jump vs a rough one (T-1201).
  const result = rollNpcCheck(npc, profile, 'Travel', rng, events);
  if (result.success) {
    // N11 · The arrival. Same shape and same reasoning as the Trade leg's jump: an
    // ordinary player jump always arrives (T-1605), so a captain's arrival is
    // `success: true` on the clean AND the rough branch — see the comment on the
    // rough branch below, which is the one where the parity fact does the work.
    deedSource.push({
      type: 'TravelEvent',
      characterId: npc.id,
      origin,
      destination,
      fuelUsed: fuelCost,
      success: true,
    });
    return { type: 'Travel', details: `jumped to ${systemName(destination)}` };
  }
  npc.ship.fuel = Math.max(0, npc.ship.fuel - NPC_TRAVEL_FAIL_EXTRA_FUEL);
  // N11 · A ROUGH JUMP IS STILL AN ARRIVAL, and this is where that matters. Since
  // T-1605 the player's ordinary jump takes no pilot check at all and cannot fail to
  // arrive; a captain's failed Travel check buys `NPC_TRAVEL_FAIL_EXTRA_FUEL` of
  // grief, not a cancelled jump. Marking it `success: false` would make the four
  // TravelEvent deeds harder for a captain than for the player. The extra burn is
  // subtracted FIRST, so `fuel_fumes_arrival` reads the tank the captain actually
  // limped in on.
  deedSource.push({
    type: 'TravelEvent',
    characterId: npc.id,
    origin,
    destination,
    fuelUsed: fuelCost + NPC_TRAVEL_FAIL_EXTRA_FUEL,
    success: true,
  });
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
  // N11 · THE CAPTAIN'S OWN DEED-SOURCE BATCH, and it is LOCAL ON PURPOSE — this is
  // the single most load-bearing structural decision in the step.
  //
  // `day.ts` pushes the `events` array this function returns into the same array it
  // later hands to the PLAYER's `evaluateDeeds`. So a captain's `TradeEvent` /
  // `TravelEvent` / `EncounterResolved` in `events` would earn the PLAYER
  // `first_delivery`, `road_regular`, `first_combat_win` and the rest. (Today's
  // isolation is accidental, not designed: `broker_shark` only escapes because it
  // requires `actionContext: 'haggle'` and NPC checks are tagged with
  // `NPC_CHECK_CONTEXT`.) The batch therefore stays here, is evaluated here, and is
  // discarded here.
  const deedSource: GameEvent[] = [];
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

  const profile = ALL_NPC_PROFILES.find((p) => p.id === updatedNpc.profileId);
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
  let claimedFromPool: number | undefined;

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
    const result = executeTrade(updatedNpc, profile, rng, ctx, events, deedSource);
    action = result.action;
    claimedContractIndex = result.claimedContractIndex;
    claimedFromPool = result.claimedFromPool;
  } else if (intent === 'Travel') {
    action = executeTravel(updatedNpc, profile, rng, ctx, events, deedSource);
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

  // 5. N11 · THE REGISTRY. Same position in the captain's turn as the player's dusk
  //    evaluation (`day.ts`, after the day's events are collected), through the SAME
  //    `accrueDeeds` the player goes through — same content `DEEDS`, same
  //    `RENOWN_DEED_THRESHOLDS`, same `rankForDeedCount`, same CONQUEROR ceiling.
  //    Draws no rng, which is what keeps the day-loop EVENT goldens byte-identical.
  //
  //    COST: `accrueDeeds` is O(sourceEvents x DEEDS) and never scans an event log —
  //    the historical count rides on `registry.matchCounts`. A captain's batch is at
  //    most four events against the 44 shipped deeds, and an Idle / Patrol / Socialize day emits
  //    none at all, so `accrueDeeds`'s empty-batch early return makes those days free.
  //    That is what fits thirty captains inside the ~40 ms/day envelope N0 bought.
  //
  //    THE RETURNED EVENTS ARE DELIBERATELY DISCARDED, and that is a recorded scope
  //    boundary rather than a silent drop. `DeedEarned`, `RenownRankUp` and the
  //    rank-citation `WireEntry` are PLAYER-FACING records with no actor field: put a
  //    captain's on the wire and it renders as the player's own deed and reaches the
  //    achievement path. The durable record of a captain's standing is the registry
  //    this call writes; SURFACING it (the daily boast) is N6/N14's job, and it needs
  //    an actor-tagged event shape that does not exist yet.
  //
  //    OWED, AND NAMED SO IT IS NOT MISTAKEN FOR DONE: "careers survived" — the third
  //    source N11 lists — is UNSOURCED. Content ships no survival/day/career-triggered
  //    deed, so sourcing it means AUTHORING a new player-facing content deed, which
  //    moves `rulesFingerprint` and owes its own capstone. An NPC-only deed would be
  //    the second deed table this step exists to prevent. Likewise `considerRefit` /
  //    `fillHold` emit no `ShipyardEvent`, so `yard_rat` / `cargo_expansion` do not
  //    accrue — the cheapest next widening lever if T-023 measures the fighter and
  //    explorer floors at zero, to be PROPOSED to the owner rather than slipped in.
  //
  //    THIS IS THE WRITE SITE for `NpcState.registry`: the captain record is passed
  //    as the actor itself (no wrapper — see `DeedActor`), so `accrueDeeds` pushes
  //    onto `updatedNpc.registry.earned`, updates `updatedNpc.registry.matchCounts`
  //    and re-derives `updatedNpc.registry.renownRank` in place on this captain.
  accrueDeeds(updatedNpc, deedSource, {
    day: ctx.day,
    conquerorLocked: demoLocked(ctx, 'conqueror'),
  });

  updatedNpc.lastAction = action;

  events.push({
    type: 'NpcAction',
    npcId: updatedNpc.id,
    actionDetails: action.details,
  });

  return { npc: updatedNpc, events, claimedContractIndex, claimedFromPool };
}
