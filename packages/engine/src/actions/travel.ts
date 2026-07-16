import {
  ANONYMOUS_INTERCEPTORS,
  AnonymousInterceptorKind,
  CLOAK_ENCOUNTER_MULTIPLIER,
  COLLECTION_ENCOUNTER_MULTIPLIER,
  INTERCEPT_FRIEND_WEIGHT,
  INTERCEPT_GRUDGE_WEIGHT,
  INTERCEPT_MIN_WEIGHT,
  NPC_PROFILES,
  ROUTE_DANGER_CHANCE,
  RouteDangerLevel,
  SYSTEM_DANGER_LEVELS,
  distance as systemDistance,
  Stat,
} from '@spacerquest/content';
import {
  EncounterInterceptorState,
  EncounterState,
  GameEvent,
  GameState,
  PlayerAction,
} from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';
import { jumpFuelCost } from '../economy.js';
import { eraDangerDelta } from '../era.js';
import { navBonus } from '../components.js';
import { guildEncounterMultiplier } from '../guild.js';
import { applyPatrolContrabandScan } from './patrol.js';

function clampDanger(value: number): RouteDangerLevel {
  return Math.max(1, Math.min(5, value)) as RouteDangerLevel;
}

/** Chart every system the spacer personally arrives at, exactly once. This is
 *  the persistent knowledge namespace that survives death (T-108) and that
 *  T-111 will extend with Signal fragments. Idempotent: a revisit is a no-op. */
function recordVisitedSystem(state: GameState, systemId: number): void {
  if (!state.player.charts.visitedSystemIds.includes(systemId)) {
    state.player.charts.visitedSystemIds.push(systemId);
  }
}

function routeKind(origin: number, destination: number): 'core' | 'rim' | 'andromeda' | 'special' {
  if (origin >= 27 || destination >= 27) return 'special';
  if ((origin >= 21 && origin <= 26) || (destination >= 21 && destination <= 26)) {
    return 'andromeda';
  }
  if ((origin >= 15 && origin <= 20) || (destination >= 15 && destination <= 20)) {
    return 'rim';
  }
  return 'core';
}

function allowedAnonymousKinds(origin: number, destination: number): AnonymousInterceptorKind[] {
  const kind = routeKind(origin, destination);
  if (kind === 'core') return ['PIRATE', 'PATROL', 'BRIGAND'];
  // T-1101: Reptiloids re-homed onto the rim frontier — the reachable lane the
  // player actually flies. They previously spawned ONLY on Andromeda (21–26) and
  // special (27–28) routes, which §10 seals off, so the destination gate would
  // have made them unreachable. Andromeda stays REPTILOID-only below (still
  // exercised headlessly by the matchmaking sweep).
  if (kind === 'rim') return ['RIM_PIRATE', 'PIRATE', 'BRIGAND', 'REPTILOID'];
  if (kind === 'andromeda') return ['REPTILOID'];
  return ['PIRATE', 'PATROL', 'RIM_PIRATE', 'BRIGAND', 'REPTILOID'];
}

/**
 * Pilot-check DC for a jump of the given route distance. The ONE authoritative
 * source for travel difficulty — the resolver rolls against it and the starmap
 * (T-304) previews it, so the number a player sees before committing is exactly
 * the number they are checked against. (Legacy math: DC 8 + floor(distance/2).)
 */
export function travelDc(routeDistance: number): number {
  return 8 + Math.floor(routeDistance / 2);
}

export function calculateRouteDanger(
  state: GameState,
  origin: number,
  destination: number,
): {
  routeDistance: number;
  routeDangerLevel: RouteDangerLevel;
  routeDangerChance: number;
} {
  const routeDistance = systemDistance(origin, destination);
  const baseDanger = Math.max(
    SYSTEM_DANGER_LEVELS[origin] ?? 1,
    SYSTEM_DANGER_LEVELS[destination] ?? 1,
  );
  const distanceBump = routeDistance >= 8 ? 1 : 0;
  const cargoBump = state.player.activeContract?.destination === destination ? 1 : 0;
  // T-107: an active era event (blockade, plague, patrol crackdown) shifts the
  // lane's danger. eraEvent rides on the passed-in state — no global read.
  const eraDelta = eraDangerDelta(state.eraEvent, origin, destination);
  const routeDangerLevel = clampDanger(baseDanger + distanceBump + cargoBump + eraDelta);
  return {
    routeDistance,
    routeDangerLevel,
    routeDangerChance: ROUTE_DANGER_CHANCE[routeDangerLevel],
  };
}

/** T-1401 · A previewed jump in REAL engine units — every number the starmap
 *  route read-out shows, read straight from the engine so the value shown is the
 *  value the resolver will use. Pure derivation; nothing here is persisted. */
export interface TravelPreview {
  /** The raw float route distance in the seed's x/y plane — NOT a rounded "jumps"
   *  integer. This is the honest unit; the UI's `jumpsBetween` fabricated a
   *  `Math.round(distance)` "jumps" count (format.ts ~L70) that no engine rule
   *  reads. */
  distance: number;
  /** Fuel this jump costs — `jumpFuelCost` against this route. */
  fuelCost: number;
  /** The exact pilot-check DC `resolveTravel` will roll against (`travelDc`). */
  dc: number;
  /** The route's danger level (`calculateRouteDanger().routeDangerLevel`). */
  dangerLevel: number;
  /** Whether the tank can cover the jump (`fuelCost <= ship.fuel`). */
  reachable: boolean;
}

/**
 * T-1401 · Engine-owned travel preview — the truth behind the UI's `routePreview`
 * (format.ts ~L125). Reads only existing engine functions (`distance`,
 * `jumpFuelCost`, `travelDc`, `calculateRouteDanger`), so it invents no rule and
 * can never disagree with `resolveTravel`. CONSUMER: T-1402, which makes
 * `routePreview` a thin pass-through and DELETES `jumpsBetween` (the fabricated
 * "jumps" count) — the preview now speaks in real distance, the unit the engine
 * actually uses.
 */
export function travelPreview(state: GameState, destination: number): TravelPreview {
  const origin = state.player.currentSystemId;
  const ship = state.player.ship;
  const routeDistance = systemDistance(origin, destination);
  const fuelCost = jumpFuelCost(ship.drives, routeDistance, ship.hasTransWarpDrive ?? false);
  return {
    distance: routeDistance,
    fuelCost,
    dc: travelDc(routeDistance),
    dangerLevel: calculateRouteDanger(state, origin, destination).routeDangerLevel,
    reachable: fuelCost <= ship.fuel,
  };
}

function chooseTargetTier(
  rng: SeededRng,
  playerTier: number,
  routeDangerLevel: RouteDangerLevel,
): RouteDangerLevel {
  const minTier = Math.max(1, playerTier - 1);
  const maxTier = Math.min(5, playerTier + 1);
  const lowBias = Math.max(0, 3 - routeDangerLevel);
  const highBias = Math.max(0, routeDangerLevel - 3);
  const weightedTiers: { tier: RouteDangerLevel; weight: number }[] = [];
  let totalWeight = 0;

  for (let tier = minTier; tier <= maxTier; tier += 1) {
    const weight = 1 + lowBias * (maxTier - tier) + highBias * (tier - minTier);
    weightedTiers.push({ tier: tier as RouteDangerLevel, weight });
    totalWeight += weight;
  }

  let roll = rng.next() * totalWeight;
  for (const weightedTier of weightedTiers) {
    roll -= weightedTier.weight;
    if (roll < 0) {
      return weightedTier.tier;
    }
  }

  const finalTier = weightedTiers[weightedTiers.length - 1];
  if (!finalTier) {
    throw new Error('No tier available for encounter selection');
  }
  return finalTier.tier;
}

function buildNamedCandidates(
  state: GameState,
  tier: RouteDangerLevel,
): EncounterInterceptorState[] {
  return state.npcs.flatMap((npc) => {
    const profile = NPC_PROFILES.find((candidate) => candidate.id === npc.profileId);
    if (!profile || profile.tier !== tier) return [];
    return [
      {
        id: npc.id,
        source: 'named' as const,
        name: npc.name,
        shipName: profile.shipName,
        profileId: profile.id,
        stats: profile.stats,
        tier: profile.tier,
        flaw: profile.flaw,
        flawDc: profile.flawDc,
      },
    ];
  });
}

function buildAnonymousCandidates(
  origin: number,
  destination: number,
  tier: RouteDangerLevel,
): EncounterInterceptorState[] {
  const kinds = allowedAnonymousKinds(origin, destination);
  return ANONYMOUS_INTERCEPTORS.filter(
    (interceptor) => interceptor.tier === tier && kinds.includes(interceptor.kind),
  ).map((interceptor) => ({
    id: interceptor.id,
    source: 'anonymous' as const,
    name: interceptor.name,
    shipName: interceptor.shipName,
    shipClass: interceptor.shipClass,
    homeSystem: interceptor.homeSystem,
    kind: interceptor.kind,
    rosterIndex: interceptor.rosterIndex,
    stats: interceptor.stats,
    tier: interceptor.tier,
  }));
}

/**
 * Disposition-weighted pick over a homogeneous (single-tier) candidate pool.
 *
 * T-1204 (PRD §6 "grudges hunt you, friends pass you by") — FOUNDATION DIVERGENCE:
 * foundation (f2f95fa9) has no per-NPC player disposition, so its interceptor
 * choice carried no grudge term; this weighting is a T-1204 addition. A named
 * candidate the player has WRONGED (negative disposition) is more likely to be
 * the interceptor; one the player has WON OVER (positive) less likely. Anonymous
 * candidates — and any named candidate at neutral 0 — weight exactly 1, so a pool
 * with no non-neutral dispositions is byte-identical to the old uniform
 * `Math.floor(rng.next() * n)` pick (same single rng draw, same index). The
 * weighting only reorders WITHIN the tier pool the caller already chose, so the
 * tier-band matchmaking invariant (the 500-seed sweep) is untouched.
 */
function chooseWeighted(
  state: GameState,
  rng: SeededRng,
  candidates: EncounterInterceptorState[],
): EncounterInterceptorState {
  if (candidates.length === 0) {
    throw new Error('Cannot choose from an empty encounter candidate list');
  }

  const weights = candidates.map((candidate) => {
    if (candidate.source !== 'named') return 1;
    const disposition = state.npcs.find((npc) => npc.id === candidate.id)?.disposition ?? 0;
    if (disposition < 0) return 1 + INTERCEPT_GRUDGE_WEIGHT * -disposition;
    if (disposition > 0) {
      return Math.max(INTERCEPT_MIN_WEIGHT, 1 - INTERCEPT_FRIEND_WEIGHT * disposition);
    }
    return 1;
  });

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

export function selectEncounterInterceptor(
  state: GameState,
  origin: number,
  destination: number,
  routeDangerLevel: RouteDangerLevel,
  rng: SeededRng,
): EncounterInterceptorState {
  const playerTier = state.player.tier ?? 1;
  const minTier = Math.max(1, playerTier - 1);
  const maxTier = Math.min(5, playerTier + 1);
  const targetTier = chooseTargetTier(rng, playerTier, routeDangerLevel);
  const namedCandidates = buildNamedCandidates(state, targetTier);
  const anonymousCandidates = buildAnonymousCandidates(origin, destination, targetTier);

  if (namedCandidates.length > 0 || anonymousCandidates.length > 0) {
    const preferNamed = namedCandidates.length > 0 && rng.next() < 0.25;
    const preferred = preferNamed ? namedCandidates : anonymousCandidates;
    const fallback = preferNamed ? anonymousCandidates : namedCandidates;
    return chooseWeighted(state, rng, preferred.length > 0 ? preferred : fallback);
  }

  const bandCandidates: EncounterInterceptorState[] = [];
  for (let tier = minTier; tier <= maxTier; tier += 1) {
    bandCandidates.push(
      ...buildNamedCandidates(state, tier as RouteDangerLevel),
      ...buildAnonymousCandidates(origin, destination, tier as RouteDangerLevel),
    );
  }

  if (bandCandidates.length === 0) {
    throw new Error('No encounter interceptors available for tier band');
  }

  return chooseWeighted(state, rng, bandCandidates);
}

// T-1103 · Tour One is gentler than the open galaxy. PRD-REIMAGINED §"Tour One"
// (line 73) authors the onboarding arc around exactly "one full combat", and the
// standing constraint is that PRD wins over foundation numbers — so foundation's
// full 0.30/0.40 encounter chance is the VETERAN-game rate, damped during the
// TOUR_ONE era so a fresh spacer racing the day-30 marker isn't interdicted on
// every loaded run. This is an era divergence beyond the route-danger scaling
// (constraint 5): it is INTERIM at 0.5× — enough to keep the authored Tour One
// combats firing (the combat/onboarding fixtures) while restoring a competent
// trader's debt-clear rate — and T-1603 owns the canonical Tour One target.
// READER: the reader is this function; the multiplier rides on state.era, which
// day.ts flips TOUR_ONE→VETERAN at the day-30 resolution. No new GameState field.
const TOUR_ONE_ENCOUNTER_MULTIPLIER = 0.5;

export function generateEncounter(
  state: GameState,
  origin: number,
  destination: number,
  fuelUsed: number,
  rng: SeededRng,
): EncounterState | null {
  const { routeDangerLevel, routeDangerChance } = calculateRouteDanger(state, origin, destination);
  let effectiveChance =
    state.era === 'TOUR_ONE'
      ? routeDangerChance * TOUR_ONE_ENCOUNTER_MULTIPLIER
      : routeDangerChance;
  // T-1206 CLOAKER → realized-encounter-rate reader. This function is the named
  // reader of `hasCloaker`; a fitted Morton's Cloaking Device damps the realized
  // encounter chance by CLOAK_ENCOUNTER_MULTIPLIER (content). FOUNDATION DIVERGENCE
  // — `attemptCloakDuringTravel` SKIPPED the fight outright for cargo/smuggling
  // runs; the engine instead damps the rate so a cloaked ship slips past MORE jumps
  // while some interdictions still fire (PRD wins on numbers). The encounter draw
  // below stays exactly one `rng.next()`, so a ship WITHOUT the cloaker (the
  // default) is byte-identical: every existing encounter/travel golden is unmoved.
  if (state.player.ship.hasCloaker) {
    effectiveChance *= CLOAK_ENCOUNTER_MULTIPLIER;
  }
  // T-1304 · Penny Wise collection-flag reader. This function is the named reader
  // of `loan.status`: a DEFAULTED loan raises the realized encounter chance by
  // COLLECTION_ENCOUNTER_MULTIPLIER (>1) — "the collectors are looking for you",
  // the dangerous mirror of the CLOAKER damp above. FOUNDATION-ORIGINAL: foundation
  // has no lending mechanic, so both the flag and this reader are a T-1304 addition.
  // The multiply is GUARDED behind the defaulted check and the encounter draw below
  // stays exactly one `rng.next()`, so a non-defaulted state (every existing golden)
  // is byte-identical. Clamped to 1 so a stacked multiplier can't exceed certainty.
  if (state.player.loan?.status === 'defaulted') {
    effectiveChance = Math.min(1, effectiveChance * COLLECTION_ENCOUNTER_MULTIPLIER);
  }
  // T-1309 · Port-clerk flag reader (patrol/collection attention). This function is
  // the named reader of `guild.debt-flagged` (set by the day-30 UNPAID branch,
  // day.ts): a flagged captain — "your name on every board, and the patrols hear
  // about it" — draws interdictions more often, scaled by the flag's stored
  // guild-standing severity (guildEncounterMultiplier). This is the dangerous
  // sibling of the loan-collection multiply above. GUARDED on the flag (> 0) and
  // the encounter draw below stays exactly one `rng.next()`, so a clean captain
  // (flag absent — every existing golden) is byte-identical. Clamped to 1 so a
  // stacked multiplier can't exceed certainty.
  const guildFlag = Number(state.flags['guild.debt-flagged'] ?? 0);
  if (guildFlag > 0) {
    effectiveChance = Math.min(1, effectiveChance * guildEncounterMultiplier(guildFlag));
  }
  const encounterRoll = rng.next();
  if (encounterRoll >= effectiveChance) {
    return null;
  }

  const interceptor = selectEncounterInterceptor(state, origin, destination, routeDangerLevel, rng);
  return {
    id: `enc-${state.day}-${state.dayEventCount}-${origin}-${destination}-${interceptor.id}`,
    pendingTravel: { origin, destination, fuelUsed },
    interceptor,
    routeDangerLevel,
    routeDangerChance,
    encounterRoll,
    round: 1,
    // Toughness scales with tier (1-5): a tier-3 interceptor soaks three volleys.
    enemyHull: interceptor.tier,
  };
}

export function completePendingTravel(
  state: GameState,
  encounter: EncounterState,
  events: GameEvent[],
): void {
  const { origin, destination } = encounter.pendingTravel;
  state.player.currentSystemId = destination;
  recordVisitedSystem(state, destination);
  events.push({
    type: 'TravelEvent',
    characterId: 'player',
    origin,
    destination,
    fuelUsed: 0,
    success: true,
    resumedFromEncounterId: encounter.id,
  });

  if (state.player.activeContract && state.player.activeContract.destination === destination) {
    const contract = state.player.activeContract;
    const payment = contract.payment;
    state.player.credits += payment;
    events.push({
      type: 'TradeEvent',
      characterId: 'player',
      action: 'deliver-cargo',
      success: true,
      destination: contract.destination,
      cargoType: contract.cargoType,
      payment,
      actionDetails: `Delivered cargo! Earned ${payment} credits.`,
    });
    state.player.activeContract = null;
  }
}

export function resolveTravel(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Travel' }>,
  rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;

  // Encounter gating lives in day.ts applyPlayerAction (the only runtime caller),
  // which emits a typed ActionBlocked event before this resolver is reached.
  if (action.spendDie === undefined) {
    throw new Error('Must spend a die to travel');
  }

  const { die, hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
  nextState.player.dawnHand = hand;

  const origin = nextState.player.currentSystemId;
  const destination = action.destinationId;
  const routeDistance = systemDistance(origin, destination);

  // Fuel cost through the ONE shared travel-cost function (legacy math) —
  // the same mathematics prices NPC jumps (T-106).
  const fuelRequired = jumpFuelCost(
    nextState.player.ship.drives,
    routeDistance,
    nextState.player.ship.hasTransWarpDrive || false,
  );

  // Pilot check — DC scales with distance through the authoritative helper so
  // the starmap (T-304) can preview the exact DC the resolver will roll against.
  const dc = travelDc(routeDistance);

  // T-1205 navigation → pilot check: a fresh junker's navigation (score 10) adds
  // 0, so the starter-ship goldens are unchanged; upgraded nav adds accuracy.
  // FOUNDATION: "damaged nav causes course errors" → an additive PILOT bonus.
  // READER OF `navigation`: this line (via components.ts navBonus).
  const result = check(
    die,
    nextState.player.stats[Stat.PILOT] + navBonus(nextState.player.ship),
    dc,
  );
  events.push({
    type: 'StatCheck',
    actor: 'Player',
    stat: Stat.PILOT,
    dc,
    result,
  });

  if (nextState.player.ship.fuel >= fuelRequired) {
    nextState.player.ship.fuel -= fuelRequired;

    // T-1103 · Encounter trigger repair. The encounter roll is now DECOUPLED
    // from the pilot check: a jump is dangerous whether the pilot check passed
    // or was botched. Previously generateEncounter fired only inside the
    // `result.success` branch, so a failed check was perfectly safe — backwards
    // from the fiction, where a fumbled jump is exactly when you drop out of the
    // warp lane into a waiting interceptor. generateEncounter is now called ONCE,
    // unconditionally, and its outcome decides the branch. On the success path
    // rng consumption is byte-identical to before (same call site, same order);
    // only the failure path newly consumes an encounter roll.
    const encounter = generateEncounter(nextState, origin, destination, fuelRequired, rng);

    if (encounter) {
      // The interdiction interrupts the jump regardless of the pilot check.
      //
      // DESIGN CALL (deliberate, commented per Standing-constraint 5): on a
      // BOTCHED-but-intercepted jump, surviving the fight via completePendingTravel
      // (combat.ts on a fight/talk win) still carries the player to `destination`
      // — the interdiction resolution semantics are identical for the passed and
      // failed check, and this adds NO new GameState field. The alternative —
      // gating arrival on `result.success` via a `pendingTravel.arrives` flag —
      // would touch PendingTravelState/schema/completePendingTravel plus a
      // save-migration + round-trip test for a marginal fiction gain, so it is
      // intentionally out of scope for T-1103. The fictional fix required (a
      // botched jump is now DANGEROUS) is fully met by the decoupling above.
      nextState.encounter = encounter;
      events.push({
        type: 'TravelEvent',
        characterId: 'player',
        origin,
        destination,
        fuelUsed: fuelRequired,
        success: false,
        interrupted: true,
      });
      events.push({ type: 'EncounterStarted', encounter });
      // T-1305 · fiction order (interdiction → scan): a PATROL that interdicts a
      // player carrying illicit cargo rolls a GUILE scan (PRD §7.2). The added
      // rng.d20() fires ONLY for PATROL + carrying — a scenario no pre-T-1305
      // replay golden exercises (contraband contracts are T-1104 and the
      // pod-through-patrol path is new), so no existing golden shifts. If a
      // future golden trips on it, regenerate it (never suppress).
      applyPatrolContrabandScan(nextState, encounter, rng, events);
    } else if (result.success) {
      nextState.player.currentSystemId = destination;
      recordVisitedSystem(nextState, destination);
      events.push({
        type: 'TravelEvent',
        characterId: 'player',
        origin,
        destination,
        fuelUsed: fuelRequired,
        success: true,
      });

      // Check if they completed a contract
      if (
        nextState.player.activeContract &&
        nextState.player.activeContract.destination === destination
      ) {
        const contract = nextState.player.activeContract;
        const payment = contract.payment;
        nextState.player.credits += payment;
        events.push({
          type: 'TradeEvent',
          characterId: 'player',
          action: 'deliver-cargo',
          success: true,
          destination: contract.destination,
          cargoType: contract.cargoType,
          payment,
          actionDetails: `Delivered cargo! Earned ${payment} credits.`,
        });
        nextState.player.activeContract = null; // Clear contract
      }
    } else {
      // Failed pilot check, no encounter: nav malfunction, ship stays at origin.
      events.push({
        type: 'TravelEvent',
        characterId: 'player',
        origin,
        destination,
        fuelUsed: fuelRequired,
        success: false,
      });
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        kind: 'plain',
        message: `Player experienced a navigation malfunction en route to system ${destination}.`,
      });
    }
  } else {
    // Not enough fuel — T-1102 typed fail. The tank could not cover the
    // per-distance cost (a cross-map hop on a starter tank), so no fuel is spent
    // and the ship stays put. `insufficientFuel: true` distinguishes this from a
    // failed nav check (which DOES burn fuel). READER: store.ts jump handler.
    events.push({
      type: 'TravelEvent',
      characterId: 'player',
      origin,
      destination,
      fuelUsed: 0,
      success: false,
      insufficientFuel: true,
    });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      kind: 'plain',
      message: `Player attempted jump to system ${destination} without enough fuel.`,
    });
  }

  return { state: nextState, events };
}
